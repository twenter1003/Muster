import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from './api';

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * GET 한 번을 상태로 감싼다. 화면마다 useEffect + useState 세 개를 복붙하지 않기 위한 최소 단위다.
 *
 * 왜 react-query 같은 걸 안 들이는가: 지금 필요한 것은 로딩·에러·재조회 셋뿐이고,
 * 캐시 무효화 전략이 필요한 화면이 아직 없다. 필요해지면 그때 바꾸는 편이 싸다.
 *
 * path가 null이면 호출하지 않는다 — 아직 :id를 모르는 화면이 빈 요청을 쏘지 않게 한다.
 */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (path === null) return;

    // 응답이 늦게 도착한 이전 요청이 새 결과를 덮어쓰지 않게 한다.
    let live = true;
    setLoading(true);

    apiFetch<T>(path)
      .then((result) => {
        if (!live) return;
        setData(result);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setError(e instanceof ApiError ? e : new ApiError(0, 'INTERNAL', String(e)));
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [path, nonce]);

  return { data, error, loading, reload };
}
