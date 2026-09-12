import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session';

/**
 * 로그인하지 않았으면 /login으로 보낸다.
 *
 * 이건 보안 장치가 아니라 화면 흐름이다 — 실제 차단은 서버의 전역 AuthGuard가 한다.
 * 클라이언트 라우팅만으로 막으면 데이터는 그대로 내려온다. 여기서 하는 일은 "빈 화면과
 * 401 에러 다발" 대신 로그인 화면을 보여 주는 것뿐이다.
 *
 * loading 동안 아무것도 렌더하지 않는 이유: 세션이 있는데도 로그인 화면이 한 번 번쩍이면
 * 새로고침할 때마다 로그아웃된 것처럼 보인다.
 */
export function RequireSession() {
  const { user, loading, failed } = useSession();
  const location = useLocation();

  if (loading) return <p className="page__note">확인 중…</p>;

  // 서버 장애(500·네트워크)를 로그인 만료로 오해해 내보내지 않는다. 다시 시도할 여지를 남긴다.
  if (failed) {
    return <p className="page__note">서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>;
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <Outlet />;
}
