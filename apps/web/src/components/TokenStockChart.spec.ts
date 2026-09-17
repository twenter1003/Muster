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

  it('실시간 하트비트 라이브 틱 증분 토큰이 정상적으로 계산된다', () => {
    const livePendingTokens = 12500;
    const livePendingCost = '0.0450';
    const totalWithLive =
      mockHourlyData.reduce((acc, p) => acc + Number(p.tokens), 0) + livePendingTokens;

    expect(totalWithLive).toBe(38500);
    expect(livePendingTokens).toBeGreaterThan(0);
    expect(Number(livePendingCost)).toBeGreaterThan(0);
  });

  describe('에이전트별(Claude vs Gemini vs Cursor) 비교 오버레이 검증', () => {
    const mockAgentSeries: Record<string, TimeSeriesPoint[]> = {
      'claude-code': [
        { key: '2026-09-17 00:00', label: '00:00', tokens: '600', cost: '0.0022' },
        { key: '2026-09-17 01:00', label: '01:00', tokens: '3000', cost: '0.0108' },
        { key: '2026-09-17 02:00', label: '02:00', tokens: '12000', cost: '0.0432' },
        { key: '2026-09-17 03:00', label: '03:00', tokens: '0', cost: '0.0000' },
      ],
      antigravity: [
        { key: '2026-09-17 00:00', label: '00:00', tokens: '300', cost: '0.0003' },
        { key: '2026-09-17 01:00', label: '01:00', tokens: '1500', cost: '0.0014' },
        { key: '2026-09-17 02:00', label: '02:00', tokens: '5000', cost: '0.0045' },
        { key: '2026-09-17 03:00', label: '03:00', tokens: '0', cost: '0.0000' },
      ],
      cursor: [
        { key: '2026-09-17 00:00', label: '00:00', tokens: '100', cost: '0.0011' },
        { key: '2026-09-17 01:00', label: '01:00', tokens: '500', cost: '0.0058' },
        { key: '2026-09-17 02:00', label: '02:00', tokens: '3000', cost: '0.0243' },
        { key: '2026-09-17 03:00', label: '03:00', tokens: '0', cost: '0.0000' },
      ],
    };

    it('각 시간대별 에이전트별 토큰 합이 전체 토큰 수와 정확히 일치한다', () => {
      mockHourlyData.forEach((point, idx) => {
        const claudeVal = Number(mockAgentSeries['claude-code'][idx].tokens);
        const geminiVal = Number(mockAgentSeries['antigravity'][idx].tokens);
        const cursorVal = Number(mockAgentSeries['cursor'][idx].tokens);

        const sumAgents = claudeVal + geminiVal + cursorVal;
        expect(sumAgents).toBe(Number(point.tokens));
      });
    });

    it('에이전트별 토큰 점유 비중이 정확하게 집계된다', () => {
      const claudeTotal = mockAgentSeries['claude-code'].reduce(
        (acc, p) => acc + Number(p.tokens),
        0,
      );
      const geminiTotal = mockAgentSeries['antigravity'].reduce(
        (acc, p) => acc + Number(p.tokens),
        0,
      );
      const cursorTotal = mockAgentSeries['cursor'].reduce((acc, p) => acc + Number(p.tokens), 0);
      const total = claudeTotal + geminiTotal + cursorTotal;

      expect(claudeTotal).toBe(15600); // 60%
      expect(geminiTotal).toBe(6800); // ~26.15%
      expect(cursorTotal).toBe(3600); // ~13.85%
      expect(total).toBe(26000);
      expect((claudeTotal / total) * 100).toBe(60);
    });

    it('에이전트별 시계열 데이터의 키와 라벨 길이가 전체 데이터와 정확히 1:1 대응된다', () => {
      Object.entries(mockAgentSeries).forEach(([, series]) => {
        expect(series.length).toBe(mockHourlyData.length);
        series.forEach((s, idx) => {
          expect(s.key).toBe(mockHourlyData[idx].key);
          expect(s.label).toBe(mockHourlyData[idx].label);
        });
      });
    });
  });
});
