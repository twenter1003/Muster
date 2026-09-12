import { EM_DASH } from '../lib/domain';
import { useTheme } from './useTheme';

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

  const dotClass =
    sse === 'disconnected'
      ? 'sse-dot sse-dot--disconnected'
      : sse === 'connected'
        ? 'sse-dot'
        : 'sse-dot sse-dot--connecting';

  return (
    <header className="shell__topbar">
      <span className="topbar__crumb">{crumbs.join(' / ')}</span>
      <input
        className="topbar__search"
        type="search"
        placeholder="프로젝트·문서·에이전트 검색"
        aria-label="프로젝트·문서·에이전트 검색"
      />
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
      </div>
    </header>
  );
}
