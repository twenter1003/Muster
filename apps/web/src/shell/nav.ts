import type { Measurable } from '../lib/domain';

/**
 * 사이드바 구성. 목업 1a의 항목·그룹을 그대로 옮겼다.
 *
 * 배지 값은 지금 하드코딩하지 않는다. 숫자를 박아 두면 "7"이 실제 측정값처럼 읽히는데
 * 아직 아무것도 측정하지 않았다. Measurable<number> = null 로 두면 화면에는 —(측정 불가)가
 * 나오고, Phase 6에서 값을 채울 자리가 타입으로 남는다. 0은 측정 결과라 지금 쓸 수 없다.
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
      { to: '/projects', label: '프로젝트', icon: '▤', badge: null },
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
