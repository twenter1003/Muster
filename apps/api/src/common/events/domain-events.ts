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
  /** 에이전트 세션 실행이 시작된 순간 (SSE 실시간 점멸 관제). */
  AGENT_RUN_STARTED: 'agent-registry.run.started',
  /** 에이전트 세션 실행 진행 중 중간 토큰/비용 스트리밍 (10초 하트비트 라이브 틱). */
  AGENT_RUN_HEARTBEAT: 'agent-registry.run.heartbeat',
  /** 에이전트 세션 실행이 완료/종료된 순간 (SSE 실시간 수치 갱신). */
  AGENT_RUN_FINISHED: 'agent-registry.run.finished',
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

export interface AgentRunStartedEvent {
  project_id: string;
  agent_id: string;
  agent_name: string;
  run_id: string;
  model?: string | null;
  status: 'running';
  started_at: string;
}

export interface AgentRunHeartbeatEvent {
  project_id: string;
  agent_id: string;
  agent_name: string;
  run_id: string;
  model?: string | null;
  tokens_used: number;
  cost: string;
  delta_tokens: number;
  delta_cost: string;
  timestamp: string;
}

export interface AgentRunFinishedEvent {
  project_id: string;
  agent_id: string;
  agent_name: string;
  run_id: string;
  model?: string | null;
  status: string;
  tokens_used: number;
  cost: string;
  started_at: string;
  ended_at: string;
}

/** 이벤트 이름 -> 페이로드 매핑. 구독 측에서 타입을 잃지 않게 한다. */
export interface DomainEventPayloads {
  [DomainEvent.LOG_APPENDED]: LogAppendedEvent;
  [DomainEvent.HEALTH_SNAPSHOT_CREATED]: HealthSnapshotCreatedEvent;
  [DomainEvent.AGENT_RUN_STARTED]: AgentRunStartedEvent;
  [DomainEvent.AGENT_RUN_HEARTBEAT]: AgentRunHeartbeatEvent;
  [DomainEvent.AGENT_RUN_FINISHED]: AgentRunFinishedEvent;
}
