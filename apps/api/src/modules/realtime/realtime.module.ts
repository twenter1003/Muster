import { Module } from '@nestjs/common';
import { ProjectStreamController } from './project-stream.controller';
import { StreamService } from './stream.service';

/**
 * Realtime — Ingest(와 ProjectCore)가 발행한 도메인 이벤트를 구독해 SSE로 스트리밍.
 * Part 1 §3.4 / Part 4 §7.3 (event: log / health_update / stage_change).
 *
 * 발행자를 import하지 않는다. 계약은 common/events/domain-events.ts에 있고 전달은
 * EventEmitter2가 한다 (Part 2 §8) — 그래서 Ingest의 결합 규칙을 깨지 않고도 붙는다.
 *
 * 주의: 인프로세스 EventEmitter2는 인스턴스 간 전달이 되지 않으므로 Cloud Run은
 * max-instances=1로 고정한다 (Phase 1 결정 사항). 인스턴스가 둘이면 A에 붙은 구독자는
 * B가 받은 웹훅을 영영 보지 못한다.
 */
@Module({
  controllers: [ProjectStreamController],
  providers: [StreamService],
})
export class RealtimeModule {}
