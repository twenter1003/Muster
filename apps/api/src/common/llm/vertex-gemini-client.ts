import { Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { ApiException } from '../errors/api.exception';
import { ErrorCode } from '../errors/error-codes';
import type { GeminiClient, GeminiGenerateParams } from './gemini-client';
import { extractText } from './http-gemini-client';
import { executeWithRetry, RetryableLlmError } from './retry';

/**
 * Vertex AI로 Gemini를 부른다. AI Studio API 키를 쓰지 않는 이유는 두 가지다:
 *
 * 1. `GEMINI_API_KEY`를 배포 환경에 두지 않은 곳(예: 이 프로젝트의 Cloud Run 배포)에서도
 *    동작해야 한다.
 * 2. Vertex AI는 ADC로 인증하므로 **보관할 키 자체가 없다** — 설계서 Part 2 §6.2의
 *    "평문 자격증명을 두지 않는다"에 더 맞고, GCS에 이미 쓰는 자격증명을 그대로 쓴다.
 */
export class VertexGeminiClient implements GeminiClient {
  private readonly logger = new Logger(VertexGeminiClient.name);
  private readonly auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  constructor(
    private readonly projectId: string,
    private readonly location: string,
    private readonly model: string,
  ) {}

  async generate(params: GeminiGenerateParams): Promise<string> {
    const url =
      `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}` +
      `/locations/${this.location}/publishers/google/models/${this.model}:generateContent`;

    const generationConfig: Record<string, unknown> = {};
    if (params.responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = params.responseSchema;
    }
    if (params.temperature !== undefined) generationConfig.temperature = params.temperature;

    const runCall = async (signal: AbortSignal): Promise<string> => {
      const client = await this.auth.getClient();
      const token = await client.getAccessToken();
      if (!token.token) {
        throw new ApiException(
          ErrorCode.INTERNAL,
          'GCP 자격증명을 가져오지 못했습니다. gcloud auth application-default login이 필요합니다.',
          503,
        );
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(params.systemInstruction
            ? { systemInstruction: { parts: [{ text: params.systemInstruction }] } }
            : {}),
          contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
          ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
        }),
        signal,
      });

      if (!res.ok) {
        // 원문에는 프로젝트 구조나 할당량 정보가 섞일 수 있어 로그에만 남긴다.
        const detail = await res.text().catch(() => '');
        this.logger.warn(`Vertex AI ${res.status}: ${detail.slice(0, 500)}`);

        if (res.status === 401 || res.status === 403) {
          throw new ApiException(
            ErrorCode.INTERNAL,
            'Vertex AI 접근이 거부되었습니다. aiplatform.googleapis.com 활성화와 ADC 권한을 확인해 주세요.',
            503,
          );
        }
        if (res.status === 429) {
          throw new RetryableLlmError('LLM 호출 한도를 초과했습니다.', 429);
        }
        if (res.status >= 500) {
          throw new RetryableLlmError(`Vertex AI 서버 오류 (${res.status})`, res.status);
        }
        throw new ApiException(ErrorCode.INTERNAL, 'LLM 호출에 실패했습니다.', 502);
      }

      return extractText(await res.json());
    };

    try {
      return await executeWithRetry(runCall, {
        maxRetries: 3,
        timeoutMs: 30000,
        onRetry: (attempt, err) => {
          this.logger.warn(
            `Vertex AI 일시적 오류로 재시도 중 (${attempt}/3): ${(err as Error)?.message ?? err}`,
          );
        },
      });
    } catch (err) {
      if (err instanceof ApiException) {
        throw err;
      }
      if (err instanceof RetryableLlmError && err.status === 429) {
        throw new ApiException(
          ErrorCode.INTERNAL,
          'LLM 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
          503,
        );
      }
      throw new ApiException(ErrorCode.INTERNAL, 'LLM 호출에 실패했습니다.', 502);
    }
  }
}
