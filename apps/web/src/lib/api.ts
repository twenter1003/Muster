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

  return (await res.json()) as T;
}
