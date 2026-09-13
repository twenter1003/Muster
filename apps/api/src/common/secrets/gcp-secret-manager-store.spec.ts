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

  it('버전 추가가 실패하면 던진다', async () => {
    stubFetch([{ status: 200 }, { status: 403, body: { error: 'denied' } }]);
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

  it('삭제가 권한 문제로 실패하면 던진다', async () => {
    stubFetch([{ status: 403 }]);
    await expect(store.delete('gcp://hook-1')).rejects.toThrow('삭제 실패');
  });
});
