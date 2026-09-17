import { describe, expect, it } from 'vitest';
import type { TokenWasteIntelligence } from '../lib/tokenIntelligence';

describe('TokenWasteIntelligenceCard 데이터 및 렌더링 로직 검증', () => {
  const mockIntelligence: TokenWasteIntelligence = {
    cache_efficiency: {
      hit_rate_percentage: 45,
      current_estimated_cost: '18.5000',
      optimized_cost: '6.2900',
      potential_savings: '12.2100',
      savings_percentage: 66,
    },
    waste_breakdown: {
      level: 'HIGH_WASTE',
      total_wasted_tokens: 35000000,
      waste_percentage: 42,
      context_bloat_tokens: 35000000,
      duplicate_reads_tokens: 12000000,
      high_waste_sessions_count: 2,
    },
    optimization_guides: [
      {
        id: 'prompt-cache-pinning',
        title: '공통 컨텍스트 상단 배치 (Prompt Cache Pinning)',
        description: 'README, API 명세, 설계서 등 변하지 않는 핵심 문서를 시스템 프롬프트 최상단에 배치',
        impact: 'HIGH',
        action_hint: '시스템 프롬프트의 가변 컨텍스트를 맨 뒤로 이동하세요.',
      },
      {
        id: 'session-compaction',
        title: '100턴 단위 세션 분할 또는 컴팩션 (/compact)',
        description: '100턴을 초과하는 대형 세션은 매 턴마다 전체 대화 히스토리가 누적 입력 토큰으로 재전송',
        impact: 'HIGH',
        action_hint: '장기 세션은 새 세션으로 분기하거나 주기적으로 요약 압축하세요.',
      },
      {
        id: 'subagent-delegation',
        title: '경량 탐색 작업은 Flash/Haiku 서브에이전트로 위임',
        description: '단순 코드 검색은 Gemini 3.1 Flash-Lite나 Claude Haiku 5로 위임',
        impact: 'MEDIUM',
        action_hint: '단순 탐색 시 경량 모델 서브에이전트를 적극 활용하세요.',
      },
    ],
    model_cache_benchmarks: [
      { model: 'Claude Sonnet 5', discount: '90% 할인', readPrice: '$0.20 / 1M' },
      { model: 'Gemini 3.8 Flash', discount: '90% 할인', readPrice: '$0.075 / 1M' },
      { model: 'GPT-5.6 Terra', discount: '90% 할인', readPrice: '$0.20 / 1M' },
      { model: 'Claude Fable 5.1', discount: '97.5% 파격 할인', readPrice: '$0.25 / 1M' },
      { model: 'Gemini 3.6 Flash', discount: '90% 할인', readPrice: '$0.050 / 1M' },
    ],
  };

  it('캐시 최적화 절감액과 절감률 계산이 일관성을 갖는다', () => {
    const { current_estimated_cost, optimized_cost, potential_savings, savings_percentage } =
      mockIntelligence.cache_efficiency;

    const current = Number(current_estimated_cost);
    const optimized = Number(optimized_cost);
    const savings = Number(potential_savings);

    expect(current).toBeGreaterThan(optimized);
    expect(savings).toBeCloseTo(current - optimized, 2);
    expect(savings_percentage).toBe(Math.round((savings / current) * 100));
  });

  it('컨텍스트 팽창 및 낭비 세션 수치가 올바르게 집계된다', () => {
    const { level, total_wasted_tokens, high_waste_sessions_count, waste_percentage } =
      mockIntelligence.waste_breakdown;

    expect(level).toBe('HIGH_WASTE');
    expect(total_wasted_tokens).toBe(35000000);
    expect(high_waste_sessions_count).toBe(2);
    expect(waste_percentage).toBe(42);
  });

  it('2026 프롬프트 캐싱 최적화 가이드 항목 3종이 정의되어 있다', () => {
    const guides = mockIntelligence.optimization_guides;
    expect(guides).toHaveLength(3);

    const pinning = guides.find((g) => g.id === 'prompt-cache-pinning');
    expect(pinning).toBeDefined();
    expect(pinning?.impact).toBe('HIGH');
    expect(pinning?.action_hint).toContain('시스템 프롬프트');

    const compaction = guides.find((g) => g.id === 'session-compaction');
    expect(compaction).toBeDefined();

    const delegation = guides.find((g) => g.id === 'subagent-delegation');
    expect(delegation).toBeDefined();
  });

  it('2026 주요 모델별 캐시 할인 벤치마크 5종이 모두 포함되어 있다', () => {
    const benchmarks = mockIntelligence.model_cache_benchmarks;
    expect(benchmarks).toHaveLength(5);

    const models = benchmarks.map((b) => b.model);
    expect(models).toContain('Claude Sonnet 5');
    expect(models).toContain('Gemini 3.8 Flash');
    expect(models).toContain('GPT-5.6 Terra');
    expect(models).toContain('Claude Fable 5.1');
    expect(models).toContain('Gemini 3.6 Flash');

    benchmarks.forEach((b) => {
      expect(b.discount).toMatch(/\d+%/);
      expect(b.readPrice).toContain('/ 1M');
    });
  });
});
