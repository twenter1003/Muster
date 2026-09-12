/**
 * numeric(12,4) 문자열끼리의 덧셈.
 *
 * 왜 필요한가: AGENT_RUNS.cost는 numeric(12,4)이고 TypeORM은 이걸 문자열로 돌려준다.
 * 프로젝트별 합계는 SQL의 SUM()이 정확하게 내주지만, "상위 N개를 제외한 나머지"처럼
 * 이미 받아 온 합계들을 다시 더해야 하는 계산이 남는다. 거기서 Number로 바꾸는 순간
 * 0.1 + 0.2 = 0.30000000000000004이 되어, 화면의 합계가 항목 합과 어긋난다.
 *
 * 스케일 4로 고정한 정수(BigInt)로 바꿔 더하고 다시 문자열로 되돌린다 — 컬럼 정의가
 * 소수 4자리이므로 그 이상은 애초에 저장될 수 없고, 정수 덧셈에는 오차가 없다.
 */

const SCALE = 4;

/** "12.34" → 123400n. 소수 4자리를 넘는 입력은 버림(컬럼이 이미 그렇게 저장한다). */
function toScaled(value: string): bigint {
  const trimmed = value.trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (!match || (!match[2] && !match[3])) {
    throw new Error(`numeric 문자열이 아닙니다: ${value}`);
  }

  const [, sign, whole, frac = ''] = match;
  const padded = frac.padEnd(SCALE, '0').slice(0, SCALE);
  const magnitude = BigInt(`${whole || '0'}${padded}`);
  return sign === '-' ? -magnitude : magnitude;
}

/** 123400n → "12.3400". 자리수를 컬럼과 똑같이 유지해 표시 쪽에서 흔들리지 않게 한다. */
function toDecimalString(scaled: bigint): string {
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(SCALE + 1, '0');
  const whole = digits.slice(0, -SCALE);
  const frac = digits.slice(-SCALE);
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** 빈 배열이면 "0.0000". null/undefined(집계 대상 0건인 SUM의 결과)는 0으로 본다. */
export function sumDecimals(values: readonly (string | null | undefined)[]): string {
  const total = values.reduce<bigint>((acc, v) => acc + (v == null ? 0n : toScaled(v)), 0n);
  return toDecimalString(total);
}

/** 정렬·비교용. 표시에는 쓰지 않는다(문자열 그대로 내보낸다). */
export function compareDecimals(a: string, b: string): number {
  const left = toScaled(a);
  const right = toScaled(b);
  return left === right ? 0 : left < right ? -1 : 1;
}
