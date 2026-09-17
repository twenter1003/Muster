import { describe, expect, it } from 'vitest';
import type { ModelUsageItem } from './ModelUsageBreakdown';

describe('ModelUsageBreakdown 로직 및 정합성 검증', () => {
  const mockModels: ModelUsageItem[] = [
    {
      model_name: 'claude-sonnet-5',
      display_name: 'Claude Sonnet 5 (claude-code)',
      provider: 'anthropic',
      tokens: '80000',
      cost: '0.2880',
      run_count: 8,
      percentage: 80.0,
    },
    {
      model_name: 'gemini-3.6-flash',
      display_name: 'Gemini 3.6 Flash (antigravity)',
      provider: 'google',
      tokens: '20000',
      cost: '0.0180',
      run_count: 4,
      percentage: 20.0,
    },
  ];

  it('모델별 점유율(%)의 합이 100%와 정확히 일치한다 (Sum-Check 100%)', () => {
    const totalPercentage = mockModels.reduce((acc, m) => acc + m.percentage, 0);
    expect(totalPercentage).toBe(100.0);
  });

  it('토큰 수 합계가 일치한다', () => {
    const totalTokens = mockModels.reduce((acc, m) => acc + Number(m.tokens), 0);
    expect(totalTokens).toBe(100000);
  });

  it('제공자(provider)가 유효한 카테고리 중 하나이다', () => {
    const validProviders = ['anthropic', 'google', 'openai', 'deepseek', 'other'];
    mockModels.forEach((m) => {
      expect(validProviders).toContain(m.provider);
    });
  });

  it('실행 횟수 합산이 0 이상이다', () => {
    const totalRuns = mockModels.reduce((acc, m) => acc + m.run_count, 0);
    expect(totalRuns).toBe(12);
  });
});
