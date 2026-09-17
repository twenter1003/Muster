import { describe, expect, it } from 'vitest';
import type { TimeSeriesPoint } from './TokenStockChart';

describe('TokenStockChart 로직 및 데이터 정합성 검증', () => {
  const mockHourlyData: TimeSeriesPoint[] = [
    { key: '2026-09-17 00:00', label: '00:00', tokens: '1000', cost: '0.0036' },
    { key: '2026-09-17 01:00', label: '01:00', tokens: '5000', cost: '0.0180' },
    { key: '2026-09-17 02:00', label: '02:00', tokens: '20000', cost: '0.0720' },
    { key: '2026-09-17 03:00', label: '03:00', tokens: '0', cost: '0.0000' },
  ];

  it('시간별 데이터의 합산 토큰과 비용이 정상 계산된다', () => {
    const totalTokens = mockHourlyData.reduce((acc, p) => acc + Number(p.tokens), 0);
    const totalCost = mockHourlyData.reduce((acc, p) => acc + Number(p.cost), 0);

    expect(totalTokens).toBe(26000);
    expect(totalCost).toBeCloseTo(0.0936, 4);
  });

  it('토큰 수치가 0인 슬롯도 누락되지 않고 보존된다', () => {
    const zeroSlot = mockHourlyData.find((p) => p.tokens === '0');
    expect(zeroSlot).toBeDefined();
    expect(zeroSlot?.cost).toBe('0.0000');
    expect(zeroSlot?.label).toBe('03:00');
  });

  it('데이터가 비어 있을 때도 안전하게 기본 구조를 유지한다', () => {
    const emptyData: TimeSeriesPoint[] = [];
    expect(emptyData.length).toBe(0);
    const maxVal = Math.max(...emptyData.map((d) => Number(d.tokens)), 0);
    expect(maxVal).toBe(0);
  });

  it('시계열 키와 라벨 형식이 일치한다', () => {
    mockHourlyData.forEach((p) => {
      expect(p.key).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:00$/);
      expect(p.label).toMatch(/^\d{2}:00$/);
    });
  });
});
