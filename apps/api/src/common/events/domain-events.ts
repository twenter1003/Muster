/**
 * 모듈 간 인프로세스 이벤트 계약 (통합설계서 Part 2 §8, EventEmitter2).
 *
 * Ingest는 다른 모듈을 직접 호출하지 않고 이 이벤트만 발행한다. 발행자(Ingest)와
 * 구독자(Realtime 등)가 서로를 import하지 않도록 계약은 common에 둔다.
 * Ingest를 별도 서비스로 분리할 때 이 파일이 그대로 메시지 스키마가 된다.
 */
export const DomainEvent = {
  LOG_APPENDED: 'ingest.log.appended',
  HEALTH_SNAPSHOT_CREATED: 'ingest.health.snapshot_created',
  PROJECT_STAGE_CHANGED: 'ingest.project.stage_changed',
  /** 프로젝트 예산 사용률이 알림 임계치를 넘어선 순간 (설계서 Part 4 §6). */
  BUDGET_THRESHOLD_EXCEEDED: 'agent-registry.budget.threshold_exceeded',
  /** GitHub Actions 실행 하나가 끝난 순간. 환경 구성 실행 결과가 이 경로로 돌아온다. */
  WORKFLOW_RUN_COMPLETED: 'ingest.workflow_run.completed',
} as const;

export interface LogAppendedEvent {
  project_id: string;
  log_entry_id: string;
  level: string;
  message: string;
  created_at: string;
}

export interface HealthSnapshotCreatedEvent {
  project_id: string;
  snapshot_id: string;
  composite_score: number;
  measured_at: string;
}

export interface ProjectStageChangedEvent {
  project_id: string;
  stage: string;
  entered_at: string;
}

/**
 * 예산 임계치 초과. 실행 종료 기록마다 재계산하되, **넘어서는 순간에만** 발행한다
 * (직전 사용률은 미만, 지금은 이상). 매번 발행하면 한도 근처에서 실행할 때마다
 * 같은 알림이 반복된다.
 */
export interface BudgetThresholdExceededEvent {
  project_id: string;
  /** 'tokens' | 'cost' — 무엇이 임계치를 넘었는지. 둘 다면 각각 발행한다. */
  metric: 'tokens' | 'cost';
  used: string;
  limit: string;
  usage_pct: number;
  threshold_pct: number;
  occurred_at: string;
}

/**
 * 워크플로 실행 완료.
 *
 * Ingest는 이것이 환경 구성 실행인지 모른다 — 알면 EnvCatalog를 import해야 하고, 그것은
 * Part 2 §8이 금지한 모듈 간 직접 호출이다. 판단은 구독자(EnvCatalog)가 run_name으로 한다.
 */
export interface WorkflowRunCompletedEvent {
  project_id: string;
  /** 워크플로 실행 이름. 우리 실행이면 `muster-env <구성 id>` 형태다. */
  run_name: string | null;
  /** GitHub의 conclusion 원문 (success·failure·cancelled·timed_out 등). */
  conclusion: string | null;
  /** 사람이 실행 로그를 열어볼 주소. 전이 사유에 남긴다. */
  run_url: string | null;
  occurred_at: string;
}

/** 이벤트 이름 -> 페이로드 매핑. 구독 측에서 타입을 잃지 않게 한다. */
export interface DomainEventPayloads {
  [DomainEvent.LOG_APPENDED]: LogAppendedEvent;
  [DomainEvent.HEALTH_SNAPSHOT_CREATED]: HealthSnapshotCreatedEvent;
  [DomainEvent.PROJECT_STAGE_CHANGED]: ProjectStageChangedEvent;
  [DomainEvent.BUDGET_THRESHOLD_EXCEEDED]: BudgetThresholdExceededEvent;
  [DomainEvent.WORKFLOW_RUN_COMPLETED]: WorkflowRunCompletedEvent;
}
