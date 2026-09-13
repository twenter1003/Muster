import type { Repository } from 'typeorm';
import type { GitIntegration } from '../../database/entities';
import type { GitHubTokenService } from '../auth/github-token.service';
import { ApiException } from '../../common/errors/api.exception';
import { EnvWorkflowInstaller, INSTALL_BRANCH } from './env-workflow-installer';
import { ENV_WORKFLOW_CONTENT, ENV_WORKFLOW_PATH } from './env-workflow-template';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const LINKED = { repo_url: 'https://github.com/octo/app' } as Partial<GitIntegration>;

type Call = { url: string; method: string; body: unknown };

/** 호출 순서대로 응답을 돌려주는 fetch 대역. 요청은 전부 기록한다. */
function stubFetch(responses: { status: number; body?: unknown; scopes?: string }[]) {
  const calls: Call[] = [];
  let i = 0;
  global.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const res = responses[i++] ?? { status: 204 };
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      headers: { get: (n: string) => (n === 'x-oauth-scopes' ? (res.scopes ?? null) : null) },
      json: async () => res.body ?? {},
      text: async () => JSON.stringify(res.body ?? {}),
    };
  }) as unknown as typeof fetch;
  return calls;
}

const make = (integration: Partial<GitIntegration> | null) =>
  new EnvWorkflowInstaller(
    { findOneBy: async () => integration } as unknown as Repository<GitIntegration>,
    { accessTokenFor: async () => 'gho_token' } as unknown as GitHubTokenService,
  );

const userMessage = (e: unknown) =>
  e instanceof ApiException
    ? (e.getResponse() as { error: { message: string } }).error.message
    : '';

/** 기본 브랜치 조회 → 기본 브랜치의 파일 확인(404, 없음) */
const START = [{ status: 200, body: { default_branch: 'trunk' } }, { status: 404 }];

