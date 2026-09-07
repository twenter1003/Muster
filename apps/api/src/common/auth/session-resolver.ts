import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from './authenticated-user';

/**
 * Bearer 토큰 -> 사용자 해석 계약.
 * Phase 3(Auth 모듈)에서 실제 세션 저장소 기반 구현으로 교체한다.
 *
 * 세션은 SESSIONS 테이블(token_hash/expires_at/revoked_at)로 관리한다. 즉시 무효화 계약을
 * 지키기 위한 서버 세션 방식이며, 요청당 DB 조회 1회를 감수한다 (통합설계서 Part 3 설계 결정).
 */
export interface SessionResolver {
  resolve(token: string): Promise<AuthenticatedUser | null>;
}

export const SESSION_RESOLVER = Symbol('SESSION_RESOLVER');

/** Phase 1 자리표시자: 어떤 토큰도 인증하지 않는다. */
@Injectable()
export class NullSessionResolver implements SessionResolver {
  private readonly logger = new Logger(NullSessionResolver.name);

  async resolve(_token: string): Promise<AuthenticatedUser | null> {
    this.logger.warn('세션 해석기가 아직 구현되지 않았습니다 (Phase 3에서 구현).');
    return null;
  }
}
