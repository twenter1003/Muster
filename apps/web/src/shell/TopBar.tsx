import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { EM_DASH } from '../lib/domain';
import { useTheme } from './useTheme';
import { SearchBox } from './SearchBox';

/**
 * SSE 연결 상태. 'unknown'이 기본인 이유는 아직 구독을 열지 않았기 때문이다 —
 * 끊긴 것(disconnected)과 아직 모르는 것을 같은 표시로 묶으면 거짓 경보가 된다.
 * 실행 스트림이 붙는 Phase 6에서 실제 EventSource 상태가 이 자리로 들어온다.
 */
export type SseState = 'unknown' | 'connecting' | 'connected' | 'disconnected';

const SSE_LABEL: Record<SseState, string> = {
  unknown: `SSE ${EM_DASH}`,
  connecting: 'SSE 연결 중',
  connected: 'SSE 연결됨',
  disconnected: 'SSE 끊김',
};

interface TopBarProps {
  /** 화면 경로. 예: ['개요', '대시보드'] → "개요 / 대시보드" */
  crumbs: readonly string[];
  sse?: SseState;
  /** 로그인 전에는 null. 이름을 지어내지 않는다. */
  userName?: string | null;
}

export function TopBar({ crumbs, sse = 'unknown', userName = null }: TopBarProps) {
  const { theme, cycleTheme } = useTheme();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 로그아웃.
   *
   * 성공하면 라우터로 이동하지 않고 **문서를 통째로 다시 연다**. 이 앱은 화면마다 조회 결과를
   * 메모리에 들고 있어서(프로젝트 이름·로그·문서 목록), 클라이언트 이동만 하면 그것들이 그대로
   * 남는다. 같은 브라우저를 쓰는 다음 사람이 뒤로 가기 한 번으로 남의 자료를 보게 된다.
   * 세션 쿠키는 이미 서버가 지웠으므로, 새로 뜬 문서는 로그인 화면에서 시작한다.
   *
   * 실패하면 이동하지 않는다. 서버가 세션을 아직 살려 둔 채로 로그인 화면만 보여 주면
   * 나갔다고 착각하게 되는데, 그게 로그아웃에서 가장 나쁜 결과다.
   */
  const logout = () => {
    setLeaving(true);
    setError(null);

    apiFetch('/auth/logout', { method: 'POST' }).then(
      () => window.location.assign('/login'),
      () => {
        setLeaving(false);
        setError('로그아웃하지 못했다. 세션이 아직 살아 있다.');
      },
    );
  };

  const dotClass =
    sse === 'disconnected'
      ? 'sse-dot sse-dot--disconnected'
      : sse === 'connected'
        ? 'sse-dot'
        : 'sse-dot sse-dot--connecting';

  return (
    <header className="shell__topbar">
      <span className="topbar__crumb">{crumbs.join(' / ')}</span>
      <SearchBox />
      <div className="topbar__right">
        {/* 점만으로는 색맹 사용자가 상태를 못 읽는다. 라벨을 항상 같이 둔다. */}
        <span className={dotClass} aria-hidden="true" />
        <span>{SSE_LABEL[sse]}</span>
        <span>{userName ?? EM_DASH}</span>
        <button
          type="button"
          className="theme-toggle"
          onClick={cycleTheme}
          aria-label={`테마: ${theme}. 눌러서 전환`}
        >
          {theme}
        </button>
        {/* 로그인한 상태에서만 보인다 — 나갈 세션이 없는데 나가기 버튼을 두지 않는다. */}
        {userName !== null && (
          <button type="button" className="theme-toggle" onClick={logout} disabled={leaving}>
            {leaving ? '나가는 중…' : '로그아웃'}
          </button>
        )}
        {error !== null && (
          <span className="topbar__error" role="alert">
            {error}
          </span>
        )}
      </div>
    </header>
  );
}
