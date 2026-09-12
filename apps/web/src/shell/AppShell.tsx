import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BOTTOM_TABS, NAV_GROUPS } from './nav';

/**
 * 현재 경로에 해당하는 상단바 경로 표기를 만든다.
 * 경로 문자열을 화면마다 따로 적으면 사이드바와 어긋나므로, 사이드바 구성에서 역으로 찾는다.
 * 가장 긴 접두사가 이긴다 — /projects/:id 는 /projects 항목에 속한다.
 */
function useCrumbs(): string[] {
  const { pathname } = useLocation();

  let best: { group: string; label: string; length: number } | null = null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const matches = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
      if (matches && (best === null || item.to.length > best.length)) {
        best = { group: group.label, label: item.label, length: item.to.length };
      }
    }
  }

  return best === null ? ['Muster'] : [best.group, best.label];
}

/**
 * 셸. 라우트는 이 안의 <Outlet/>에 렌더된다.
 * 반응형 3단(≥1280 고정 / 768–1279 아이콘 / <768 하단 탭)은 전부 CSS 미디어쿼리로 처리한다 —
 * JS로 폭을 재면 첫 페인트가 한 번 틀린 레이아웃으로 나갔다가 튀기 때문이다.
 */
export function AppShell() {
  const crumbs = useCrumbs();

  return (
    <div className="shell">
      <Sidebar />
      <TopBar crumbs={crumbs} />
      <main className="shell__main">
        <Outlet />
      </main>
      <nav className="shell__bottom-tabs" aria-label="모바일 메뉴">
        {BOTTOM_TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className="bottom-tab">
            <span aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
