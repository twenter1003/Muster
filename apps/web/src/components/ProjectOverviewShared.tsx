import type { ReactNode } from 'react';
import { ApiError, type Page as ApiPage } from '../lib/api';
import {
  BUILD_STATUSES,
  DOCUMENT_TYPES,
  LOG_LEVELS,
  PROJECT_STAGES,
  type BuildStatus,
  type DocumentType,
  type LogLevel,
  type Measurable,
  type ProjectStage,
} from '../lib/domain';

/* ─────────────────────────── 서버 응답 타입 ───────────────────────────
 * 전부 각 컨트롤러의 toView를 읽어 옮긴 것이다. 추측한 필드는 없다.
 * ProjectOverviewPage와 그 하위 컴포넌트들이 공유하는 타입만 여기 둔다 — 한 곳에서만
 * 쓰는 타입(AuditLogView, LogView, StageHistoryView 등)은 쓰는 파일에 그대로 둔다.
 */

export interface ProjectView {
  id: string;
  name: string;
  current_stage: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentView {
  id: string;
  title: string;
  type: string;
  upload_status: string;
  commit_ref: string | null;
  created_at: string;
}

export interface AgentView {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/** agents.controller.ts의 toRunView 그대로다. tokens_used·cost는 NUMERIC이라 문자열로 온다. */
export interface RunView {
  id: string;
  agent_id: string;
  status: string;
  tokens_used: number;
  cost: string;
  started_at: string;
  ended_at: string | null;
}

export interface BudgetUsage {
  token_limit: string | null;
  cost_limit: string | null;
  alert_threshold_pct: string;
  used_tokens: string;
  used_cost: string;
  token_usage_pct: number | null;
  cost_usage_pct: number | null;
  updated_at: string | null;
}

export interface EnvConfigView {
  id: string;
  template_id: string | null;
  build_status: string;
  stack_config: Record<string, unknown>;
  created_at: string;
}

export interface EnvConfigDetail extends EnvConfigView {
  docker_config: Record<string, unknown>;
}

export interface PolicyCheckView {
  id: string;
  tool: string;
  verdict: string;
  risk_notes: string | null;
  checked_at: string;
}

export interface HealthSnapshotView {
  id: string;
  deploy_freq_score: number | null;
  lead_time_score: number | null;
  change_fail_score: number | null;
  mttr_score: number | null;
  composite_score: string;
  measured_at: string;
}

/* ─────────────────────────── 표시 헬퍼 ─────────────────────────── */

export const asStage = (value: string): ProjectStage | null =>
  (PROJECT_STAGES as readonly string[]).includes(value) ? (value as ProjectStage) : null;

export const asBuildStatus = (value: string): BuildStatus | null =>
  (BUILD_STATUSES as readonly string[]).includes(value) ? (value as BuildStatus) : null;

export const asLogLevel = (value: string): LogLevel | null =>
  (LOG_LEVELS as readonly string[]).includes(value) ? (value as LogLevel) : null;

/** 서버가 값 집합에 없는 종류를 주면 수정 폼의 select가 빈 칸이 된다. 그때는 other로 받는다. */
export const asDocumentType = (value: string): DocumentType =>
  (DOCUMENT_TYPES as readonly string[]).includes(value) ? (value as DocumentType) : 'other';

/** 실패는 코드까지 보여 준다 — 메시지만으로는 재시도해도 되는 실패인지 구분되지 않는다. */
export const errorMessage = (e: unknown): string => {
  if (e instanceof ApiError) return `${e.message} (${e.code})`;
  return e instanceof Error ? e.message : String(e);
};

export const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(new Date(iso));

export const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

export const formatTime = (iso: string): string =>
  new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));

/** 문자열 숫자(NUMERIC 컬럼)는 빈 값일 수 있다. 0과 —를 섞지 않기 위해 null을 유지한다. */
export const parseNumeric = (value: string | null): Measurable<number> => {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/* ─────────────────────────── 공용 조각 ─────────────────────────── */

export function Card({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel po-card">
      <h2 className="po-card__head">
        {title}
        {aside !== undefined && <span className="po-card__aside">{aside}</span>}
      </h2>
      <div className="panel__body">{children}</div>
    </section>
  );
}

/**
 * 부속 호출 하나가 실패해도 화면 전체가 무너지지 않게, 카드 안쪽만 상태 문구로 바꾼다.
 * 로딩·오류·빈 목록을 한 자리에서 처리해 화면마다 다른 문구가 나오는 것을 막는다.
 */
export function Async<T>({
  state,
  empty,
  children,
}: {
  state: { data: T | null; error: ApiError | null; loading: boolean };
  empty?: string;
  children: (data: T) => ReactNode;
}) {
  if (state.loading && state.data === null) return <p className="meta po-note">불러오는 중…</p>;
  if (state.error !== null) {
    return <p className="meta po-note po-note--signal">불러오지 못했다 — {state.error.message}</p>;
  }
  if (state.data === null) return <p className="meta po-note">{empty ?? '자료가 없다.'}</p>;
  return <>{children(state.data)}</>;
}

export type { ApiPage };
