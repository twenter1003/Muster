import { Module } from '@nestjs/common';

/**
 * Realtime — Ingest가 발행한 도메인 이벤트를 구독해 SSE로 스트리밍.
 * Part 1 §3.4 / Part 4 §7.3 (event: log / health_update / stage_change).
 *
 * 주의: 인프로세스 EventEmitter2는 인스턴스 간 전달이 되지 않으므로 Cloud Run은
 * max-instances=1로 고정한다 (Phase 1 결정 사항, deploy/ 참조).
 * Phase 6에서 구현.
 */
@Module({})
export class RealtimeModule {}
