import { Logger } from '@nestjs/common';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type {
  DockerConfigGenerator,
  GeneratedDockerConfig,
  GenerateParams,
} from './docker-config-generator';

/** 공식 SDK를 얹지 않고 REST를 직접 부른다 — 호출이 하나뿐이고 의존성을 늘릴 이유가 없다. */
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * LLM에 넘길 지시. Policy Gate가 뒤에서 막아주지만, 애초에 위험한 설정을 덜 만들게
 * 유도하는 편이 낫다 — 막힌 구성은 사용자에게 그냥 실패로 보인다.
 *
 * 응답을 JSON으로 강제하는 것은 파싱을 위해서가 아니라 **경계를 위해서**다.
 * 자유 텍스트를 받아 우리가 잘라내면 잘라내는 규칙이 곧 파서가 되고, 모델이 형식을
 * 조금 바꿀 때마다 조용히 깨진다.
 */
const SYSTEM_INSTRUCTION = `당신은 도커 설정을 생성한다. 반드시 아래 JSON 스키마로만 답한다.

{
  "dockerfile": "Dockerfile 전문(문자열)",
  "compose": "docker-compose.yml 전문(문자열) 또는 null",
  "rationale": "이 구성이 무엇을 하는지, 어떤 위험이 있는지 도커를 모르는 사람도 이해할 수 있는 한국어 설명"
}

지켜야 할 규칙:
- privileged 모드, 호스트 루트 마운트(/:), --net=host 를 쓰지 않는다.
- 베이스 이미지는 태그를 고정한다. latest 를 쓰지 않는다.
- 컨테이너를 root로 실행하지 않는다. USER 를 지정한다.
- compose 서비스에는 메모리·CPU 제한을 명시한다.
- 시크릿을 이미지에 굽지 않는다.`;

export class GeminiDockerConfigGenerator implements DockerConfigGenerator {
  private readonly logger = new Logger(GeminiDockerConfigGenerator.name);

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generate(params: GenerateParams): Promise<GeneratedDockerConfig> {
    const res = await fetch(
      `${GEMINI_ENDPOINT}/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: buildPrompt(params) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            // 도커 설정은 창의성이 필요한 산출물이 아니다. 같은 입력에는 같은 출력이 낫다.
            temperature: 0.1,
          },
        }),
      },
    );

    if (!res.ok) {
      // 원문에는 키 일부나 할당량 정보가 섞일 수 있어 로그에만 남긴다.
      const detail = await res.text().catch(() => '');
      this.logger.warn(`Gemini ${res.status}: ${detail.slice(0, 500)}`);

      if (res.status === 400 || res.status === 403) {
        throw new ApiException(
          ErrorCode.INTERNAL,
          'LLM 자격증명이 거부되었습니다. GEMINI_API_KEY를 확인해 주세요.',
          503,
        );
      }
      if (res.status === 429) {
        throw new ApiException(
          ErrorCode.INTERNAL,
          'LLM 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
          503,
        );
      }
      throw new ApiException(ErrorCode.INTERNAL, '도커 설정 생성에 실패했습니다.', 502);
    }

    return parseResponse(await res.json());
  }
}

function buildPrompt(params: GenerateParams): string {
  const lines = [
    params.inputMode === 'natural_language'
      ? '사용자가 자연어로 기술스택을 설명했다:'
      : '사용자가 UI 폼으로 기술스택을 지정했다:',
    JSON.stringify(params.stackInput, null, 2),
  ];

  if (params.templatePreset) {
    lines.push('', '이 템플릿 프리셋을 출발점으로 삼는다:', JSON.stringify(params.templatePreset, null, 2));
  }

  return lines.join('\n');
}

/**
 * 응답에서 설정을 꺼낸다.
 *
 * 모델이 스키마를 지키지 않을 수 있으므로 필수 필드를 직접 확인한다. 여기서 통과시키면
 * dockerfile이 undefined인 채로 Policy Gate에 넘어가고, 검사 도구는 빈 파일을 보고
 * "위반 없음"이라 답한다 — 아무것도 검사하지 않은 구성이 policy_passed가 되는 경로다.
 */
function parseResponse(body: unknown): GeneratedDockerConfig {
  const text = (body as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    ?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== 'string') {
    throw new ApiException(ErrorCode.INTERNAL, 'LLM 응답에 내용이 없습니다.', 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiException(ErrorCode.INTERNAL, 'LLM 응답을 해석할 수 없습니다.', 502);
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.dockerfile !== 'string' || !obj.dockerfile.trim()) {
    throw new ApiException(ErrorCode.INTERNAL, 'LLM 응답에 Dockerfile이 없습니다.', 502);
  }

  return {
    dockerfile: obj.dockerfile,
    compose: typeof obj.compose === 'string' && obj.compose.trim() ? obj.compose : null,
    rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
  };
}
