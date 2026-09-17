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
});
