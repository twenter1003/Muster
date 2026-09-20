/**
 * 화면이 공유하는 도메인 값과 표시 규칙(설계서 10 · 컴포넌트 규칙).
 *
 * 왜 여기 모아 두는가: "같은 정보가 화면마다 다른 모양으로 나오지 않게" 하는 것이 규칙의 목적이라,
 * 임계값이나 신호 대상이 화면마다 복붙되면 규칙이 바로 깨진다. 한 곳에서만 정의한다.
 *
 * 값 집합은 apps/api 의 database/entities/enums.ts 와 같아야 한다. 두 앱이 코드를 공유하지
 * 않으므로(패키지 경계) 여기서 다시 선언하되, 바뀌면 양쪽을 같이 고쳐야 한다.
 */

/** LOG_ENTRIES.level */
export const LOG_LEVELS = ['error', 'warn', 'info'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * 헬스 신호 임계값. 목록·개요·리포트가 반드시 이 상수 하나를 쓴다 —
 * 화면마다 다른 기준으로 붉어지면 훑어보기가 무너진다.
 */
const HEALTH_SIGNAL_THRESHOLD = 2.5;
export const HEALTH_MAX = 4;

export function isHealthSignal(score: number): boolean {
  return score < HEALTH_SIGNAL_THRESHOLD;
}

/**
 * 빈 값 표기. 0과 구분한다 — 0은 측정 결과이고 —는 측정 불가다.
 * 두 표기를 섞지 않기 위해, 값이 없을 수 있는 자리는 반드시 이 상수를 거친다.
 */
export const EM_DASH = '—';

/** 측정되지 않았을 수 있는 값. null이면 —, 숫자면 그대로. */
export type Measurable<T> = T | null;
/**
 * 시각 표기 — "09-12 14:03". 초·연도는 버린다.
 *
 * 목록에서 시각이 하는 일은 "언제쯤이었나"의 정렬 감각이지 정확한 지목이 아니다.
 * 연도까지 찍으면 열 폭이 늘고 모든 행이 같은 연도라 읽을 것이 하나 늘 뿐이다.
 * 정확한 시각이 필요하면 화면이 title 속성으로 원문을 남긴다.
 *
 * 24시간제를 고정하는 이유: 오전/오후 표기는 폭이 행마다 달라져 시각 열이 세로로 흔들린다.
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}
