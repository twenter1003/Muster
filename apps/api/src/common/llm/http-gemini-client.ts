import { Logger } from '@nestjs/common';
import { ApiException } from '../errors/api.exception';
import { ErrorCode } from '../errors/error-codes';
import type { GeminiClient, GeminiGenerateParams } from './gemini-client';
import { executeWithRetry, RetryableLlmError } from './retry';

/**
 * Gemini API — `generateContent` (`POST /v1beta/models/{model}:generateContent`).
 *
 * 이 저장소에는 한때 존재하지 않는 `/v1beta/interactions` 엔드포인트를 쓰는 코드가 있었다
 * (env-catalog의 옛 `GeminiDockerConfigGenerator` — 코드 주석이 "2026-06 GA로 generateContent를
 * 대체했다"고 주장했지만 근거를 확인할 수 없었고, `generateContent`가 여전히 실제 엔드포인트다).
 * 그 사고를 반복하지 않기 위해 이 클라이언트 하나만 실제 HTTP 모양을 알고, 나머지 코드는
 * 전부 `GeminiClient` 인터페이스 뒤에서만 이 API를 만난다.
 */
export class HttpGeminiClient implements GeminiClient {
  private readonly logger = new Logger(HttpGeminiClient.name);

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generate(params: GeminiGenerateParams): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;

    const generationConfig: Record<string, unknown> = {};
    if (params.responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = params.responseSchema;
    }
    if (params.temperature !== undefined) generationConfig.temperature = params.temperature;

    const runCall = async (signal: AbortSignal): Promise<string> => {
      const res = await fetch(url, {
        method: 'POST',
        // 키는 헤더로 보낸다. URL은 로그·프록시·리퍼러에 남는다.
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
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
        // 원문에는 키 일부나 할당량 정보가 섞일 수 있어 로그에만 남긴다.
        const detail = await res.text().catch(() => '');
        this.logger.warn(`Gemini generateContent ${res.status}: ${detail.slice(0, 500)}`);

        if (res.status === 400 || res.status === 401 || res.status === 403) {
          throw new ApiException(
            ErrorCode.INTERNAL,
            'LLM 자격증명이 거부되었습니다. GEMINI_API_KEY를 확인해 주세요.',
            503,
          );
        }
        if (res.status === 429) {
          throw new RetryableLlmError('LLM 호출 한도를 초과했습니다.', 429);
        }
        if (res.status >= 500) {
          throw new RetryableLlmError(`Gemini 서버 오류 (${res.status})`, res.status);
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
            `Gemini API 일시적 오류로 재시도 중 (${attempt}/3): ${(err as Error)?.message ?? err}`,
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

/** Vertex 경로와 같은 응답 모양이라 파싱 로직도 같다 — `candidates[0].content.parts[0].text`. */
export function extractText(body: unknown): string {
  const text = (body as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    ?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== 'string') {
    throw new ApiException(ErrorCode.INTERNAL, 'LLM 응답에 내용이 없습니다.', 502);
  }
  return text;
}
