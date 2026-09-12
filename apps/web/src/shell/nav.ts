import type { Measurable } from '../lib/domain';

/**
 * 사이드바 구성. 목업 1a의 항목·그룹을 그대로 옮겼다.
 *
 * 배지는 사이드바가 실제로 세어 주는 항목에만 단다. 지금은 알림 하나뿐이다.
 * 프로젝트에도 자리표시자(null)를 달아 두었었는데, 그 자리는 채워지지 않은 채 —(측정 불가)만
 * 상시 떠 있었다 — 측정할 수 있는 값을 측정하지 못하는 것처럼 보이게 하는 표시다.
 * 세어 주는 쪽이 생기면 그때 badge를 도로 단다. 0은 측정 결과라 자리표시자로 쓸 수 없다.
 */
export interface NavItem {
  to: string;
  label: string;
  /** 768–1279 구간에서 라벨 대신 보이는 글리프. 아이콘 라이브러리를 들이지 않으려고 문자로 둔다. */
  icon: string;
  badge?: Measurable<number>;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: '개요',
    items: [
      { to: '/', label: '대시보드', icon: '◼' },
      { to: '/projects', label: '프로젝트', icon: '▤' },
      { to: '/inbox', label: '알림', icon: '✉', badge: null },
    ],
  },
  {
    label: '모듈',
    items: [
      { to: '/docstore', label: 'DocStore', icon: '▦' },
      { to: '/envcatalog', label: 'EnvCatalog', icon: '▣' },
      { to: '/agentregistry', label: 'AgentRegistry', icon: '◈' },
      { to: '/logs', label: '로그 · 헬스', icon: '≡' },
    ],
  },
  {
    label: '관리',
    items: [
      { to: '/reports', label: '리포트', icon: '▧' },
      { to: '/audit', label: '감사 로그', icon: '◷' },
      { to: '/settings', label: '설정', icon: '⚙' },
    ],
  },
];

/**
 * <768 하단 탭 4개. 설계서 09 — 모바일은 기능 축소가 아니라 과업 축소이므로
 * 사이드바를 접는 게 아니라 이동 중에 실제로 하는 일만 남긴다.
 */
export const BOTTOM_TABS: readonly NavItem[] = [
  { to: '/', label: '개요', icon: '◼' },
  { to: '/projects', label: '프로젝트', icon: '▤' },
  { to: '/logs', label: '로그', icon: '≡' },
  { to: '/settings', label: '설정', icon: '⚙' },
];
