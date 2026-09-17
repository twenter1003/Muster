import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Session } from '../../database/entities';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { hashToken } from '../../common/auth/token-hash';

/**
 * 세션 수명. 설계서에 값이 없어 여기서 확정한다.
 * 1인 개발 도구라 매일 재로그인은 과하고, 무기한은 탈취 시 위험이 무한정 남는다.
 */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedSession {
  user: AuthenticatedUser;
  expiresAtMs: number;
}

@Injectable()
export class SessionService {
  /**
   * 세션 캐시 (메모리 LRU/TTL).
   * 매 요청마다 DB sessions-users 조인을 반복하는 부하를 방지하여,
   * /auth/me 및 가드 인증 응답 속도를 0ms 단위로 단축한다.
   */
  private readonly cache = new Map<string, CachedSession>();

  constructor(@InjectRepository(Session) private readonly sessions: Repository<Session>) {}

  /**
   * 세션을 발급하고 **원문 토큰**을 돌려준다. 원문은 이 순간에만 존재하고
   * DB에는 해시만 남으므로, 나중에 다시 조회할 수 없다.
   */
  async issue(userId: string): Promise<{ token: string; expires_at: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expires_at = new Date(Date.now() + SESSION_TTL_MS);

    await this.sessions.save(
      this.sessions.create({
        user_id: userId,
        token_hash: hashToken(token),
        expires_at,
        revoked_at: null,
      }),
    );

    return { token, expires_at };
  }

  /** 유효한 세션이면 사용자를, 아니면 null을 돌려준다. */
  async resolve(token: string): Promise<AuthenticatedUser | null> {
    const hash = hashToken(token);
    const now = Date.now();

    const cached = this.cache.get(hash);
    if (cached) {
      if (now < cached.expiresAtMs) {
        return cached.user;
      }
      this.cache.delete(hash);
    }

    const session = await this.sessions.findOne({
      where: { token_hash: hash, revoked_at: IsNull() },
      relations: { user: true },
    });

    if (!session || session.expires_at.getTime() <= now) return null;

    const user: AuthenticatedUser = {
      id: session.user.id,
      github_login: session.user.github_login,
      email: session.user.email,
    };

    // 최대 60초 또는 세션 만료 시각 중 빠른 시각까지 캐싱
    const ttlMs = Math.min(session.expires_at.getTime() - now, 60_000);
    if (ttlMs > 0) {
      if (this.cache.size >= 1000) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
      this.cache.set(hash, { user, expiresAtMs: now + ttlMs });
    }

    return user;
  }

  /**
   * 로그아웃. revoked_at을 기록해 만료 전이라도 즉시 무효화한다
   * (설계서 Part 4 §2 — 이 계약 때문에 stateless JWT를 쓸 수 없었다).
   */
  async revoke(token: string): Promise<void> {
    const hash = hashToken(token);
    this.cache.delete(hash);

    await this.sessions.update(
      { token_hash: hash, revoked_at: IsNull() },
      { revoked_at: new Date() },
    );
  }

  /** 테스트 및 세션 캐시 전체 초기화 지원 */
  clearCache(): void {
    this.cache.clear();
  }
}
