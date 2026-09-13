import { Injectable, type MessageEvent } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { filter, fromEvent, interval, map, merge, type Observable } from 'rxjs';
import {
  DomainEvent,
  type BudgetThresholdExceededEvent,
  type HealthSnapshotCreatedEvent,
  type LogAppendedEvent,
  type ProjectStageChangedEvent,
} from '../../common/events/domain-events';

/**
 * 하트비트 주기. Cloud Run과 중간 프록시는 조용한 연결을 끊는다(기본 유휴 타임아웃 약 5분).
 * 조용히 끊기면 브라우저 EventSource는 재연결하지만, fetch 기반 클라이언트는 스트림이
 * 끝난 것으로 보고 멈춘다. 여유 있게 그 절반 이하로 잡는다.
 */
const HEARTBEAT_MS = 25_000;

@Injectable()
export class StreamService {
  constructor(private readonly events: EventEmitter2) {}

  /**
   * 설계서 Part 4 §7.3 — 한 프로젝트의 실시간 이벤트 스트림.
   *
   * 구독자는 자신의 프로젝트 것만 받아야 하므로 project_id로 거른다. 이벤트 버스는
   * 프로세스 전역이라 이 필터가 유일한 격리 수단이다.
   *
   * 구독 해제는 RxJS가 처리한다 — 클라이언트가 끊으면 Nest가 Observable을 unsubscribe하고
   * fromEvent가 EventEmitter2 리스너를 떼어 낸다. 떼어 내지 않으면 연결이 오갈 때마다
   * 리스너가 쌓여 프로세스 수명 동안 새지 않는다.
   */
  forProject(projectId: string): Observable<MessageEvent> {
    return merge(
      this.typed<LogAppendedEvent>(DomainEvent.LOG_APPENDED, 'log', projectId),
      this.typed<HealthSnapshotCreatedEvent>(
        DomainEvent.HEALTH_SNAPSHOT_CREATED,
        'health_update',
        projectId,
      ),
      this.typed<ProjectStageChangedEvent>(
        DomainEvent.PROJECT_STAGE_CHANGED,
        'stage_change',
        projectId,
      ),
      // 설계서 §7.3의 목록에 없는 넷째 타입이다. 근거는 DESIGN_DRIFT.md 10번 —
      // 요약하면, 임계치를 넘는 순간은 지나가면 사라지고 인박스는 사람이 열어야 보인다.
      this.typed<BudgetThresholdExceededEvent>(
        DomainEvent.BUDGET_THRESHOLD_EXCEEDED,
        'budget_alert',
        projectId,
      ),
      this.heartbeat(),
    );
  }

  private typed<T extends { project_id: string }>(
    name: string,
    type: 'log' | 'health_update' | 'stage_change' | 'budget_alert',
    projectId: string,
  ): Observable<MessageEvent> {
    return fromEvent<T>(this.events, name).pipe(
      // 직렬화 전에 거른다 — 남의 프로젝트 페이로드가 MessageEvent까지 내려가지 않게 한다.
      filter((payload) => payload?.project_id === projectId),
      map((payload) => ({ type, data: payload }) satisfies MessageEvent),
    );
  }

  /**
   * `ping` 타입으로 보낸다. SSE 주석(`: keepalive`)이 더 가볍지만 Nest의 @Sse()는
   * MessageEvent만 직렬화한다. 설계서 §7.3이 "클라이언트는 필요한 이벤트 타입만 구독"이라
   * 했으므로, 구독하지 않은 타입이 하나 더 흘러도 클라이언트 쪽에서 무해하다.
   */
  private heartbeat(): Observable<MessageEvent> {
    return interval(HEARTBEAT_MS).pipe(
      map(() => ({ type: 'ping', data: {} }) satisfies MessageEvent),
    );
  }
}
