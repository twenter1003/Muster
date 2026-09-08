/**
 * LLM으로 Dockerfile/compose를 생성하는 계약 (설계서 Part 1 §3.2, Part 4 §5.2).
 *
 * 벤더는 Gemini다 — 플랫폼이 이미 GCP 단일 벤더라 LLM만 다른 곳에 두면 계정·과금이
 * 하나 더 늘어난다 (DESIGN_DRIFT.md 4번).
 *
 * 인터페이스로 두는 이유는 GitHubRepoClient·ObjectStorage와 같다: API 키 없이도
 * 상태 전이와 Policy Gate 플로우 전체를 검증할 수 있어야 한다. LLM 호출은 느리고
 * 비결정적이라 단위 테스트에 실물을 쓰면 테스트가 그 두 성질을 그대로 물려받는다.
 */
export interface GeneratedDockerConfig {
  /** Dockerfile 전문. */
  dockerfile: string;
  /** docker-compose.yml 전문. 단일 컨테이너면 null일 수 있다. */
  compose: string | null;
  /** 사람 승인 화면에 띄울 자연어 설명 (Part 1 §3.2.1). */
  rationale: string;
}

export interface GenerateParams {
  /** UI 폼 값 또는 자연어 입력을 담은 스택 명세. */
  stackInput: Record<string, unknown>;
  /** 'ui' | 'natural_language' — 프롬프트 구성에 쓴다. */
  inputMode: string;
  /** 템플릿에서 파생됐다면 그 프리셋. 없으면 null. */
  templatePreset: Record<string, unknown> | null;
}

export interface DockerConfigGenerator {
  generate(params: GenerateParams): Promise<GeneratedDockerConfig>;
}

export const DOCKER_CONFIG_GENERATOR = Symbol('DOCKER_CONFIG_GENERATOR');
