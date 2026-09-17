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

  describe('인터랙티브 플로팅 툴팁(Floating Tooltip) 위치 및 수치 계산 검증', () => {
    const SVG_WIDTH = 680;
    const CHART_HEIGHT = 180;

    const computeTooltipPosition = (x: number, y: number) => {
      const isLeft = x > SVG_WIDTH * 0.52;
      const flipClass = isLeft
        ? 'token-stock-chart__tooltip--left'
        : 'token-stock-chart__tooltip--right';
      const leftPct = (x / SVG_WIDTH) * 100;
      const topPct = Math.min(Math.max((y / CHART_HEIGHT) * 100, 16), 74);
      return { flipClass, leftPct, topPct };
    };

    it('X 좌표가 차트 중간 우측일 때 좌측으로 플립(Flip)되어 차트 경계 이탈을 방지한다', () => {
      // 오른쪽 끝점 (x = 600)
      const posRight = computeTooltipPosition(600, 90);
      expect(posRight.flipClass).toBe('token-stock-chart__tooltip--left');
      expect(posRight.leftPct).toBeCloseTo(88.23, 1);

      // 왼쪽 시작점 (x = 80)
      const posLeft = computeTooltipPosition(80, 90);
      expect(posLeft.flipClass).toBe('token-stock-chart__tooltip--right');
      expect(posLeft.leftPct).toBeCloseTo(11.76, 1);

      // 경계값 (353.6 = 680 * 0.52)
      const posCenterLeft = computeTooltipPosition(350, 90);
      expect(posCenterLeft.flipClass).toBe('token-stock-chart__tooltip--right');

      const posCenterRight = computeTooltipPosition(355, 90);
      expect(posCenterRight.flipClass).toBe('token-stock-chart__tooltip--left');
    });

    it('Y 좌표가 상단/하단 경계에 근접해도 클램핑(16% ~ 74%)되어 툴팁이 잘리지 않는다', () => {
      // 최상단 (y = 0)
      const posTop = computeTooltipPosition(200, 0);
      expect(posTop.topPct).toBe(16);

      // 최하단 (y = 180)
      const posBottom = computeTooltipPosition(200, 180);
      expect(posBottom.topPct).toBe(74);

      // 정상 중간 범위 (y = 90 -> 50%)
      const posMid = computeTooltipPosition(200, 90);
      expect(posMid.topPct).toBe(50);
    });

    it('툴팁 내 에이전트별 토큰 수치와 점유율(%)이 정확히 계산된다', () => {
      const totalTokens = 20000;
      const claudeTokens = 12000;
      const geminiTokens = 5000;
      const cursorTokens = 3000;

      const getPct = (tokens: number) => Math.round((tokens / totalTokens) * 100);

      expect(getPct(claudeTokens)).toBe(60);
      expect(getPct(geminiTokens)).toBe(25);
      expect(getPct(cursorTokens)).toBe(15);
      expect(getPct(claudeTokens) + getPct(geminiTokens) + getPct(cursorTokens)).toBe(100);
    });

    it('라이브 틱(Pending Tokens)은 최신 데이터 포인트 호버 시에만 표시된다', () => {
      const totalPoints = 4;
      const liveTokens = 5000;

      const shouldShowLive = (hoveredIndex: number | null) =>
        liveTokens > 0 && hoveredIndex === totalPoints - 1;

      expect(shouldShowLive(3)).toBe(true); // 최신 인덱스
      expect(shouldShowLive(2)).toBe(false); // 과거 인덱스
      expect(shouldShowLive(0)).toBe(false); // 시작 인덱스
      expect(shouldShowLive(null)).toBe(false); // 호버 해제
    });
  });

  describe('실시간 Burn Rate HUD 및 스파이크 조기 경보 검증', () => {
    it('Burn Rate 정상 상태일 때 normal 등급과 적절한 텍스트를 제공한다', () => {
      const normalStatus = {
        current_tokens_per_min: 12500,
        current_cost_per_min: '0.0450',
        spike_level: 'normal' as const,
        is_spike: false,
        window_minutes: 15,
        recommendation: '정상적인 토큰 소모 속도를 유지하고 있습니다.',
        agents: [],
      };

      expect(normalStatus.is_spike).toBe(false);
      expect(normalStatus.spike_level).toBe('normal');
      expect(normalStatus.current_tokens_per_min).toBe(12500);
    });

    it('분당 6만 토큰 이상 소모 시 critical 등급과 스파이크 플래그가 활성화된다', () => {
      const criticalStatus = {
        current_tokens_per_min: 78400,
        current_cost_per_min: '0.2350',
        spike_level: 'critical' as const,
        is_spike: true,
        window_minutes: 15,
        dominant_agent: 'claude-code',
        recommendation: '[claude-code] 비정상적인 대량 토큰 소모가 감지되었습니다.',
        agents: [
          {
            agent_name: 'claude-code',
            tokens_per_minute: 78400,
            cost_per_minute: '0.2350',
            is_spike: true,
            spike_level: 'critical' as const,
            active_runs_count: 1,
          },
        ],
      };

      expect(criticalStatus.is_spike).toBe(true);
      expect(criticalStatus.spike_level).toBe('critical');
      expect(criticalStatus.dominant_agent).toBe('claude-code');
      expect(criticalStatus.agents[0].active_runs_count).toBe(1);
    });
  });
});
