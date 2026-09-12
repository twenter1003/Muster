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

@Injectable()
export class SessionService {
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
    const session = await this.sessions.findOne({
      where: { token_hash: hashToken(token), revoked_at: IsNull() },
      relations: { user: true },
    });

    if (!session || session.expires_at.getTime() <= Date.now()) return null;

    return {
      id: session.user.id,
      github_login: session.user.github_login,
      email: session.user.email,
    };
  }

  /**
   * 로그아웃. revoked_at을 기록해 만료 전이라도 즉시 무효화한다
   * (설계서 Part 4 §2 — 이 계약 때문에 stateless JWT를 쓸 수 없었다).
   */
  async revoke(token: string): Promise<void> {
    await this.sessions.update(
      { token_hash: hashToken(token), revoked_at: IsNull() },
      { revoked_at: new Date() },
    );
  }
}

