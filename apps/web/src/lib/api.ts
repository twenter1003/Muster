/**
 * API 설계 1장 규약을 타입으로 고정한 클라이언트.
 * mock 화면과 실제 화면이 같은 계약 위에서 동작하도록, 화면 코드는 이 모듈만 통해 서버와 대화한다.
 */
export const API_BASE = '/api/v1';

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      body?.error.code ?? 'INTERNAL',
      body?.error.message ?? res.statusText,
    );
  }

  // 204 No Content는 본문이 없다. 그대로 res.json()을 부르면 SyntaxError로 터지는데,
  // 서버에서는 이미 삭제가 끝난 뒤라 화면만 "실패했다"고 말하게 된다 — 사용자가 지워진 것을
  // 다시 지우려 들게 만드는 종류의 거짓말이다. DELETE /api-keys/:id와
  // DELETE /projects/:id/git-integration이 실제로 이 경로를 탄다.
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/**
 * POST 호출. 화면마다 `{ method: 'POST', body: JSON.stringify(...) }`를 손으로 적던 것을 모은다.
 *
 * body를 선택으로 두는 이유: 승인·거부·재생성처럼 본문 없이 경로만으로 뜻이 완결되는 POST가
 * 이 API에 여럿 있다. 그때 `{}`를 보내면 "빈 객체를 보냈다"와 "아무것도 안 보냈다"가 섞인다.
 */
export async function apiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/**
 * PATCH 호출. POST와 달리 body가 필수다 — 무엇을 바꿀지 없는 부분 수정은 뜻이 없다.
 */
export async function apiPatch<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: 'PATCH', body: JSON.stringify(body) });
}
