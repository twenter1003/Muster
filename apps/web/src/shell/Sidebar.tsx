import { NavLink } from 'react-router-dom';
import { EM_DASH } from '../lib/domain';
import { NAV_GROUPS, type NavItem } from './nav';

function Item({ item }: { item: NavItem }) {
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
        // 아직 측정 전이라 —. 0을 쓰면 "대기 0건"이라는 측정 결과로 읽힌다.
        <span className="nav-item__badge">{item.badge === null ? EM_DASH : item.badge}</span>
      )}
    </NavLink>
  );
}

/** 고정 사이드바(설계서 02 · 1a). 예산 초과·Policy Gate 차단이 배지로 상시 떠 있어야 해서 기본 셸이 됐다. */
export function Sidebar() {
  return (
    <nav className="shell__sidebar" aria-label="주 메뉴">
      <span className="brand">Muster</span>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="nav-group">
          <div className="nav-group__label">{group.label}</div>
          {group.items.map((item) => (
            <Item key={item.to} item={item} />
          ))}
        </div>
      ))}
    </nav>
  );
}
