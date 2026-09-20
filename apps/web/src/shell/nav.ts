/**
 * 상단바 경로 표기(breadcrumb)의 라벨 원천.
 *
 * 원래는 사이드바 메뉴 구성이었고 목업 1a의 항목 열 개를 그대로 담고 있었다. 그중
 * 아홉 개는 라우트가 없는 화면을 가리켰고, 사이드바 자체도 셸에서 렌더되지 않게 된 지
 * 오래였다 — 지금 이 파일을 실제로 읽는 곳은 AppShell의 `useCrumbs()` 하나뿐이다.
 * 그래서 "메뉴"인 척하지 않고 경로 표기에 필요한 것만 남긴다: 갈 수 있는 곳과 그 이름.
 *
 * 항목을 추가하려면 App.tsx에 라우트가 먼저 있어야 한다. 없는 곳을 여기 적으면
 * 경로 표기가 존재하지 않는 화면 이름을 말하게 된다.
 */
export interface NavItem {
  to: string;
  label: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: '개요',
    items: [
      { to: '/projects', label: '프로젝트' },
      { to: '/import', label: '레포 가져오기' },
    ],
  },
];
