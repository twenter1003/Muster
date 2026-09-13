import { NavLink } from 'react-router-dom';
import { EM_DASH } from '../lib/domain';
import { useApi } from '../lib/useApi';
import { NAV_GROUPS, type NavItem } from './nav';

/** 사이드바가 배지로 쓰는 부분만. 전체 계약은 routes/InboxPage.tsx 에 있다. */
interface InboxCounts {
  counts: { total: number };
}

function Item({ item, badge }: { item: NavItem; badge?: number | null }) {
  // nav.ts의 자리표시자(null)를 실제 측정값이 있을 때만 덮는다.
  const value = badge !== undefined ? badge : item.badge;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className="nav-item"
      // 아이콘만 남는 구간(768–1279)에서도 이름이 보조기기에 남아야 한다.
      aria-label={item.label}
    >
      <span className="nav-item__icon" aria-hidden="true">
        {item.icon}
      </span>
      <span className="nav-item__label">{item.label}</span>
      {item.badge !== undefined && (
        // 아직 측정 전이면 —. 0을 쓰면 "대기 0건"이라는 측정 결과로 읽히는데, 인박스만은
        // 서버가 실제로 0을 세어 주므로 0이 결과다.
        <span className="nav-item__badge">{value === null ? EM_DASH : value}</span>
      )}
    </NavLink>
  );
}

/** 고정 사이드바(설계서 02 · 1a). 예산 초과·Policy Gate 차단이 배지로 상시 떠 있어야 해서 기본 셸이 됐다. */
export function Sidebar() {
  // 배지는 셸에 상시 떠 있어야 해서(설계서 02) 화면이 아니라 사이드바가 센다.
  // 인박스 화면과 요청이 겹치지만, 배지를 화면에서 끌어올리면 다른 화면에 있는 동안
  // 숫자가 멈춘다 — 그게 이 배지가 존재하는 이유를 없앤다.
  const inbox = useApi<InboxCounts>('/inbox');
  const inboxTotal = inbox.data?.counts.total ?? null;

  return (
    <nav className="shell__sidebar" aria-label="주 메뉴">
      <span className="brand">Muster</span>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="nav-group">
          <div className="nav-group__label">{group.label}</div>
          {group.items.map((item) => (
            <Item key={item.to} item={item} badge={item.to === '/inbox' ? inboxTotal : undefined} />
          ))}
        </div>
      ))}
    </nav>
  );
}
