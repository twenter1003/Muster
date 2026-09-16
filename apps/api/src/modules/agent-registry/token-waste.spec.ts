import { assessSessionWaste, computeWasteInsight } from './token-waste';

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
});
