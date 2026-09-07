import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { User } from '../../database/entities';
import { SECRET_STORE, type SecretStore } from '../../common/secrets/secret-store';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
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
   * 세션 토큰을 fragment에 실어 프론트로 되돌려보낼 URL을 돌려준다.
   */
  async completeLogin(code: string, state: string | undefined): Promise<string> {
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

    const { token } = await this.sessions.issue(user.id);

    // fragment(#)는 브라우저가 서버로 보내지 않으므로 액세스 로그에 토큰이 남지 않는다.
    const redirect = new URL(this.config.get<string>('FRONTEND_URL') ?? '');
    redirect.hash = `token=${encodeURIComponent(token)}`;
    return redirect.toString();
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
