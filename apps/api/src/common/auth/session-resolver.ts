import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from './authenticated-user';

/**
 * Bearer 토큰 -> 사용자 해석 계약.
 * Phase 3(Auth 모듈)에서 실제 세션 저장소 기반 구현으로 교체한다.
 *
 * 주의: API 설계 2장의 `POST /auth/logout`("세션 토큰 무효화")은 서버 측 세션 상태를
 * 전제하는데 ERD에 SESSIONS 엔티티가 없다. Phase 2 착수 시 해소 필요한 미결 사항.
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
