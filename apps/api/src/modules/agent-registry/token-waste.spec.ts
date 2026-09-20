import {
  computeCacheEfficiency,
  computeCostDistribution,
  computeSessionCacheView,
  computeTokenWasteIntelligence,
  type PricingLookup,
} from './token-waste';

const sonnetPricing: PricingLookup = () => ({
  inputPerMillion: 2.0,
  cacheReadPerMillion: 0.2,
});

const noCacheRatePricing: PricingLookup = () => ({ inputPerMillion: 2.0 });

describe('token-waste', () => {
  describe('computeCacheEfficiency', () => {
    it('빈 목록이면 적중률 null, 절감액 0을 반환한다', () => {
      const eff = computeCacheEfficiency([], sonnetPricing);
      expect(eff.hit_rate_percentage).toBeNull();
      expect(eff.savings_usd).toBe('0.0000');
      expect(eff.sessions_with_breakdown).toBe(0);
      expect(eff.sessions_without_breakdown).toBe(0);
    });

    it('내역 없는(예전) 실행은 0이 아니라 집계에서 제외한다', () => {
      const eff = computeCacheEfficiency([{ id: 'r1' }, { id: 'r2' }], sonnetPricing);
      expect(eff.hit_rate_percentage).toBeNull();
      expect(eff.sessions_without_breakdown).toBe(2);
      expect(eff.sessions_with_breakdown).toBe(0);
    });

    it('입력의 98.6%가 캐시 읽기인 실측 비율로 적중률을 계산한다', () => {
      const eff = computeCacheEfficiency(
        [
          {
            id: 'r1',
            input_tokens: 14_000,
            cache_read_tokens: 986_000,
            cache_write_tokens: 0,
          },
        ],
        sonnetPricing,
      );
      expect(eff.hit_rate_percentage).toBe(99); // round(986000/1000000*100)
      expect(eff.sessions_with_breakdown).toBe(1);
    });

    it('절감액을 캐시 읽기 토큰 × (정규 입력가 − 캐시 읽기가)로 실측한다', () => {
      const eff = computeCacheEfficiency(
        [{ id: 'r1', input_tokens: 0, cache_read_tokens: 1_000_000, cache_write_tokens: 0 }],
        sonnetPricing,
      );
      // 1M 토큰 × (2.0 - 0.2) / 1M = $1.80
      expect(eff.savings_usd).toBe('1.8000');
    });

    it('모델 단가표에 캐시 읽기가가 없으면 정규 입력가로 셈해 절감액 0을 낸다', () => {
      const eff = computeCacheEfficiency(
        [{ id: 'r1', cache_read_tokens: 1_000_000 }],
        noCacheRatePricing,
      );
      expect(eff.savings_usd).toBe('0.0000');
    });
  });

  describe('computeSessionCacheView', () => {
    it('단건 실행의 적중률·절감액을 계산한다', () => {
      const view = computeSessionCacheView(
        { id: 'r1', input_tokens: 100, cache_read_tokens: 900, cache_write_tokens: 0 },
        sonnetPricing,
      );
      expect(view.has_breakdown).toBe(true);
      expect(view.hit_rate_percentage).toBe(90);
    });

    it('내역이 없으면 has_breakdown이 false다', () => {
      const view = computeSessionCacheView({ id: 'r1' }, sonnetPricing);
      expect(view.has_breakdown).toBe(false);
      expect(view.hit_rate_percentage).toBeNull();
    });
  });

  describe('computeCostDistribution', () => {
    it('빈 목록이면 표본 0을 반환한다', () => {
      const dist = computeCostDistribution([]);
      expect(dist.sample_size).toBe(0);
      expect(dist.outliers).toEqual([]);
    });

    it('중앙값과 p99를 계산한다', () => {
      const runs = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, cost: String(i + 1) }));
      const dist = computeCostDistribution(runs);
      expect(dist.sample_size).toBe(10);
      expect(Number(dist.median_cost_usd)).toBeGreaterThan(0);
      expect(Number(dist.p99_cost_usd)).toBeGreaterThanOrEqual(Number(dist.median_cost_usd));
    });

    it('중앙값의 2배 이상이면서 상위 1%에 드는 세션만 이상치로 짚는다', () => {
      const runs = [
        ...Array.from({ length: 20 }, (_, i) => ({ id: `normal-${i}`, cost: '1.0000' })),
        { id: 'spike', cost: '50.0000' },
      ];
      const dist = computeCostDistribution(runs);
      expect(dist.outliers.length).toBeGreaterThan(0);
      expect(dist.outliers[0].session_id).toBe('spike');
      expect(dist.outliers[0].multiple_of_median).toBeGreaterThan(2);
    });

    it('비용이 0 이하인 실행은 분포 계산에서 제외한다', () => {
      const dist = computeCostDistribution([
        { id: 'r1', cost: '0.0000' },
        { id: 'r2', cost: '1.0000' },
      ]);
      expect(dist.sample_size).toBe(1);
    });
  });

  describe('computeTokenWasteIntelligence', () => {
    it('빈 목록이면 캐시 효율은 null/0, 정적 가이드·벤치마크는 채워져 있다', () => {
      const intel = computeTokenWasteIntelligence([], sonnetPricing);
      expect(intel.cache_efficiency.hit_rate_percentage).toBeNull();
      expect(intel.cost_distribution.sample_size).toBe(0);
      expect(intel.optimization_guides.length).toBeGreaterThanOrEqual(3);
      expect(intel.model_cache_benchmarks.length).toBe(5);
    });

    it('실측 캐시 내역이 있는 실행을 넣으면 적중률·절감액이 함께 계산된다', () => {
      const intel = computeTokenWasteIntelligence(
        [
          {
            id: 'r1',
            cost: '18.0000',
            input_tokens: 14_000,
            cache_read_tokens: 986_000,
            cache_write_tokens: 0,
            model: 'claude-sonnet-5',
          },
        ],
        sonnetPricing,
      );
      expect(intel.cache_efficiency.hit_rate_percentage).toBe(99);
      expect(Number(intel.cache_efficiency.savings_usd)).toBeGreaterThan(0);
      expect(intel.cost_distribution.sample_size).toBe(1);
    });

    it('최신 2026 프론티어 모델 벤치마크 정보를 정확히 제공한다', () => {
      const intel = computeTokenWasteIntelligence([], sonnetPricing);
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
