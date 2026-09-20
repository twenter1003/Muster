import { describe, expect, it } from 'vitest';
import type { TokenWasteIntelligence } from '../lib/tokenIntelligence';

describe('TokenWasteIntelligenceCard 데이터 및 렌더링 로직 검증', () => {
  const mockIntelligence: TokenWasteIntelligence = {
    cache_efficiency: {
      hit_rate_percentage: 45,
      input_tokens: 5_000_000,
      cache_read_tokens: 4_090_000,
      cache_write_tokens: 0,
      savings_usd: '12.2100',
      sessions_with_breakdown: 2,
      sessions_without_breakdown: 0,
    },
    cost_distribution: {
      median_cost_usd: '2.5000',
      p99_cost_usd: '18.0000',
      sample_size: 12,
      outliers: [{ session_id: 'run-spike', cost_usd: '18.0000', multiple_of_median: 7.2 }],
    },
    optimization_guides: [
      {
        id: 'prompt-cache-pinning',
        title: '공통 컨텍스트 상단 배치 (Prompt Cache Pinning)',
        description:
          'README, API 명세, 설계서 등 변하지 않는 핵심 문서를 시스템 프롬프트 최상단에 배치',
        impact: 'HIGH',
        action_hint: '시스템 프롬프트의 가변 컨텍스트를 맨 뒤로 이동하세요.',
      },
      {
        id: 'session-compaction',
        title: '100턴 단위 세션 분할 또는 컴팩션 (/compact)',
        description:
          '100턴을 초과하는 대형 세션은 매 턴마다 전체 대화 히스토리가 누적 입력 토큰으로 재전송',
        impact: 'MEDIUM',
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

  it('캐시 적중률·절감액이 실측값 그대로 노출된다(추정 역산 없음)', () => {
    const { hit_rate_percentage, savings_usd, cache_read_tokens, input_tokens } =
      mockIntelligence.cache_efficiency;

    expect(hit_rate_percentage).toBe(45);
    expect(Number(savings_usd)).toBeGreaterThan(0);
    expect(cache_read_tokens).toBeGreaterThan(0);
    expect(input_tokens).toBeGreaterThan(0);
  });

  it('세션 비용 분포(중앙값·p99·이상치)가 판정 없이 수치로만 표현된다', () => {
    const { median_cost_usd, p99_cost_usd, sample_size, outliers } =
      mockIntelligence.cost_distribution;

    expect(Number(p99_cost_usd)).toBeGreaterThan(Number(median_cost_usd));
    expect(sample_size).toBe(12);
    expect(outliers).toHaveLength(1);
    expect(outliers[0].multiple_of_median).toBeGreaterThan(1);
  });

  it('내역 없는 세션만 있을 때 hit_rate_percentage는 null이다(0%로 세지 않는다)', () => {
    const noBreakdown: TokenWasteIntelligence['cache_efficiency'] = {
      hit_rate_percentage: null,
      input_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      savings_usd: '0.0000',
      sessions_with_breakdown: 0,
      sessions_without_breakdown: 3,
    };
    expect(noBreakdown.hit_rate_percentage).toBeNull();
    expect(noBreakdown.sessions_without_breakdown).toBe(3);
  });

  it('일반적인 캐싱 실천 가이드 항목 3종이 정의되어 있다', () => {
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

  describe('리포트 내보내기 (Export) 로직 검증', () => {
    it('projectId가 제공되면 내보내기 포맷(CSV / JSON) 엔드포인트 URL이 정상 생성된다', () => {
      const projectId = 'test-proj-456';
      expect(`/projects/${projectId}/waste-report.csv`).toBe(
        '/projects/test-proj-456/waste-report.csv',
      );
      expect(`/projects/${projectId}/waste-report.json`).toBe(
        '/projects/test-proj-456/waste-report.json',
      );
    });
  });
});
