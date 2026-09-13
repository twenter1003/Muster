import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { ApiError, apiPost } from '../lib/api';
import { useSession } from '../lib/session';
import './InvitePage.css';

interface InvitePreview {
  project_id: string;
  project_name: string;
  invited_by: string | null;
  expires_at: string;
  already_member: boolean;
}

/**
 * 로그인 왕복을 건너 초대를 기억하는 자리.
 *
 * 이 화면은 로그인하지 않은 사람이 먼저 도착하는 곳인데, GitHub 로그인은 페이지를 통째로
 * 떠났다가 돌아오는 왕복이라 라우터 상태(`state.from`)가 살아남지 못한다. 그래서 주소창의
 * 토큰을 여기 맡겨 두고, 돌아온 뒤 셸이 꺼내 쓴다.
 *
 * sessionStorage인 이유: 탭을 닫으면 사라져야 한다. localStorage에 두면 몇 달 뒤 다른
 * 사람이 같은 브라우저를 열었을 때 남의 초대가 되살아난다.
 */
const PENDING_KEY = 'muster.pending_invite';

export function rememberInvite(token: string): void {
  try {
    sessionStorage.setItem(PENDING_KEY, token);
  } catch {
    // 사생활 보호 모드 등에서 막힐 수 있다. 기억하지 못할 뿐 로그인 자체는 되므로 삼킨다.
  }
}

/** 맡겨 둔 초대를 꺼내고 지운다. 한 번만 쓰인다 — 두 번 돌려주면 로그인할 때마다 되살아난다. */
export function takeRememberedInvite(): string | null {
  try {
    const token = sessionStorage.getItem(PENDING_KEY);
    if (token !== null) sessionStorage.removeItem(PENDING_KEY);
    return token;
  } catch {
    return null;
  }
}

/**
 * 초대 수락 화면.
 *
 * **RequireSession 바깥에 둔다.** 안쪽에 두면 로그인 안 된 사람이 /login으로 튕기고 주소창의
 * 토큰이 사라진다. 초대 링크는 로그인하지 않은 사람에게 건네는 것이므로, 그 경우가 예외가
 * 아니라 기본이다.
 *
 * 수락 전에 "어느 프로젝트에 누가 불렀는지"를 먼저 보여 준다. 모르는 프로젝트로 들어오라는
 * 링크는 그것만으로 수상하고, 그 판단은 사용자가 해야 한다.
 */
export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: sessionLoading } = useSession();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [joining, setJoining] = useState(false);

  // 로그인 전에는 조회조차 하지 않는다 — 서버가 401을 줄 뿐이고, 그 전에 토큰을 맡겨 둔다.
  useEffect(() => {
    if (token === undefined) return;
    if (user === null) {
      rememberInvite(token);
      return;
    }

    let live = true;
    setChecking(true);

    apiPost<InvitePreview>('/invites/lookup', { token }).then(
      (res) => {
        if (!live) return;
        setPreview(res);
        setError(null);
        setChecking(false);
      },
      (e: unknown) => {
        if (!live) return;
        setChecking(false);
        setError(
          e instanceof ApiError && e.status === 404
            ? '이 초대는 더 이상 쓸 수 없다. 기한이 지났거나 폐기됐다.'
            : e instanceof ApiError
              ? `${e.message} (${e.code})`
              : String(e),
        );
      },
    );

    return () => {
      live = false;
    };
  }, [token, user]);

  const accept = () => {
    if (token === undefined) return;
    setJoining(true);
    setError(null);

    apiPost<{ project_id: string }>('/invites/accept', { token }).then(
      (res) => navigate(`/projects/${res.project_id}`, { replace: true }),
      (e: unknown) => {
        setJoining(false);
        setError(e instanceof ApiError ? `${e.message} (${e.code})` : String(e));
      },
    );
  };

  return (
    <main className="invite">
      <section className="invite__panel">
        <span className="invite__brand">Muster</span>

        {sessionLoading ? (
          <p className="meta">확인 중…</p>
        ) : user === null ? (
          <>
            <h1 className="invite__title">초대를 받았습니다</h1>
            <p className="meta">
              누가 어느 프로젝트로 불렀는지는 로그인한 뒤에 보여 줍니다. 초대를 확인하려면
              GitHub 계정이 필요합니다.
            </p>
            {/* 로그인 뒤 이 초대로 되돌아온다 — 토큰은 이미 맡겨 뒀다. */}
            <a className="btn btn--solid invite__cta" href="/api/v1/auth/github/login">
              GitHub으로 계속하기
            </a>
          </>
        ) : error !== null ? (
          <>
            <h1 className="invite__title">쓸 수 없는 초대</h1>
            <p className="error-note" role="alert">
              {error}
            </p>
            <p className="meta">초대한 사람에게 링크를 다시 받아야 합니다.</p>
            <Button onClick={() => navigate('/')}>대시보드로</Button>
          </>
        ) : checking || preview === null ? (
          <p className="meta">초대를 확인하는 중…</p>
        ) : preview.already_member ? (
          <>
            <h1 className="invite__title">이미 들어와 있습니다</h1>
            <p className="meta">
              <strong>{preview.project_name}</strong>의 멤버입니다. 수락할 것이 없습니다.
            </p>
            <Button variant="solid" onClick={() => navigate(`/projects/${preview.project_id}`)}>
              프로젝트로 가기
            </Button>
          </>
        ) : (
          <>
            <h1 className="invite__title">{preview.project_name}</h1>
            <p className="meta">
              {preview.invited_by === null ? '누군가' : preview.invited_by}가 이 프로젝트로
              초대했습니다. 수락하면 <span className="badge">member</span>로 합류합니다.
            </p>
            <p className="meta">
              멤버는 이 프로젝트의 문서·개발환경·에이전트·로그를 볼 수 있습니다. 다른
              프로젝트는 보이지 않습니다.
            </p>
            <div className="invite__actions">
              <Button variant="solid" onClick={accept} disabled={joining}>
                {joining ? '합류하는 중…' : '수락하고 합류'}
              </Button>
              <Button onClick={() => navigate('/')} disabled={joining}>
                나중에
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
