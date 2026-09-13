import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { GitHubTokenService } from './github-token.service';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { SecretStore } from '../../common/secrets/secret-store';
import type { GitHubOAuthClient, GitHubProfile } from './github-oauth.client';
import { parseTokenSet, serializeTokenSet, type GitHubTokenSet } from './github-token-set';
import type { User } from '../../database/entities';

/**
 * 만료되는 토큰을 견디는지 본다.
 *
 * e2e(git-integration)는 "연동이 살아난다"는 결과를 보지만, 갱신을 몇 번 했는지·
 * 새 refresh_token을 실제로 보관했는지는 여기서만 볼 수 있다. 새 refresh_token을
 * 흘리면 다음 갱신이 반드시 실패하는데, 그 버그는 결과만 봐서는 며칠 뒤에야 드러난다.
 */
class FakeSecrets implements SecretStore {
  values = new Map<string, string>();

  async put(name: string, value: string): Promise<string> {
    const ref = `mem://${name}`;
    this.values.set(ref, value);
    return ref;
  }

  async get(ref: string): Promise<string | null> {
    return this.values.get(ref) ?? null;
  }

  async delete(ref: string): Promise<void> {
    this.values.delete(ref);
  }
}

class FakeOAuth implements GitHubOAuthClient {
  calls: string[] = [];
  fail = false;
  next: GitHubTokenSet = {
    accessToken: 'gho_new',
    refreshToken: 'ghr_new',
    expiresAt: Date.now() + 8 * 3600_000,
  };

  async exchangeCode(): Promise<GitHubTokenSet> {
    throw new Error('이 테스트는 교환 경로를 타지 않는다');
  }

  async refresh(refreshToken: string): Promise<GitHubTokenSet> {
    this.calls.push(refreshToken);
    if (this.fail) throw ApiException.githubReauthRequired();
    return this.next;
  }

  async fetchProfile(): Promise<GitHubProfile> {
    throw new Error('이 테스트는 프로필 경로를 타지 않는다');
  }
}

