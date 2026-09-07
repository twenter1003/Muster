import { Module } from '@nestjs/common';

/**
 * Ingest — GitHub 웹훅 수신(HMAC 검증, X-GitHub-Delivery 멱등성), 로그 적재,
 * 진행 단계 이력 기록, 헬스 스코어 계산.
 * Part 1 §3.4 / 통합설계서 Part 2 §6.3 / Part 4 §7.1.
 *
 * 결합 규칙(통합설계서 Part 2 §8, 지시서 원칙 4): 이 모듈은 다른 모듈을 직접 호출하지 않고
 * common/events/domain-events.ts의 이벤트만 EventEmitter2로 발행한다.
 * .eslintrc.js의 no-restricted-imports 규칙이 이를 강제한다.
 * Phase 6에서 구현.
 */
@Module({})
export class IngestModule {}
