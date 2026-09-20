/**
 * 훅(scripts/claude-code-hooks, scripts/antigravity-hooks)이 리포트에 실어 보내는
 * hook_version과 비교할 "최신" 값. 두 훅 스크립트의 HOOK_VERSION 상수와 항상 같이
 * 올린다 — 훅이 서버로 보내는 리포팅 방식 자체가 바뀔 때만 올리고, 다른 수정에는
 * 건드리지 않는다(매번 올리면 방금 설치한 최신본도 "오래됨"으로 잘못 뜬다).
 *
 * 프로젝트의 가장 최근 실행이 보고한 hook_version이 이 값보다 낮으면 화면에
 * "이 머신 훅이 오래됨" 배너를 띄운다(usage-timeseries.service.ts 참조).
 */
export const LATEST_HOOK_VERSION = 1;
