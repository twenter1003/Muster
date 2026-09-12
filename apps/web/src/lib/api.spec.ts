// vitest globals를 켜지 않았다. 설정을 바꾸는 대신 명시적으로 들여온다 —
// 이 저장소의 첫 프론트엔드 테스트라, 전역 주입을 켜는 판단은 테스트가 더 쌓인 뒤가 맞다.
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, apiFetch, apiPost } from './api';

/**
 * 204를 잘못 다루면 서버에서는 삭제가 끝났는데 화면만 실패로 보인다.
 * 사용자가 이미 지워진 것을 다시 지우려 들게 만드는 종류의 버그라 테스트로 못박는다.
 */
describe('apiFetch', () => {
  const mockFetch = (res: Partial<Response>) => {
    globalThis.fetch = (() => Promise.resolve(res as Response)) as typeof fetch;
  };

  const headers = (h: Record<string, string> = {}) => ({ get: (k: string) => h[k] ?? null });

  afterEach(() => {
    // 다른 테스트가 전역 fetch를 물려받지 않게 한다.
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('204 No Content에서 터지지 않는다', async () => {
    mockFetch({
      ok: true,
      status: 204,
      headers: headers() as Headers,
      json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
    });

    await expect(apiFetch<void>('/api-keys/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('content-length: 0인 200에서도 터지지 않는다', async () => {
    mockFetch({
      ok: true,
      status: 200,
      headers: headers({ 'content-length': '0' }) as Headers,
      json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
    });

    await expect(apiFetch<void>('/whatever')).resolves.toBeUndefined();
  });

  it('본문이 있으면 그대로 파싱한다', async () => {
    mockFetch({
      ok: true,
      status: 200,
      headers: headers({ 'content-length': '20' }) as Headers,
      json: () => Promise.resolve({ id: 'p1' }),
    });

    await expect(apiFetch<{ id: string }>('/projects/p1')).resolves.toEqual({ id: 'p1' });
  });

  it('에러 응답은 설계서 Part 4 §1의 코드·메시지를 그대로 싣는다', async () => {
    mockFetch({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      headers: headers() as Headers,
      json: () => Promise.resolve({ error: { code: 'POLICY_NOT_PASSED', message: '막혔다' } }),
    });

    const error = await apiFetch('/env-configs/x/approve').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'POLICY_NOT_PASSED', message: '막혔다' });
  });

  it('에러 본문이 JSON이 아니어도 던지되 상태 코드를 잃지 않는다', async () => {
    mockFetch({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      headers: headers() as Headers,
      json: () => Promise.reject(new SyntaxError('not json')),
    });

    await expect(apiFetch('/anything')).rejects.toMatchObject({ status: 502, code: 'INTERNAL' });
  });
});

/**
 * apiPost는 화면마다 손으로 적던 method/body/헤더를 한 곳으로 모은 것뿐이다.
 * 그래서 테스트가 확인하는 것도 "손으로 적던 것과 똑같이 나가는가" 하나다.
 */
describe('apiPost', () => {
  let seen: { url: string; init: RequestInit } | null = null;

  const capture = () => {
    seen = null;
    globalThis.fetch = ((url: string, init: RequestInit) => {
      seen = { url, init };
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null } as unknown as Headers,
        json: () => Promise.resolve({ id: 'c1' }),
      } as Response);
    }) as unknown as typeof fetch;
  };

  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('본문을 JSON으로 직렬화하고 Content-Type을 붙인다', async () => {
    capture();
    await expect(apiPost<{ id: string }>('/env-configs', { name: 'x' })).resolves.toEqual({
      id: 'c1',
    });

    const call = seen as unknown as { url: string; init: RequestInit };
    expect(call.url).toBe('/api/v1/env-configs');
    expect(call.init.method).toBe('POST');
    expect(call.init.body).toBe('{"name":"x"}');
    expect(call.init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  // 승인·거부처럼 경로만으로 뜻이 완결되는 POST는 본문 없이 나가야 한다.
  // `{}`를 보내면 "빈 객체를 보냈다"와 "아무것도 안 보냈다"가 서버에서 섞인다.
  it('본문을 생략하면 body 없이 보낸다', async () => {
    capture();
    await apiPost('/env-configs/x/approve');

    const call = seen as unknown as { init: RequestInit };
    expect(call.init.method).toBe('POST');
    expect('body' in call.init).toBe(false);
  });
});
