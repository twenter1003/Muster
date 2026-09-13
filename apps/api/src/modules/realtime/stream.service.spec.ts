import { EventEmitter2 } from '@nestjs/event-emitter';
import { firstValueFrom, take, toArray } from 'rxjs';
import { DomainEvent } from '../../common/events/domain-events';
import { StreamService } from './stream.service';

const MINE = '11111111-1111-4111-8111-111111111111';
const YOURS = '22222222-2222-4222-8222-222222222222';

const logEvent = (projectId: string, message = '한 줄') => ({
  project_id: projectId,
  log_entry_id: 'log-1',
  level: 'info',
  message,
  created_at: '2026-09-12T00:00:00.000Z',
});

const budgetEvent = (projectId: string) => ({
  project_id: projectId,
  metric: 'cost' as const,
  used: '81.0000',
  limit: '100.0000',
  usage_pct: 81,
  threshold_pct: 80,
  occurred_at: '2026-09-12T00:00:00.000Z',
});

/** 이벤트 버스는 프로세스 전역이다. 여기서 거르지 않으면 남의 로그가 그대로 흘러간다. */
describe('StreamService', () => {
  let emitter: EventEmitter2;
  let service: StreamService;

  beforeEach(() => {
    emitter = new EventEmitter2();
    service = new StreamService(emitter);
  });

  it('네 이벤트 타입을 이름 그대로 내보낸다', async () => {
    const received = firstValueFrom(service.forProject(MINE).pipe(take(4), toArray()));

    emitter.emit(DomainEvent.LOG_APPENDED, logEvent(MINE));
    emitter.emit(DomainEvent.HEALTH_SNAPSHOT_CREATED, {
      project_id: MINE,
      snapshot_id: 's-1',
      composite_score: 2.75,
      measured_at: '2026-09-12T00:00:00.000Z',
    });
    emitter.emit(DomainEvent.PROJECT_STAGE_CHANGED, {
      project_id: MINE,
      stage: 'development',
      entered_at: '2026-09-12T00:00:00.000Z',
    });

    emitter.emit(DomainEvent.BUDGET_THRESHOLD_EXCEEDED, budgetEvent(MINE));

    // 앞의 셋은 설계서 Part 4 §7.3이 정한 이름이다 — 바꾸면 클라이언트 구독이 조용히 끊긴다.
    // budget_alert는 그 뒤에 더한 넷째다(DESIGN_DRIFT.md 10번).
    expect((await received).map((e) => e.type)).toEqual([
      'log',
      'health_update',
      'stage_change',
      'budget_alert',
    ]);
  });

  it('예산 경보도 프로젝트로 거른다', async () => {
    // 사용액과 한도가 담긴 페이로드라, 새면 남의 프로젝트 지출이 그대로 넘어간다.
    const received = firstValueFrom(service.forProject(MINE).pipe(take(1), toArray()));

    emitter.emit(DomainEvent.BUDGET_THRESHOLD_EXCEEDED, budgetEvent(YOURS));
    emitter.emit(DomainEvent.BUDGET_THRESHOLD_EXCEEDED, budgetEvent(MINE));

    const events = await received;
    expect(events).toHaveLength(1);
    expect((events[0].data as { project_id: string }).project_id).toBe(MINE);
  });

  it('다른 프로젝트의 이벤트는 내보내지 않는다', async () => {
    const received = firstValueFrom(service.forProject(MINE).pipe(take(1), toArray()));

    emitter.emit(DomainEvent.LOG_APPENDED, logEvent(YOURS, '남의 로그'));
    emitter.emit(DomainEvent.LOG_APPENDED, logEvent(MINE, '내 로그'));

    const events = await received;
    expect(events).toHaveLength(1);
    expect((events[0].data as { message: string }).message).toBe('내 로그');
  });

  it('페이로드를 그대로 싣는다', async () => {
    const received = firstValueFrom(service.forProject(MINE).pipe(take(1)));
    emitter.emit(DomainEvent.LOG_APPENDED, logEvent(MINE));

    expect((await received).data).toEqual(logEvent(MINE));
  });

  it('구독을 끊으면 리스너를 떼어 낸다', () => {
    // 떼어 내지 않으면 연결이 오갈 때마다 리스너가 쌓여 프로세스 수명 동안 샌다.
    const before = emitter.listenerCount(DomainEvent.LOG_APPENDED);

    const subscription = service.forProject(MINE).subscribe();
    expect(emitter.listenerCount(DomainEvent.LOG_APPENDED)).toBe(before + 1);

    subscription.unsubscribe();
    expect(emitter.listenerCount(DomainEvent.LOG_APPENDED)).toBe(before);
  });

  it('조용한 연결에도 하트비트를 보낸다', async () => {
    // Cloud Run과 프록시는 유휴 연결을 끊는다. 끊기면 fetch 기반 클라이언트는 멈춘다.
    jest.useFakeTimers();
    try {
      const received = firstValueFrom(service.forProject(MINE).pipe(take(1)));
      jest.advanceTimersByTime(25_000);

      expect((await received).type).toBe('ping');
    } finally {
      jest.useRealTimers();
    }
  });
});
