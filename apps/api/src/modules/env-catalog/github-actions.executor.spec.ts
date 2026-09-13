import type { Repository } from 'typeorm';
import type { GitIntegration } from '../../database/entities';
import type { GitHubTokenService } from '../auth/github-token.service';
import { ApiException } from '../../common/errors/api.exception';
import { GitHubActionsExecutor, WORKFLOW_FILE } from './github-actions.executor';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const CONFIG = '33333333-3333-4333-8333-333333333333';

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

/** 호출 순서대로 응답을 돌려주는 fetch 대역. 요청은 전부 기록한다. */
function stubFetch(responses: { status: number; body?: unknown }[]) {
  const calls: Call[] = [];
  let i = 0;
  global.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(init.body as string) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    const res = responses[i++] ?? { status: 204 };
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: async () => res.body ?? {},
      text: async () => JSON.stringify(res.body ?? {}),
    };
  }) as unknown as typeof fetch;
  return calls;
}

const make = (integration: Partial<GitIntegration> | null) => {
  const integrations = {
    findOneBy: async () => integration,
  } as unknown as Repository<GitIntegration>;
  const tokens = { accessTokenFor: async () => 'gho_token' } as unknown as GitHubTokenService;

  return new GitHubActionsExecutor(integrations, tokens);
};

const params = { envConfigId: CONFIG, projectId: PROJECT, userId: USER };

/** 사용자에게 보이는 메시지는 응답 본문 안에 있다 (`.message`는 "Api Exception"이다). */
const userMessage = (error: unknown): string =>
  error instanceof ApiException
    ? ((error.getResponse() as { error: { message: string } }).error.message ?? '')
    : String(error);
const LINKED = { project_id: PROJECT, repo_url: 'https://github.com/owner/repo' };

describe('GitHubActionsExecutor', () => {
  afterEach(() => jest.restoreAllMocks());

  it('레포의 기본 브랜치를 물어본 뒤 그 ref로 워크플로를 실행시킨다', async () => {
    const calls = stubFetch([
      { status: 200, body: { default_branch: 'develop' } },
      { status: 204 },
    ]);

    await make(LINKED).start(params);

    expect(calls[0].url).toBe('https://api.github.com/repos/owner/repo');
    expect(calls[1].url).toBe(
      `https://api.github.com/repos/owner/repo/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    );
    expect(calls[1].method).toBe('POST');
    // 기본 브랜치를 main으로 넘겨짚으면 master·develop 레포에서 조용히 422가 난다.
    expect(calls[1].body).toEqual({ ref: 'develop', inputs: { env_config_id: CONFIG } });
    expect(calls[1].headers.Authorization).toBe('Bearer gho_token');
  });

  it('연동이 없으면 400으로 막는다 — 사용자가 고칠 수 있는 문제다', async () => {
    const calls = stubFetch([]);

    await expect(make(null).start(params)).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('워크플로 파일이 없으면(404) 무엇을 넣어야 하는지 알려준다', async () => {
    stubFetch([{ status: 200, body: { default_branch: 'main' } }, { status: 404 }]);

    const error = await make(LINKED)
      .start(params)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400 });
    expect(userMessage(error)).toContain(WORKFLOW_FILE);
  });

  it('권한이 없으면(403) 403으로 올린다', async () => {
    stubFetch([{ status: 200, body: { default_branch: 'main' } }, { status: 403 }]);

    await expect(make(LINKED).start(params)).rejects.toMatchObject({ status: 403 });
  });

  it('422는 트리거 선언을 확인하라고 안내한다', async () => {
    stubFetch([{ status: 200, body: { default_branch: 'main' } }, { status: 422 }]);

    const error = await make(LINKED)
      .start(params)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400 });
    expect(userMessage(error)).toContain('workflow_dispatch');
  });

  it('그 밖의 실패는 502다 — 우리 잘못도 사용자 잘못도 아니다', async () => {
    stubFetch([{ status: 200, body: { default_branch: 'main' } }, { status: 500 }]);

    await expect(make(LINKED).start(params)).rejects.toMatchObject({ status: 502 });
  });

  it('기본 브랜치를 못 읽으면 dispatch를 시도하지 않는다', async () => {
    // ref 없이는 dispatch가 불가능하다. 넘겨짚고 쏘면 원인이 엉뚱한 곳에서 드러난다.
    const calls = stubFetch([{ status: 200, body: {} }]);

    await expect(make(LINKED).start(params)).rejects.toMatchObject({ status: 502 });
    expect(calls).toHaveLength(1);
  });
});
