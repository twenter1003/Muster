import { Inject, Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { User } from '../../database/entities';
import { SECRET_STORE, type SecretStore } from '../../common/secrets/secret-store';
import { ApiException } from '../../common/errors/api.exception';
import { GITHUB_OAUTH_CLIENT, type GitHubOAuthClient } from './github-oauth.client';
import {
  isExpired,
  parseTokenSet,
  serializeTokenSet,
  type GitHubTokenSet,
} from './github-token-set';

/**
 * 사용자의 GitHub 토큰을 보관하고, 쓰기 직전에 유효한 액세스 토큰을 내준다.
 *
 * 보관과 갱신을 한곳에 모은 이유: 토큰을 쓰는 쪽(레포 연동)이 늘어날 때마다
 * "만료됐으면 갱신한다"를 각자 구현하면, 한 군데만 빠뜨려도 그 경로만 몇 시간 뒤에
 * 조용히 죽는다. 토큰을 꺼내는 문을 하나로 두면 그 실수를 할 수 없다.
 *
 * 원문은 DB가 아니라 시크릿 저장소에만 둔다 (설계서 Part 2 §6.2). DB에는 참조만 남는다.
 */
@Injectable()
export class GitHubTokenService {
  private readonly logger = new Logger(GitHubTokenService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(GITHUB_OAUTH_CLIENT) private readonly github: GitHubOAuthClient,
    @Inject(SECRET_STORE) private readonly secrets: SecretStore,
  ) {}

  /** 로그인 직후 받은 토큰 한 벌을 보관하고, DB에 넣을 참조를 돌려준다. */
  async store(userId: string, tokens: GitHubTokenSet): Promise<string> {
    return this.secrets.put(`github-token-${userId}`, serializeTokenSet(tokens));
  }

  /**
   * 지금 GitHub API에 쓸 수 있는 액세스 토큰. 만료됐으면 먼저 갱신한다.
   *
   * 갱신이 실패하면 GITHUB_REAUTH_REQUIRED를 던진다 — 경고 로그만 남기고 일반 오류로
   * 뭉개면, 사용자는 "다시 로그인하면 된다"는 사실을 알 길이 없다.
   */
  async accessTokenFor(userId: string): Promise<string> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user?.github_token_ref) {
      throw ApiException.githubReauthRequired('GitHub 재인증이 필요합니다. 다시 로그인해 주세요.');
    }

    const raw = await this.secrets.get(user.github_token_ref);
    if (!raw) {
      // 참조는 있는데 시크릿이 없다 — 저장소가 비워졌거나 다른 환경의 참조다.
      this.logger.warn(`시크릿을 찾을 수 없습니다: ${user.github_token_ref}`);
      throw ApiException.githubReauthRequired('GitHub 재인증이 필요합니다. 다시 로그인해 주세요.');
    }

    const tokens = parseTokenSet(raw);
    if (!isExpired(tokens)) return tokens.accessToken;

    if (!tokens.refreshToken) {
      // 만료는 됐는데 갱신할 수단이 없다. 만료가 켜진 앱에서 로그인 흐름이 refresh_token을
      // 받지 못했다는 뜻이므로, 조용히 만료된 토큰을 쓰는 대신 재인증을 요구한다.
      throw ApiException.githubReauthRequired('GitHub 재인증이 필요합니다. 다시 로그인해 주세요.');
    }

    return this.refreshAndStore(user, tokens.refreshToken);
  }

  private async refreshAndStore(user: User, refreshToken: string): Promise<string> {
    let refreshed: GitHubTokenSet;
    try {
      refreshed = await this.github.refresh(refreshToken);
    } catch (error) {
      this.logger.warn(`GitHub 토큰 갱신 실패 (user ${user.id}): ${String(error)}`);
      // 원인이 무엇이든(폐기·만료·GitHub 장애) 호출자가 할 수 있는 일은 재인증뿐이다.
      throw ApiException.githubReauthRequired('GitHub 재인증이 필요합니다. 다시 로그인해 주세요.');
    }

    // GitHub은 갱신 때 refresh_token도 새로 발급하고 이전 것을 무효화한다.
    // 새 값을 저장하지 못하면 다음 갱신이 반드시 실패하므로, 토큰을 쓰기 전에 먼저 보관한다.
    const ref = await this.store(user.id, refreshed);
    if (user.github_token_ref !== ref) {
      await this.users.update({ id: user.id }, { github_token_ref: ref });
    }

    return refreshed.accessToken;
  }
}
