import {
  assessSessionWaste,
  computeWasteInsight,
  computeTokenWasteIntelligence,
} from './token-waste';

describe('token-waste', () => {
  describe('assessSessionWaste', () => {
    it('5천만 토큰 이상이거나 300턴 이상이면 HIGH_WASTE를 반환한다', () => {
      const res = assessSessionWaste(720_000_000, 1766);
      expect(res.level).toBe('HIGH_WASTE');
      expect(res.estimated_wasted_tokens).toBe(Math.round(720_000_000 * 0.6));
      expect(res.reason).toContain('장기 세션');
    });

    it('1천만 토큰 이상이거나 100턴 이상이면 CAUTION을 반환한다', () => {
      const res = assessSessionWaste(15_000_000, 120);
      expect(res.level).toBe('CAUTION');
      expect(res.estimated_wasted_tokens).toBe(Math.round(15_000_000 * 0.25));
    });

    it('소규모 세션은 NORMAL 및 낭비 토큰 0을 반환한다', () => {
      const res = assessSessionWaste(2_000_000, 40);
      expect(res.level).toBe('NORMAL');
      expect(res.estimated_wasted_tokens).toBe(0);
    });
  });

  describe('computeWasteInsight', () => {
    it('빈 목록이면 0 및 정상 안내를 반환한다', () => {
      const insight = computeWasteInsight([]);
      expect(insight.total_wasted_tokens).toBe(0);
      expect(insight.waste_percentage).toBe(0);
      expect(insight.high_waste_sessions_count).toBe(0);
    });

    it('초장기 세션이 포함되어 있으면 적절한 낭비 비율과 권고 문구를 계산한다', () => {
      const insight = computeWasteInsight([
        { tokens_used: 100_000_000, turns: 400 }, // 60M waste
        { tokens_used: 5_000_000, turns: 30 }, // 0 waste
      ]);
      expect(insight.high_waste_sessions_count).toBe(1);
      expect(insight.total_wasted_tokens).toBe(60_000_000);
      expect(insight.waste_percentage).toBe(Math.round((60_000_000 / 105_000_000) * 100));
      expect(insight.recommendation).toContain('초장기 세션(1건)');
    });
  });

  describe('computeTokenWasteIntelligence', () => {
    it('빈 목록이면 0 비용과 기본 벤치마크/가이드를 반환한다', () => {
      const intel = computeTokenWasteIntelligence([]);
      expect(intel.cache_efficiency.current_estimated_cost).toBe('0.0000');
      expect(intel.cache_efficiency.potential_savings).toBe('0.0000');
      expect(intel.cache_efficiency.savings_percentage).toBe(0);
      expect(intel.waste_breakdown.level).toBe('NORMAL');
      expect(intel.optimization_guides.length).toBeGreaterThanOrEqual(3);
      expect(intel.model_cache_benchmarks.length).toBe(5);
    });

    it('장기 팽창 세션이 존재할 때 캐시 절감 시뮬레이션 및 HIGH_WASTE를 진단한다', () => {
      const intel = computeTokenWasteIntelligence([
        { tokens_used: 100_000_000, cost: '25.0000', turns: 450, agent_name: 'claude-code' },
        { tokens_used: 10_000_000, cost: '2.5000', turns: 50, agent_name: 'antigravity' },
      ]);

      expect(intel.waste_breakdown.level).toBe('HIGH_WASTE');
      expect(intel.waste_breakdown.high_waste_sessions_count).toBe(1);
      expect(intel.cache_efficiency.hit_rate_percentage).toBeLessThanOrEqual(50);
      expect(parseFloat(intel.cache_efficiency.potential_savings)).toBeGreaterThan(0);
      expect(parseFloat(intel.cache_efficiency.optimized_cost)).toBeLessThan(
        parseFloat(intel.cache_efficiency.current_estimated_cost),
      );
      expect(intel.cache_efficiency.savings_percentage).toBeGreaterThan(30);

      // 가이드 검증
      const pinningGuide = intel.optimization_guides.find((g) => g.id === 'prompt-cache-pinning');
      expect(pinningGuide).toBeDefined();
      expect(pinningGuide?.impact).toBe('HIGH');
    });

    it('최신 2026 프론티어 모델 벤치마크 정보를 정확히 제공한다', () => {
      const intel = computeTokenWasteIntelligence([]);
      const sonnet = intel.model_cache_benchmarks.find((b) => b.model === 'Claude Sonnet 5');
      const gemini = intel.model_cache_benchmarks.find((b) => b.model === 'Gemini 3.8 Flash');

      expect(sonnet).toBeDefined();
      expect(sonnet?.discount).toContain('90%');
      expect(sonnet?.readPrice).toBe('$0.20 / 1M');

      expect(gemini).toBeDefined();
      expect(gemini?.discount).toContain('90%');
      expect(gemini?.readPrice).toBe('$0.075 / 1M');
    });
  });
});
