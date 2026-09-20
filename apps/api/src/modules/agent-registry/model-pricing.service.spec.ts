import { ModelPricingService } from './model-pricing.service';

describe('ModelPricingService', () => {
  let service: ModelPricingService;

  beforeEach(() => {
    service = new ModelPricingService();
  });

  describe('resolvePricing', () => {
    it('지정된 모델 코드(gemini-3.6-flash)의 단가를 정확히 반환한다', () => {
      const result = service.resolvePricing('gemini-3.6-flash');
      expect(result.modelCode).toBe('gemini-3.6-flash');
      expect(result.pricing.blendedPerMillion).toBe(0.9);
    });

    it('지정된 모델 코드(claude-sonnet-5)의 단가를 정확히 반환한다', () => {
      const result = service.resolvePricing('claude-sonnet-5');
      expect(result.modelCode).toBe('claude-sonnet-5');
      expect(result.pricing.blendedPerMillion).toBe(3.6);
    });

    it('에이전트 이름(claude-code)으로부터 claude-sonnet-5를 추론한다', () => {
      const result = service.resolvePricing(undefined, 'claude-code');
      expect(result.modelCode).toBe('claude-sonnet-5');
      expect(result.pricing.blendedPerMillion).toBe(3.6);
    });

    it('에이전트 이름(antigravity)으로부터 gemini-3.6-flash를 추론한다', () => {
      const result = service.resolvePricing(undefined, 'antigravity');
      expect(result.modelCode).toBe('gemini-3.6-flash');
      expect(result.pricing.blendedPerMillion).toBe(0.9);
    });

    it('에이전트 이름(cursor)으로부터 gpt-5.6-terra를 추론한다', () => {
      const result = service.resolvePricing(undefined, 'cursor');
      expect(result.modelCode).toBe('gpt-5.6-terra');
      expect(result.pricing.blendedPerMillion).toBe(4.0);
    });

    it('알 수 없는 모델과 에이전트는 기본 폴백 단가($2.0/1M)를 적용한다', () => {
      const result = service.resolvePricing('unknown-model-xyz', 'custom-agent');
      expect(result.modelCode).toBe('custom');
      expect(result.pricing.blendedPerMillion).toBe(2.0);
    });
  });

  describe('calculateCost', () => {
    it('토큰이 0이면 0.0000을 반환한다', () => {
      expect(service.calculateCost({ tokens: 0, agentName: 'claude-code' })).toBe('0.0000');
    });

    it('claude-code 1,000,000 토큰 소모 시 $3.6000을 반환한다', () => {
      // blended $3.60 / 1M
      expect(service.calculateCost({ tokens: 1_000_000, agentName: 'claude-code' })).toBe('3.6000');
    });

    it('antigravity 500,000 토큰 소모 시 $0.4500을 반환한다', () => {
      // blended $0.90 / 1M -> 0.5 * 0.9 = 0.45
      expect(service.calculateCost({ tokens: 500_000, agentName: 'antigravity' })).toBe('0.4500');
    });

    it('소수점 4자리 미만의 극소량 토큰(10개)이어도 0원 초과이면 최소 0.0001을 반환한다', () => {
      // 10 * 0.9 / 1,000,000 = 0.000009
      expect(service.calculateCost({ tokens: 10, agentName: 'antigravity' })).toBe('0.0001');
    });

    it('inputTokens와 outputTokens가 주어지면 각각의 단가로 계산한다', () => {
      // claude-sonnet-5: input $2.0, output $10.0
      // 100,000 input ($0.20) + 10,000 output ($0.10) = $0.3000
      const cost = service.calculateCost({
        model: 'claude-sonnet-5',
        inputTokens: 100_000,
        outputTokens: 10_000,
      });
      expect(cost).toBe('0.3000');
    });
  });

  /*
   * 캐시 토큰을 정규 입력가로 세던 것이 비용을 부풀리던 원인이다.
   * 실제 세션을 재어 보니 입력의 98.6%가 캐시 읽기였고 총액이 7.6배로 잡혔다.
   */
  describe('캐시 토큰 단가', () => {
    it('캐시 읽기는 정규 입력가가 아니라 캐시 읽기 단가로 센다', () => {
      // claude-sonnet-5: 입력 $2, 출력 $10, 캐시읽기 $0.2, 캐시쓰기 $2.5 (LLM_ECOSYSTEM_GUIDE 2장)
      const cost = service.calculateCost({
        model: 'claude-sonnet-5',
        inputTokens: 100_000,
        cacheWriteTokens: 100_000,
        cacheReadTokens: 800_000,
        outputTokens: 100_000,
      });
      // 0.1*2 + 0.1*2.5 + 0.8*0.2 + 0.1*10 = 0.2 + 0.25 + 0.16 + 1.0 = 1.61
      expect(cost).toBe('1.6100');
    });

    it('같은 토큰을 합계로만 주면 훨씬 비싸게 잡힌다 — 내역을 보내야 하는 이유', () => {
      const withBreakdown = Number(
        service.calculateCost({
          model: 'claude-sonnet-5',
          inputTokens: 100_000,
          cacheWriteTokens: 100_000,
          cacheReadTokens: 800_000,
          outputTokens: 100_000,
        }),
      );
      const lumped = Number(
        service.calculateCost({
          model: 'claude-sonnet-5',
          inputTokens: 1_000_000,
          outputTokens: 100_000,
        }),
      );
      expect(lumped).toBeGreaterThan(withBreakdown);
    });

    it('캐시 단가가 없는 모델(deepseek)은 정규 입력가로 센다 — 싸게 지어내지 않는다', () => {
      // deepseek-chat: 입력 $0.14. 캐시 단가는 가이드에 없다.
      const cost = service.calculateCost({
        model: 'deepseek-chat',
        inputTokens: 0,
        cacheReadTokens: 1_000_000,
        outputTokens: 0,
      });
      expect(cost).toBe('0.1400');
    });

    it('캐시 토큰만 있어도 0원으로 떨어지지 않는다', () => {
      const cost = service.calculateCost({
        model: 'claude-sonnet-5',
        cacheReadTokens: 1_000_000,
      });
      expect(Number(cost)).toBeGreaterThan(0);
    });
  });

  describe('resolveKnownModelCode', () => {
    it('단가표와 정확히 일치하면 그 코드를 반환한다', () => {
      expect(service.resolveKnownModelCode('claude-sonnet-5')).toBe('claude-sonnet-5');
    });

    it('버전 접미사가 붙어도 부분 일치로 찾는다', () => {
      expect(service.resolveKnownModelCode('claude-opus-5-20260101')).toBe('claude-opus-5');
    });

    it('단가표에 없어도 원문이 있으면 원문 그대로 돌려준다 — 에이전트 이름으로 추측하지 않는다', () => {
      expect(service.resolveKnownModelCode('some-unreleased-model')).toBe('some-unreleased-model');
    });

    it('원문 자체가 없으면 undefined("모름")를 반환한다', () => {
      expect(service.resolveKnownModelCode(undefined)).toBeUndefined();
      expect(service.resolveKnownModelCode('')).toBeUndefined();
    });
  });
});