describe('EnvWorkflowInstaller', () => {
  it('연동이 없으면 무엇을 먼저 해야 하는지 말한다', async () => {
    const error = await make(null)
      .install(PROJECT, USER)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 400 });
    expect(userMessage(error)).toContain('연동');
  });

  it('브랜치를 만들고 파일을 올린 뒤 PR을 연다', async () => {
    const calls = stubFetch([
      ...START,
      { status: 200, body: { object: { sha: 'base-sha' } } }, // 기본 브랜치 끝
      { status: 201 }, // 브랜치 생성
      { status: 404 }, // 브랜치에 파일 없음
      { status: 201 }, // 파일 커밋
      { status: 201, body: { html_url: 'https://github.com/octo/app/pull/7' } },
    ]);

    const r = await make(LINKED).install(PROJECT, USER);

    expect(r).toEqual({
      already_installed: false,
      pull_request_url: 'https://github.com/octo/app/pull/7',
    });

    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toContain(ENV_WORKFLOW_PATH);
    const body = put?.body as { content: string; branch: string; sha?: string };
    expect(Buffer.from(body.content, 'base64').toString('utf8')).toBe(ENV_WORKFLOW_CONTENT);
    expect(body.branch).toBe(INSTALL_BRANCH);
    // 새 파일이라 sha를 실으면 안 된다 — 실으면 GitHub이 422를 낸다.
    expect(body.sha).toBeUndefined();
  });

  /** 기본 브랜치를 넘겨짚지 않는다. master·trunk인 레포에서 PR이 엉뚱한 곳으로 간다. */
  it('PR의 base는 레포에 물어본 기본 브랜치다', async () => {
    const calls = stubFetch([
      ...START,
      { status: 200, body: { object: { sha: 'base-sha' } } },
      { status: 201 },
      { status: 404 },
      { status: 201 },
      { status: 201, body: { html_url: 'https://github.com/octo/app/pull/7' } },
    ]);

    await make(LINKED).install(PROJECT, USER);

    const pr = calls.find((c) => c.url.endsWith('/pulls'));
    expect(pr?.body).toMatchObject({ base: 'trunk', head: INSTALL_BRANCH });
  });

  it('이미 기본 브랜치에 있으면 아무것도 하지 않는다 — 빈 PR을 열지 않는다', async () => {
    const calls = stubFetch([{ status: 200, body: { default_branch: 'main' } }, { status: 200 }]);

    const r = await make(LINKED).install(PROJECT, USER);

    expect(r).toEqual({ already_installed: true, pull_request_url: null });
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('브랜치가 이미 있으면(422) 그 위에 덮어쓴다 — 두 번 눌러도 안전하다', async () => {
    const calls = stubFetch([
      ...START,
      { status: 200, body: { object: { sha: 'base-sha' } } },
      { status: 422 }, // 브랜치 이미 있음
      { status: 200, body: { sha: 'blob-sha' } }, // 파일도 이미 있음
      { status: 200 }, // 갱신
      { status: 201, body: { html_url: 'https://github.com/octo/app/pull/7' } },
    ]);

    const r = await make(LINKED).install(PROJECT, USER);

    expect(r.pull_request_url).toBe('https://github.com/octo/app/pull/7');
    // 갱신에는 blob sha가 반드시 실려야 한다. 빠지면 422로 덮어쓰기가 거부된다.
    expect((calls.find((c) => c.method === 'PUT')?.body as { sha?: string }).sha).toBe('blob-sha');
  });

  it('PR이 이미 열려 있으면(422) 그것을 돌려준다', async () => {
    stubFetch([
      ...START,
      { status: 200, body: { object: { sha: 'base-sha' } } },
      { status: 201 },
      { status: 404 },
      { status: 201 },
      { status: 422 }, // 이 브랜치의 PR이 이미 있다
      { status: 200, body: [{ html_url: 'https://github.com/octo/app/pull/3' }] },
    ]);

    const r = await make(LINKED).install(PROJECT, USER);

    expect(r.pull_request_url).toBe('https://github.com/octo/app/pull/3');
  });

  /**
   * .github/workflows/ 아래 파일은 repo만으로는 못 쓴다. workflow 스코프는 나중에
   * 추가됐으므로 옛 토큰은 반드시 여기서 막히는데, 고칠 곳은 레포가 아니라 로그인이다.
   */
  it('workflow 스코프가 없으면 재로그인을 안내한다', async () => {
    stubFetch([
      { status: 200, body: { default_branch: 'main' } },
      { status: 404 },
      { status: 200, body: { object: { sha: 'base-sha' } } },
      { status: 201 },
      { status: 404 },
      { status: 403, scopes: 'read:user, admin:repo_hook, repo' },
    ]);

    const error = await make(LINKED)
      .install(PROJECT, USER)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'GITHUB_REAUTH_REQUIRED', status: 403 });
    expect(userMessage(error)).toContain('다시 로그인');
  });

  /** 커밋이 없는 레포는 브랜치를 딸 곳이 없다. 502로 뭉개면 사용자가 원인을 알 수 없다. */
  it('빈 레포(409)는 무엇을 해야 하는지 말한다', async () => {
    stubFetch([...START, { status: 409 }]);

    const error = await make(LINKED)
      .install(PROJECT, USER)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 400 });
    expect(userMessage(error)).toContain('비어 있습니다');
  });

  it('401은 재인증이다 — 토큰을 GitHub이 거부한 것이라 재시도로는 안 된다', async () => {
    stubFetch([{ status: 401 }]);

    const error = await make(LINKED)
      .install(PROJECT, USER)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'GITHUB_REAUTH_REQUIRED' });
  });

  /** 예상 밖 실패에서 상태 코드가 사라지면, 원인을 좁히려고 서버 로그를 떠 와야 한다. */
  it('그 밖의 실패는 GitHub이 준 상태 코드를 메시지에 남긴다', async () => {
    stubFetch([{ status: 500 }]);

    const error = await make(LINKED)
      .install(PROJECT, USER)
      .catch((e: unknown) => e);

    expect(userMessage(error)).toContain('500');
  });

  it('스코프가 충분한 403은 레포 권한을 가리킨다 — 재로그인은 소용없다', async () => {
    stubFetch([
      { status: 200, body: { default_branch: 'main' } },
      { status: 404 },
      { status: 200, body: { object: { sha: 'base-sha' } } },
      { status: 201 },
      { status: 404 },
      { status: 403, scopes: 'read:user, admin:repo_hook, repo, workflow' },
    ]);

    const error = await make(LINKED)
      .install(PROJECT, USER)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect(userMessage(error)).toContain('레포 권한');
  });
});
