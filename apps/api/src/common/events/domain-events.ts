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

/** 이벤트 이름 -> 페이로드 매핑. 구독 측에서 타입을 잃지 않게 한다. */
export interface DomainEventPayloads {
  [DomainEvent.LOG_APPENDED]: LogAppendedEvent;
  [DomainEvent.HEALTH_SNAPSHOT_CREATED]: HealthSnapshotCreatedEvent;
  [DomainEvent.PROJECT_STAGE_CHANGED]: ProjectStageChangedEvent;
}
