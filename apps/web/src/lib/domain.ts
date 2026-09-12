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

/** POLICY_CHECK_RESULTS.tool — 2종 */
export const POLICY_TOOLS = ['trivy', 'conftest'] as const;
export type PolicyTool = (typeof POLICY_TOOLS)[number];

/** POLICY_CHECK_RESULTS.verdict — 2종 */
export const POLICY_VERDICTS = ['pass', 'fail'] as const;
export type PolicyVerdict = (typeof POLICY_VERDICTS)[number];

/** DOCUMENTS.type — 4종 */
export const DOCUMENT_TYPES = ['prd', 'srs', 'tech_spec', 'other'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** DOCUMENTS.upload_status — 2종 */
export const UPLOAD_STATUSES = ['pending', 'completed'] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

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

/**
 * 시각 표기 — "09-12 14:03". 초·연도는 버린다.
 *
 * 목록에서 시각이 하는 일은 "언제쯤이었나"의 정렬 감각이지 정확한 지목이 아니다.
 * 연도까지 찍으면 열 폭이 늘고 모든 행이 같은 연도라 읽을 것이 하나 늘 뿐이다.
 * 정확한 시각이 필요하면 화면이 title 속성으로 원문을 남긴다.
 *
 * 24시간제를 고정하는 이유: 오전/오후 표기는 폭이 행마다 달라져 시각 열이 세로로 흔들린다.
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * stack_config에서 사람이 읽을 스택 이름만 주워 담는다.
 *
 * stack_config는 사용자가 넣은 자유 형식 객체라 구조를 신뢰할 수 없다. 알아볼 수 있는
 * 문자열 필드만 취하고 나머지는 조용히 버린다 — 보조 정보 한 줄 때문에 행이 깨지면 안 된다.
 * 프로젝트 목록과 EnvCatalog가 같은 값을 보여 주므로, 주워 담는 기준이 갈라지지 않게
 * 화면이 아니라 여기에 둔다.
 */
export function readStack(config: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ['language', 'framework', 'database']) {
    const v = config[key];
    if (typeof v === 'string' && v.length > 0) out.push(v);
  }
  const services = config['services'];
  if (Array.isArray(services)) {
    for (const s of services) if (typeof s === 'string' && s.length > 0) out.push(s);
  }
  return out;
}

/**
 * 0~1 비율 → "74%". null이면 —다.
 *
 * 화면(리포트)에 있던 것을 여기로 올렸다. 성공률·1차 통과율 같은 비율은 화면이 늘어날수록
 * 여러 곳에서 찍히는데, 반올림 자리수나 빈 값 표기가 화면마다 갈리면 같은 수치가 다르게 읽힌다.
 */
export function formatRate(rate: Measurable<number>): string {
  return formatMeasurable(rate, (v) => `${Math.round(v * 100)}%`);
}
