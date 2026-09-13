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
function stubFetch(responses: { status: number; body?: unknown; scopes?: string }[]) {
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
      // GitHub은 토큰의 스코프를 이 헤더로 알려 준다 — 403의 원인을 가르는 유일한 단서다.
      headers: { get: (name: string) => (name === 'x-oauth-scopes' ? (res.scopes ?? null) : null) },
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

const params = {
  envConfigId: CONFIG,
  projectId: PROJECT,
  userId: USER,
  dockerfile: 'FROM node:22-alpine\n',
};

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
    expect(calls[1].body).toEqual({
      ref: 'develop',
      // Dockerfile을 함께 실어 보낸다 — 레포에 커밋된 파일이 아니라 이 구성의 내용을 검증한다.
      inputs: { env_config_id: CONFIG, dockerfile: 'FROM node:22-alpine\n' },
    });
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

  /**
   * repo 스코프는 실행기가 들어온 뒤에 추가됐다. 그 전에 로그인한 토큰으로는 레포
   * 권한이 완벽해도 403이 나는데, 화면에 "레포 권한을 확인하라"만 뜨면 사용자는
   * 영영 엉뚱한 곳을 뒤진다 — 실제로 그렇게 막혔다.
   */
  it('토큰에 repo 스코프가 없으면 재로그인을 안내한다', async () => {
    stubFetch([
      { status: 200, body: { default_branch: 'main' } },
      { status: 403, scopes: 'read:user, admin:repo_hook' },
    ]);

    const error = await make(LINKED)
      .start(params)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'GITHUB_REAUTH_REQUIRED', status: 403 });
    expect(userMessage(error)).toContain('다시 로그인');
  });

  it('스코프가 충분한 403은 레포 설정을 가리킨다 — 재로그인은 소용없다', async () => {
    stubFetch([
      { status: 200, body: { default_branch: 'main' } },
      { status: 403, scopes: 'read:user, admin:repo_hook, repo' },
    ]);

    const error = await make(LINKED)
      .start(params)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect(userMessage(error)).toContain('Actions 활성화');
  });

  /**
   * 204만 성공으로 보다가 프로덕션에서 크게 데였다. GitHub이 200에 workflow_run_id를 담아
   * 돌려주기 시작했는데 그것을 실패로 읽어, 이미 돌고 있는 실행을 failed로 뒤집었다.
   * 화면에는 실패로 남고 워크플로는 계속 도는 어긋남이었다.
   */
  it('200에 실행 정보를 담아 줘도 성공이다 — 성공의 정의는 2xx다', async () => {
    stubFetch([
      { status: 200, body: { default_branch: 'main' } },
      { status: 200, body: { workflow_run_id: 34758292446 } },
    ]);

    await expect(make(LINKED).start(params)).resolves.toBeUndefined();
  });

  it('201도 성공이다', async () => {
    stubFetch([{ status: 200, body: { default_branch: 'main' } }, { status: 201 }]);

    await expect(make(LINKED).start(params)).resolves.toBeUndefined();
  });

  /** 65,535자를 넘는 inputs는 GitHub이 이유 없는 422로 거절한다. 먼저 막아 이유를 남긴다. */
  it('Dockerfile이 상한을 넘으면 보내기 전에 막는다', async () => {
    const calls = stubFetch([{ status: 200, body: { default_branch: 'main' } }]);

    const error = await make(LINKED)
      .start({ ...params, dockerfile: 'x'.repeat(60_001) })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 400 });
    expect(userMessage(error)).toContain('너무 큽니다');
    // 보내기 전에 막아야 의미가 있다. GitHub에 요청이 나가면 안 된다.
    expect(calls).toEqual([]);
  });

  it('401은 재인증이다 — 토큰을 GitHub이 거부한 것이라 재시도로는 안 된다', async () => {
    stubFetch([{ status: 200, body: { default_branch: 'main' } }, { status: 401 }]);

    const error = await make(LINKED)
      .start(params)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'GITHUB_REAUTH_REQUIRED' });
  });

  /** 예상 밖 실패에서 상태 코드가 사라지면, 원인을 좁히려고 서버 로그를 떠 와야 한다. */
  it('그 밖의 실패는 GitHub이 준 상태 코드를 메시지에 남긴다', async () => {
    stubFetch([{ status: 200, body: { default_branch: 'main' } }, { status: 500 }]);

    const error = await make(LINKED)
      .start(params)
      .catch((e: unknown) => e);

    expect(userMessage(error)).toContain('500');
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
