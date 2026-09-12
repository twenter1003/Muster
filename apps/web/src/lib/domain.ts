/**
 * 화면이 공유하는 도메인 값과 표시 규칙(설계서 10 · 컴포넌트 규칙).
 *
 * 왜 여기 모아 두는가: "같은 정보가 화면마다 다른 모양으로 나오지 않게" 하는 것이 규칙의 목적이라,
 * 임계값이나 신호 대상이 화면마다 복붙되면 규칙이 바로 깨진다. 한 곳에서만 정의한다.
 *
 * 값 집합은 apps/api 의 database/entities/enums.ts 와 같아야 한다. 두 앱이 코드를 공유하지
 * 않으므로(패키지 경계) 여기서 다시 선언하되, 바뀌면 양쪽을 같이 고쳐야 한다.
 */

/** PROJECT_ENV_CONFIGS.build_status — 8종 */
export const BUILD_STATUSES = [
  'generated',
  'policy_passed',
  'policy_blocked',
  'approved',
  'rejected',
  'running',
  'succeeded',
  'failed',
] as const;
export type BuildStatus = (typeof BUILD_STATUSES)[number];

/** AGENT_RUNS.status — 4종 */
export const AGENT_RUN_STATUSES = ['running', 'succeeded', 'failed', 'cancelled'] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

/** PROJECTS.current_stage — 6종. 배지는 전부 회색이다(단계는 우열이 아니라 위치). */
export const PROJECT_STAGES = [
  'planning',
  'design',
  'development',
  'testing',
  'deployment',
  'operation',
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

/** LOG_ENTRIES.level */
export const LOG_LEVELS = ['error', 'warn', 'info'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type StatusValue = BuildStatus | AgentRunStatus;

/**
 * 신호색을 채우는 상태. 사용자의 처리를 요구하는 것만 들어간다.
 * 설계서 10장 본문은 policy_blocked·failed 둘만 적었지만 01장의 색 적용 예에는
 * 로그 레벨 error까지 셋이 붉게 찍혀 있다. error는 상태가 아니라 로그 레벨이므로
 * 여기(상태)에는 둘만 넣고, error는 LogRow가 같은 규칙으로 따로 처리한다.
 */
const SIGNAL_STATUSES: ReadonlySet<string> = new Set<StatusValue>(['policy_blocked', 'failed']);

export function isSignalStatus(status: StatusValue): boolean {
  return SIGNAL_STATUSES.has(status);
}

/**
 * 헬스 신호 임계값. 목록·개요·리포트가 반드시 이 상수 하나를 쓴다 —
 * 화면마다 다른 기준으로 붉어지면 훑어보기가 무너진다.
 */
export const HEALTH_SIGNAL_THRESHOLD = 2.5;
export const HEALTH_MAX = 4;

export function isHealthSignal(score: number): boolean {
  return score < HEALTH_SIGNAL_THRESHOLD;
}

/**
 * 빈 값 표기. 0과 구분한다 — 0은 측정 결과이고 —는 측정 불가다.
 * 두 표기를 섞지 않기 위해, 값이 없을 수 있는 자리는 반드시 이 상수를 거친다.
 */
export const EM_DASH = '—';

/** 측정되지 않았을 수 있는 값. null이면 —, 숫자면 그대로. */
export type Measurable<T> = T | null;

export function formatMeasurable<T>(value: Measurable<T>, format: (v: T) => string): string {
  return value === null ? EM_DASH : format(value);
}
