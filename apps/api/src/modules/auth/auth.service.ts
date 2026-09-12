import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { User } from '../../database/entities';
import { SECRET_STORE, type SecretStore } from '../../common/secrets/secret-store';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { clearedSessionCookie, sessionCookie } from '../../common/auth/session-cookie';
import { SessionService } from './session.service';
import { OAuthStateService } from './oauth-state.service';
import {
  GITHUB_OAUTH_CLIENT,
  GITHUB_OAUTH_SCOPES,
  type GitHubOAuthClient,
} from './github-oauth.client';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(GITHUB_OAUTH_CLIENT) private readonly github: GitHubOAuthClient,
    @Inject(SECRET_STORE) private readonly secrets: SecretStore,
    private readonly sessions: SessionService,
    private readonly state: OAuthStateService,
    private readonly config: ConfigService,
  ) {}

  /** GitHub 인증 페이지 URL. state로 CSRF를 막는다. */
  buildAuthorizeUrl(): string {
    const clientId = this.config.get<string>('GITHUB_OAUTH_CLIENT_ID');
    if (!clientId) {
      throw new ApiException(
        ErrorCode.INTERNAL,
        'GITHUB_OAUTH_CLIENT_ID가 설정되지 않았습니다.',
        503,
      );
    }

    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', this.callbackUrl());
    url.searchParams.set('scope', GITHUB_OAUTH_SCOPES.join(' '));
    url.searchParams.set('state', this.state.issue());
    return url.toString();
  }

  /**
   * 콜백 처리: code 교환 → 프로필 조회 → 사용자 upsert → GitHub 토큰 보관 → 세션 발급.
   *
   * 세션 토큰은 HttpOnly 쿠키로 심고, 리다이렉트 URL에는 **아무것도 싣지 않는다**.
   * 이전에는 `#token=...` fragment로 넘겼다. fragment는 서버 액세스 로그에는 남지 않지만
   * 브라우저 히스토리·확장 프로그램·프론트가 받아 둘 저장소(localStorage)에는 그대로 남고,
   * 결국 JS가 읽을 수 있는 토큰이 되어 XSS 한 번에 세션이 통째로 빠져나간다.
   * 쿠키로 옮기면 토큰이 URL에도 JS에도 존재하지 않는다.
   */
  async completeLogin(
    code: string,
    state: string | undefined,
  ): Promise<{ redirectUrl: string; setCookie: string }> {
    if (!this.state.verify(state)) {
      throw ApiException.unauthenticated('OAuth state가 유효하지 않습니다.');
    }

    // authorize 때 보낸 redirect_uri와 반드시 같은 값을 넘겨야 한다.
    const accessToken = await this.github.exchangeCode(code, this.callbackUrl());
    const profile = await this.github.fetchProfile(accessToken);
    const user = await this.upsertUser(profile.login, profile.email);

    // 토큰 원문은 DB가 아니라 시크릿 저장소에 두고 참조만 남긴다 (설계서 Part 2 §6.2).
    const ref = await this.secrets.put(`github-token-${user.id}`, accessToken);
    if (user.github_token_ref !== ref) {
      await this.users.update({ id: user.id }, { github_token_ref: ref });
    }

    const { token, expires_at } = await this.sessions.issue(user.id);

    return {
      redirectUrl: new URL(this.config.get<string>('FRONTEND_URL') ?? '').toString(),
      // 쿠키 수명을 세션 수명에 맞춘다. 쿠키가 더 오래 살면 브라우저가 이미 죽은 토큰을
      // 계속 보내고, 사용자는 매 요청 401을 받으면서 왜 로그아웃됐는지 알 수 없다.
      setCookie: sessionCookie(token, {
        secure: this.isProduction(),
        maxAgeMs: expires_at.getTime() - Date.now(),
      }),
    };
  }

  /** 로그아웃 응답에 실을, 쿠키를 지우는 Set-Cookie 값. */
  clearSessionCookie(): string {
    return clearedSessionCookie({ secure: this.isProduction() });
  }

  private isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  private async upsertUser(login: string, email: string | null): Promise<User> {
    const existing = await this.users.findOneBy({ github_login: login });
    if (existing) {
      // GitHub에서 이메일을 공개로 바꿨을 수 있으므로 최신값으로 갱신한다.
      if (existing.email !== email) {
        existing.email = email;
        await this.users.save(existing);
      }
      return existing;
    }

    return this.users.save(this.users.create({ github_login: login, email }));
  }

  /** GitHub에 등록한 콜백 주소. authorize와 토큰 교환 양쪽에서 이 값을 쓴다. */
  callbackUrl(): string {
    const base = this.config.get<string>('API_BASE_URL') ?? '';
    return `${base.replace(/\/$/, '')}/api/v1/auth/github/callback`;
  }
}
