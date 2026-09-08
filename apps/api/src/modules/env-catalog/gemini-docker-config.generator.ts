import { Logger } from '@nestjs/common';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type {
  DockerConfigGenerator,
  GeneratedDockerConfig,
  GenerateParams,
} from './docker-config-generator';

/**
 * Gemini API — Interactions (`POST /v1beta/interactions`).
 *
 * generateContent가 아니라 Interactions를 쓴다. Interactions는 2026년 6월 GA로
 * Gemini의 기본 인터페이스가 되었고 generateContent는 레거시로 물러났다.
 * 새 기능이 Interactions에만 실리므로 지금 시작하는 코드가 옛 경로로 들어갈 이유가 없다.
 */
const INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/**
 * LLM에 넘길 지시. Policy Gate가 뒤에서 막아주지만, 애초에 위험한 설정을 덜 만들게
 * 유도하는 편이 낫다 — 막힌 구성은 사용자에게 그냥 실패로 보인다.
 */
const SYSTEM_INSTRUCTION = `당신은 도커 설정을 생성한다.

지켜야 할 규칙:
- privileged 모드, 호스트 루트 마운트(/:), --net=host 를 쓰지 않는다.
- 베이스 이미지는 태그를 고정한다. latest 를 쓰지 않는다.
- 컨테이너를 root로 실행하지 않는다. USER 를 지정한다.
- compose 서비스에는 메모리·CPU 제한을 명시한다.
- 잘 알려진 관리 포트(22, 5432, 6379 등)를 호스트에 노출하지 않는다.
- 시크릿을 이미지에 굽지 않는다.
- rationale은 도커를 모르는 사람도 이해할 수 있는 한국어로 쓴다.`;

/**
 * 출력 스키마를 서버에 넘겨 형식을 강제한다.
 *
 * 우리가 자유 텍스트를 잘라내면 그 잘라내는 규칙이 곧 파서가 되고, 모델이 형식을
 * 조금 바꿀 때마다 조용히 깨진다. 형식 보증은 API 쪽에 맡긴다.
 *
 * Interactions의 `response_format`은 스키마를 **그대로** 받는다.
 * generateContent 시절의 `{type:'json_schema', json_schema:{...}}` 래핑이 아니다.
 */
const RESPONSE_FORMAT = {
  type: 'object',
  properties: {
    dockerfile: { type: 'string' },
    compose: { type: 'string' },
    rationale: { type: 'string' },
  },
  required: ['dockerfile', 'rationale'],
} as const;

export class GeminiDockerConfigGenerator implements DockerConfigGenerator {
  private readonly logger = new Logger(GeminiDockerConfigGenerator.name);

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generate(params: GenerateParams): Promise<GeneratedDockerConfig> {
    const res = await fetch(INTERACTIONS_ENDPOINT, {
      method: 'POST',
      // 키는 헤더로 보낸다. URL은 로그·프록시·리퍼러에 남는다.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        model: this.model,
        system_instruction: SYSTEM_INSTRUCTION,
        // input은 타입이 붙은 값이다. contents/parts 구조는 generateContent 쪽이다.
        input: { type: 'text', text: buildPrompt(params) },
        response_format: RESPONSE_FORMAT,
      }),
    });

    if (!res.ok) {
      // 원문에는 키 일부나 할당량 정보가 섞일 수 있어 로그에만 남긴다.
      const detail = await res.text().catch(() => '');
      this.logger.warn(`Gemini Interactions ${res.status}: ${detail.slice(0, 500)}`);

      if (res.status === 400 || res.status === 401 || res.status === 403) {
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

    return parseInteraction(await res.json());
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
    lines.push(
      '',
      '이 템플릿 프리셋을 출발점으로 삼는다:',
      JSON.stringify(params.templatePreset, null, 2),
    );
  }

  return lines.join('\n');
}

/**
 * Interactions 응답에서 설정을 꺼낸다.
 *
 * 응답은 `steps` 배열이다(generateContent의 `candidates`가 아니다). 모델 출력 단계의
 * 텍스트를 찾아 파싱한다.
 *
 * 스키마를 강제했더라도 필수 필드를 다시 확인한다. 여기서 통과시키면 dockerfile이
 * 비어 있는 채로 Policy Gate에 넘어가고, 검사 도구는 빈 파일을 보고 "위반 없음"이라
 * 답한다 — 아무것도 검사하지 않은 구성이 policy_passed가 되는 경로다.
 */
export function parseInteraction(body: unknown): GeneratedDockerConfig {
  const steps = (
    body as {
      steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
    }
  )?.steps;

  if (!Array.isArray(steps)) {
    throw new ApiException(ErrorCode.INTERNAL, 'LLM 응답에 steps가 없습니다.', 502);
  }

  // steps에는 model_output 말고 thought 같은 중간 단계도 섞인다. 최종 답만 고른다 —
  // thought를 파싱하려 들면 JSON이 아니라서 조용히 실패한다.
  const text = steps
    .filter((s) => s.type === 'model_output')
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text)
    .join('');

  if (!text) {
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
