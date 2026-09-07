import type { AuthenticatedUser } from './authenticated-user';

/**
 * Bearer 토큰 -> 사용자 해석 계약.
 * 구현체는 Auth 모듈의 DbSessionResolver다.
 *
 * 세션은 SESSIONS 테이블(token_hash/expires_at/revoked_at)로 관리한다. 즉시 무효화 계약을
 * 지키기 위한 서버 세션 방식이며, 요청당 DB 조회 1회를 감수한다 (통합설계서 Part 3 설계 결정).
 */
export interface SessionResolver {
  resolve(token: string): Promise<AuthenticatedUser | null>;
}

export const SESSION_RESOLVER = Symbol('SESSION_RESOLVER');
