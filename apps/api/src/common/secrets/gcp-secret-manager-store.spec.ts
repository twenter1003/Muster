import { ApiException } from '../errors/api.exception';
import { GcpSecretManagerStore } from './gcp-secret-manager-store';

/** ADC 대신 고정 토큰을 준다. */
const auth = {
  getClient: async () => ({ getAccessToken: async () => ({ token: 'tok' }) }),
};

type Call = { method: string; url: string; body: unknown };

/** 호출 순서대로 응답을 돌려주는 fetch 대역. 요청은 전부 기록한다. */
function stubFetch(responses: { status: number; body?: unknown }[]) {
  const calls: Call[] = [];
  let i = 0;
  global.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({
      method: init.method ?? 'GET',
      url,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const res = responses[i++] ?? { status: 200, body: {} };
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: async () => res.body ?? {},
      text: async () => JSON.stringify(res.body ?? {}),
    };
  }) as unknown as typeof fetch;
  return calls;
}

describe('GcpSecretManagerStore', () => {
  const store = new GcpSecretManagerStore('proj', auth);
  const version = 'projects/proj/secrets/hook-1/versions/2';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('시크릿을 만들고 값을 base64로 올린 뒤 gcp:// 참조를 돌려준다', async () => {
    const calls = stubFetch([
      { status: 200 }, // create
      { status: 200, body: { name: version } }, // addVersion
      { status: 200, body: { versions: [{ name: version }] } }, // list
    ]);

    await expect(store.put('hook-1', 'secret-value')).resolves.toBe('gcp://hook-1');

    expect(calls[0].url).toContain('/secrets?secretId=hook-1');
    expect(calls[1].url).toContain('/secrets/hook-1:addVersion');
    expect(calls[1].body).toEqual({
      payload: { data: Buffer.from('secret-value').toString('base64') },
    });
  });

  it('이미 있는 시크릿(409)은 버전만 추가한다', async () => {
    const calls = stubFetch([
      { status: 409 },
      { status: 200, body: { name: version } },
      { status: 200, body: { versions: [{ name: version }] } },
    ]);

    await expect(store.put('hook-1', 'v2')).resolves.toBe('gcp://hook-1');
    expect(calls[1].url).toContain(':addVersion');
  });

  it('회전 후 이전 활성 버전만 폐기한다 — 무료 한도가 활성 6개다', async () => {
    const older = 'projects/proj/secrets/hook-1/versions/1';
    const calls = stubFetch([
      { status: 200 },
      { status: 200, body: { name: version } },
      { status: 200, body: { versions: [{ name: older }, { name: version }] } },
      { status: 200 },
    ]);

    await store.put('hook-1', 'v2');

    const destroys = calls.filter((c) => c.url.endsWith(':destroy'));
    expect(destroys).toHaveLength(1);
    expect(destroys[0].url).toBe(`https://secretmanager.googleapis.com/v1/${older}:destroy`);
  });

  it('버전 정리가 실패해도 put은 성공한다 — 값은 이미 저장됐다', async () => {
    stubFetch([{ status: 200 }, { status: 200, body: { name: version } }, { status: 500 }]);
    await expect(store.put('hook-1', 'v2')).resolves.toBe('gcp://hook-1');
  });

  // 403은 설정 문제로 따로 갈라져 나가므로(아래) 여기서는 일반 실패인 500을 쓴다.
  it('버전 추가가 실패하면 던진다', async () => {
    stubFetch([{ status: 200 }, { status: 500, body: { error: 'boom' } }]);
    await expect(store.put('hook-1', 'v')).rejects.toThrow('버전 추가 실패');
  });

  it('값을 base64에서 되돌려 읽는다', async () => {
    const calls = stubFetch([
      { status: 200, body: { payload: { data: Buffer.from('원문').toString('base64') } } },
    ]);

    await expect(store.get('gcp://hook-1')).resolves.toBe('원문');
    expect(calls[0].url).toContain('/secrets/hook-1/versions/latest:access');
  });

  it('없는 시크릿(404)과 폐기된 버전(400)은 null이다', async () => {
    stubFetch([{ status: 404 }]);
    await expect(store.get('gcp://hook-1')).resolves.toBeNull();
    stubFetch([{ status: 400 }]);
    await expect(store.get('gcp://hook-1')).resolves.toBeNull();
  });

  it('다른 저장소의 참조는 호출 없이 null이다', async () => {
    const calls = stubFetch([]);
    await expect(store.get('file://hook-1')).resolves.toBeNull();
    await store.delete('file://hook-1');
    expect(calls).toHaveLength(0);
  });

  it('참조에 섞인 경로 조작은 정규화된다', async () => {
    const calls = stubFetch([{ status: 404 }]);
    await store.get('gcp://../../etc/passwd');
    expect(calls[0].url).not.toContain('..');
  });

  it('삭제는 없는 시크릿을 실패로 보지 않는다', async () => {
    stubFetch([{ status: 404 }]);
    await expect(store.delete('gcp://hook-1')).resolves.toBeUndefined();
  });

  /**
   * 403은 배포 설정 누락이라 500 INTERNAL로 접히면 안 된다. 실제로 Cloud Run 서비스
   * 계정에 프로젝트 수준 권한이 없어 레포 연동이 "서버 내부 오류"로만 죽은 적이 있다.
   */
  it('권한 오류(403)는 무엇을 해야 하는지 말하는 503으로 나간다', async () => {
    stubFetch([{ status: 403, body: { error: { status: 'PERMISSION_DENIED' } } }]);

    const err = await store.get('gcp://github-token-1').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiException);
    const api = err as ApiException;
    expect(api.code).toBe('SECRET_STORE_UNAVAILABLE');
    expect(api.getStatus()).toBe(503);
    expect((api.getResponse() as { error: { message: string } }).error.message).toContain(
      'secretmanager.admin',
    );
  });

  it('인증 오류(401)도 같은 길로 간다 — 토큰이 없거나 죽은 것도 설정 문제다', async () => {
    stubFetch([{ status: 401 }]);

    const err = await store.put('github-token-1', 'v').catch((e: unknown) => e);

    expect((err as ApiException).code).toBe('SECRET_STORE_UNAVAILABLE');
  });

  it('그 밖의 실패는 그대로 500이다 — 일시적이거나 우리가 손쓸 수 없다', async () => {
    stubFetch([{ status: 500 }]);

    const err = await store.delete('gcp://hook-1').catch((e: unknown) => e);

    expect(err).not.toBeInstanceOf(ApiException);
    expect((err as Error).message).toContain('삭제 실패');
  });
});