describe('GitHubTokenService.accessTokenFor', () => {
  const USER_ID = 'user-1';

  let secrets: FakeSecrets;
  let oauth: FakeOAuth;
  let user: User;
  let service: GitHubTokenService;

  const users = () =>
    ({
      findOneBy: async () => user,
      update: async (_where: unknown, patch: Partial<User>) => {
        user = { ...user, ...patch };
        return undefined;
      },
    }) as unknown as Repository<User>;

  /** 주어진 토큰 한 벌이 보관된 상태로 시작한다. */
  const given = async (tokens: GitHubTokenSet) => {
    const ref = await secrets.put(`github-token-${USER_ID}`, serializeTokenSet(tokens));
    user = { id: USER_ID, github_token_ref: ref } as User;
    service = new GitHubTokenService(users(), oauth, secrets);
  };

  beforeEach(() => {
    secrets = new FakeSecrets();
    oauth = new FakeOAuth();
    user = { id: USER_ID, github_token_ref: null } as User;
    service = new GitHubTokenService(users(), oauth, secrets);
    // 실패 경로 테스트가 콘솔을 경고로 채우지 않도록 막는다.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('만료되지 않은 토큰은 갱신하지 않고 그대로 쓴다', async () => {
    await given({
      accessToken: 'gho_live',
      refreshToken: 'ghr_1',
      expiresAt: Date.now() + 3600_000,
    });

    expect(await service.accessTokenFor(USER_ID)).toBe('gho_live');
    // 멀쩡한 토큰으로 갱신을 부르면 GitHub이 지금 쓰는 토큰을 무효화한다.
    expect(oauth.calls).toEqual([]);
  });

  it('만료가 없는 토큰(만료 꺼진 앱)도 갱신하지 않는다', async () => {
    await given({ accessToken: 'gho_forever', refreshToken: null, expiresAt: null });

    expect(await service.accessTokenFor(USER_ID)).toBe('gho_forever');
    expect(oauth.calls).toEqual([]);
  });

  it('이 기능 이전에 저장된 평문 토큰도 그대로 쓴다', async () => {
    const ref = await secrets.put(`github-token-${USER_ID}`, 'gho_legacy_plain');
    user = { id: USER_ID, github_token_ref: ref } as User;
    service = new GitHubTokenService(users(), oauth, secrets);

    expect(await service.accessTokenFor(USER_ID)).toBe('gho_legacy_plain');
    expect(oauth.calls).toEqual([]);
  });

  it('만료됐으면 refresh_token으로 갱신해 새 액세스 토큰을 쓴다', async () => {
    await given({ accessToken: 'gho_dead', refreshToken: 'ghr_1', expiresAt: Date.now() - 1000 });

    expect(await service.accessTokenFor(USER_ID)).toBe('gho_new');
    expect(oauth.calls).toEqual(['ghr_1']);
  });

  it('만료 직전(여유 구간)이면 미리 갱신한다', async () => {
    // 만료 10초 전 토큰으로 요청을 보내면 GitHub에 닿기 전에 죽을 수 있다.
    await given({
      accessToken: 'gho_almost',
      refreshToken: 'ghr_1',
      expiresAt: Date.now() + 10_000,
    });

    expect(await service.accessTokenFor(USER_ID)).toBe('gho_new');
    expect(oauth.calls).toEqual(['ghr_1']);
  });

  it('갱신으로 받은 새 refresh_token을 보관한다 (이전 것은 GitHub이 무효화한다)', async () => {
    await given({ accessToken: 'gho_dead', refreshToken: 'ghr_1', expiresAt: Date.now() - 1000 });
    await service.accessTokenFor(USER_ID);

    const stored = parseTokenSet((await secrets.get(user.github_token_ref!))!);
    expect(stored).toMatchObject({ accessToken: 'gho_new', refreshToken: 'ghr_new' });

    // 두 번째 만료 때는 새 refresh_token으로 갱신해야 한다.
    await secrets.put(
      `github-token-${USER_ID}`,
      serializeTokenSet({ ...stored, expiresAt: Date.now() - 1000 }),
    );
    await service.accessTokenFor(USER_ID);
    expect(oauth.calls).toEqual(['ghr_1', 'ghr_new']);
  });

  it('갱신이 실패하면 재인증 안내 오류를 낸다', async () => {
    await given({
      accessToken: 'gho_dead',
      refreshToken: 'ghr_revoked',
      expiresAt: Date.now() - 1,
    });
    oauth.fail = true;

    await expect(service.accessTokenFor(USER_ID)).rejects.toMatchObject({
      status: 403,
      response: { error: { code: ErrorCode.GITHUB_REAUTH_REQUIRED } },
    });
  });

  it('만료됐는데 refresh_token이 없으면 재인증을 요구한다', async () => {
    await given({ accessToken: 'gho_dead', refreshToken: null, expiresAt: Date.now() - 1 });

    await expect(service.accessTokenFor(USER_ID)).rejects.toMatchObject({
      response: { error: { code: ErrorCode.GITHUB_REAUTH_REQUIRED } },
    });
    expect(oauth.calls).toEqual([]);
  });

  it('토큰을 한 번도 보관한 적 없으면 재인증을 요구한다', async () => {
    await expect(service.accessTokenFor(USER_ID)).rejects.toThrow(ApiException);
    await expect(service.accessTokenFor(USER_ID)).rejects.toMatchObject({
      response: { error: { code: ErrorCode.GITHUB_REAUTH_REQUIRED } },
    });
  });

  it('참조는 있는데 시크릿이 사라졌으면 재인증을 요구한다', async () => {
    await given({ accessToken: 'gho_x', refreshToken: null, expiresAt: null });
    await secrets.delete(user.github_token_ref!);

    await expect(service.accessTokenFor(USER_ID)).rejects.toMatchObject({
      response: { error: { code: ErrorCode.GITHUB_REAUTH_REQUIRED } },
    });
  });
});
