import { createContext, useContext, type ReactNode } from 'react';
import { ApiError } from './api';
import { useApi } from './useApi';

export interface SessionUser {
  id: string;
  github_login: string;
  email: string | null;
}

interface SessionValue {
  user: SessionUser | null;
  loading: boolean;
  /** 인증 실패(401)와 서버 장애를 구분한다. 전자는 로그인으로, 후자는 재시도로 이어진다. */
  failed: boolean;
}

const SessionContext = createContext<SessionValue>({ user: null, loading: true, failed: false });

/**
 * 현재 세션. `GET /auth/me` 한 번으로 결정된다.
 *
 * 토큰을 프론트가 들고 있지 않다는 점이 중요하다 — 세션은 HttpOnly 쿠키에 있고 JS는 읽을 수
 * 없다. 그래서 "로그인했는가"를 로컬 상태로 판단할 방법이 없고, 서버에 물어보는 것이 유일한 길이다.
 * 쿠키는 같은 오리진(dev는 vite 프록시, 배포는 단일 컨테이너)이라 fetch가 자동으로 싣는다.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, error, loading } = useApi<SessionUser>('/auth/me');

  return (
    <SessionContext.Provider
      value={{
        user: data,
        loading,
        // 401은 "로그인 안 됨"이지 오류가 아니다. 그 외 상태 코드만 장애로 본다.
        failed: error !== null && !(error instanceof ApiError && error.status === 401),
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
