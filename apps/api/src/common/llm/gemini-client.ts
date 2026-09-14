/**
 * Gemini 호출 계약. `SecretStore`·`GitHubRepoClient`와 같은 이유로 인터페이스 뒤에 둔다 —
 * LLM 호출은 느리고 비결정적이라 단위 테스트에 실물을 쓰면 테스트가 그 성질을 그대로
 * 물려받는다.
 *
 * `generate`는 원문 텍스트만 돌려준다. JSON 파싱과 필수 필드 검증은 호출자 책임이다 —
 * `responseSchema`로 형식을 강제해도 모델이 스키마를 어길 수 있어(설계상 보증이지 강제가
 * 아니다), 여기서 파싱까지 떠안으면 호출자마다 다른 "필수 필드가 비었을 때" 처리를
 * 표현할 수 없다.
 */
export interface GeminiGenerateParams {
  /** 시스템 지시문. 모델에 역할·규칙을 준다. */
  systemInstruction?: string;
  prompt: string;
  /**
   * 있으면 JSON 구조화 출력을 요청한다 (OpenAPI 서브셋 JSON 스키마).
   * 없으면 자유 텍스트 그대로 돌아온다.
   */
  responseSchema?: Record<string, unknown>;
  /** 낮을수록 같은 입력에 같은 출력. 생략하면 모델 기본값. */
  temperature?: number;
}

export interface GeminiClient {
  generate(params: GeminiGenerateParams): Promise<string>;
}

export const GEMINI_CLIENT = Symbol('GEMINI_CLIENT');
