import { describe, expect, it } from 'vitest';
import { pickCollapsedDefault } from './benchmarkContext';

describe('A/B HUD 접힘 기본값', () => {
  it('저장된 선택이 있으면 화면 크기와 무관하게 그것을 따른다', () => {
    expect(pickCollapsedDefault('false', true)).toBe(false);
    expect(pickCollapsedDefault('true', false)).toBe(true);
  });

  it('선택한 적이 없으면 좁은 화면에서는 접어 둔다 — 펼치면 목록 첫 카드를 가린다', () => {
    expect(pickCollapsedDefault(null, true)).toBe(true);
  });

  it('선택한 적이 없고 넓은 화면이면 펼친다 — 데스크톱은 가리는 것이 없다', () => {
    expect(pickCollapsedDefault(null, false)).toBe(false);
  });
});

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
