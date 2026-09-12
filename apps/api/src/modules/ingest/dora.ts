/**
 * DORA 4지표 산출 (통합설계서 Part 2 §6.4).
 *
 * 순수 함수다 — DB도 시계도 건드리지 않고 이벤트 배열과 기준 시각만 받는다.
 * 지표 계산은 눈으로 검증하기 어려운 종류의 코드라, 실제 데이터 없이 경계값을 찍어볼 수
 * 있어야 한다.
 */

export interface ScoredEvent {
  status: 'success' | 'failure';
  committed_at: Date | null;
  occurred_at: Date;
}

/** 각 점수는 Elite/High/Medium/Low를 4/3/2/1로 매핑한 값. 데이터가 없으면 null. */
export interface DoraScores {
  deploy_freq_score: number | null;
  lead_time_score: number | null;
  change_fail_score: number | null;
  mttr_score: number | null;
  /** 남은 지표의 평균. 4개 모두 null이면 스냅샷을 만들지 않으므로 이 값도 null이다. */
  composite_score: number | null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

/**
 * 관측 창. 설계서는 등급 구간("주 1회 이상")만 정하고 어느 기간을 보는지는 정하지 않았다.
 * 90일로 잡는다 — 가장 느슨한 구간이 "분기 1회"라 그보다 짧으면 Medium과 Low를 구분할 수
 * 없고, 그보다 길면 반년 전에 멈춰 있던 프로젝트가 지금도 Elite로 보인다.
 */
export const WINDOW_DAYS = 90;

export function scoreDora(events: readonly ScoredEvent[], now: Date): DoraScores {
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const window = events
    .filter((e) => e.occurred_at > since && e.occurred_at <= now)
    .sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime());

  // 이벤트가 하나도 없으면 "성적이 나쁜 것"이 아니라 "모르는 것"이다. Low(1)를 주면
  // 아직 배포한 적 없는 프로젝트가 실패한 프로젝트와 같은 점수를 받는다.
  if (window.length === 0) {
    return {
      deploy_freq_score: null,
      lead_time_score: null,
      change_fail_score: null,
      mttr_score: null,
      composite_score: null,
    };
  }

  const scores = {
    deploy_freq_score: deployFrequency(window),
    lead_time_score: leadTime(window),
    change_fail_score: changeFailureRate(window),
    mttr_score: mttr(window),
  };

  return { ...scores, composite_score: average(Object.values(scores)) };
}

/** 배포 빈도 — success 이벤트 수를 관측 창 기준 빈도로 환산한다. */
function deployFrequency(window: readonly ScoredEvent[]): number {
  const successes = window.filter((e) => e.status === 'success').length;
  const windowMs = WINDOW_DAYS * DAY;

  // 실패만 있고 성공이 0건인 경우는 "데이터 없음"이 아니라 Low다 — 배포를 시도했고
  // 한 번도 성공하지 못했다는 사실 자체가 측정된 값이다.
  if (successes === 0) return 1;

  const intervalMs = windowMs / successes;
  if (intervalMs <= WEEK) return 4;
  if (intervalMs <= MONTH) return 3;
  return 2; // 창 안에 성공이 1건이라도 있으면 최소 분기 1회는 된다.
}

/** 변경 리드타임 — committed_at → occurred_at 중앙값. */
function leadTime(window: readonly ScoredEvent[]): number | null {
  // 성공한 배포만 센다. 실패한 배포에 걸린 시간은 "변경이 전달되기까지"가 아니다.
  const durations = window
    .filter((e) => e.status === 'success' && e.committed_at)
    .map((e) => e.occurred_at.getTime() - e.committed_at!.getTime());

  const median = medianOf(durations);
  if (median === null) return null;

  if (median <= DAY) return 4;
  if (median <= WEEK) return 3;
  if (median <= MONTH) return 2;
  return 1;
}

/** 변경 실패율 — failure / 전체. */
function changeFailureRate(window: readonly ScoredEvent[]): number {
  const failures = window.filter((e) => e.status === 'failure').length;
  const rate = failures / window.length;

  if (rate <= 0.15) return 4;
  if (rate <= 0.3) return 3;
  if (rate <= 0.45) return 2;
  return 1;
}

/**
 * MTTR — failure에서 **다음 success까지** 걸린 시간의 중앙값.
 *
 * 아직 복구되지 않은 실패(뒤에 success가 없음)는 뺀다. "지금까지 걸린 시간"을 복구 시간으로
 * 세면, 장애가 길어질수록 값이 계속 자라 과거 스냅샷과 비교가 되지 않는다.
 * 연속된 실패는 첫 실패를 장애 시작으로 본다 — 같은 장애가 여러 번 보고된 것으로 취급한다.
 */
function mttr(window: readonly ScoredEvent[]): number | null {
  const recoveries: number[] = [];
  let failedAt: number | null = null;

  for (const event of window) {
    if (event.status === 'failure') {
      failedAt ??= event.occurred_at.getTime();
    } else if (failedAt !== null) {
      recoveries.push(event.occurred_at.getTime() - failedAt);
      failedAt = null;
    }
  }

  const median = medianOf(recoveries);
  if (median === null) return null;

  if (median <= HOUR) return 4;
  if (median <= DAY) return 3;
  if (median <= WEEK) return 2;
  return 1;
}

function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** 설계서 §6.4: 데이터가 부족한 지표는 제외하고 남은 지표만으로 평균한다. */
function average(scores: readonly (number | null)[]): number | null {
  const present = scores.filter((s): s is number => s !== null);
  if (present.length === 0) return null;

  const mean = present.reduce((sum, s) => sum + s, 0) / present.length;
  // composite_score는 numeric(3,2)이다. 저장 시 반올림되므로 여기서 맞춰 둔다.
  return Math.round(mean * 100) / 100;
}
