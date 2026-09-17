import { describe, expect, it } from 'vitest';

describe('benchmark metrics calculations', () => {
  it('speedup factor 계산', () => {
    const timeA = 462;
    const timeB = 88;
    const factor = (timeA / timeB).toFixed(1);
    expect(factor).toBe('5.3');
  });

  it('1ms 이하의 최소 지속시간 보호', () => {
    const timeA = 100;
    const timeB = 0;
    const safeB = Math.max(1, timeB);
    expect(timeA / safeB).toBe(100);
  });
});
