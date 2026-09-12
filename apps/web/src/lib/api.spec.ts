// vitest globals를 켜지 않았다. 설정을 바꾸는 대신 명시적으로 들여온다 —
// 이 저장소의 첫 프론트엔드 테스트라, 전역 주입을 켜는 판단은 테스트가 더 쌓인 뒤가 맞다.
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, apiFetch } from './api';

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
