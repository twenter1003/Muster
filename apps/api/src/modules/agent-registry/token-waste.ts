/** 모델별 단가 조회 함수 — ModelPricingService를 순수 함수 계층에 주입하기 위한 어댑터 타입. */
export type PricingLookup = (
  model?: string,
  agentName?: string,
) => { inputPerMillion: number; cacheReadPerMillion?: number };

export interface CacheRunInput {
  id: string;
  cost?: string | number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
  cache_write_tokens?: number | null;
  model?: string | null;
  agent_name?: string;
}

export interface CacheEfficiencyMetric {
  /** 캐시 내역이 있는 실행이 하나도 없으면 null — "0%"는 거짓이므로 구분한다. */
  hit_rate_percentage: number | null;
  input_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  /** 실측 반사실: cache_read_tokens × (정규 입력가 − 캐시 읽기가), 모델별 단가로 계산한 합. */
  savings_usd: string;
  sessions_with_breakdown: number;
  sessions_without_breakdown: number;
}

/**
 * 캐시 적중률·절감액을 실측 토큰 내역으로 계산한다.
 * 내역이 없는(예전) 실행은 "0"이 아니라 집계에서 제외한다 — 0으로 세면
 * "캐시를 안 썼다"는 거짓 결론이 된다(DESIGN_DRIFT 18번).
 */
export function computeCacheEfficiency(
  runs: CacheRunInput[],
  resolvePricing: PricingLookup,
): CacheEfficiencyMetric {
  let totalInput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let savings = 0;
  let withBreakdown = 0;
  let withoutBreakdown = 0;

  for (const run of runs) {
    const hasBreakdown =
      run.input_tokens != null || run.cache_read_tokens != null || run.cache_write_tokens != null;
    if (!hasBreakdown) {
      withoutBreakdown++;
      continue;
    }
    withBreakdown++;

    const input = run.input_tokens ?? 0;
    const cacheRead = run.cache_read_tokens ?? 0;
    const cacheWrite = run.cache_write_tokens ?? 0;
    totalInput += input;
    totalCacheRead += cacheRead;
    totalCacheWrite += cacheWrite;

    if (cacheRead > 0) {
      const pricing = resolvePricing(run.model ?? undefined, run.agent_name);
      const readRate = pricing.cacheReadPerMillion ?? pricing.inputPerMillion;
      savings += (cacheRead * (pricing.inputPerMillion - readRate)) / 1_000_000;
    }
  }

  const denom = totalInput + totalCacheRead + totalCacheWrite;

  return {
    hit_rate_percentage: denom > 0 ? Math.round((totalCacheRead / denom) * 100) : null,
    input_tokens: totalInput,
    cache_read_tokens: totalCacheRead,
    cache_write_tokens: totalCacheWrite,
    savings_usd: Math.max(0, savings).toFixed(4),
    sessions_with_breakdown: withBreakdown,
    sessions_without_breakdown: withoutBreakdown,
  };
}

export interface SessionCacheView {
  hit_rate_percentage: number | null;
  input_tokens: number;
  cache_read_tokens: number;
  savings_usd: string;
  has_breakdown: boolean;
}

/** 세션 하나의 캐시 적중률·절감액을 계산한다(프로젝트 집계 함수의 단건 버전). */
export function computeSessionCacheView(
  run: CacheRunInput,
  resolvePricing: PricingLookup,
): SessionCacheView {
  const eff = computeCacheEfficiency([run], resolvePricing);
  return {
    hit_rate_percentage: eff.hit_rate_percentage,
    input_tokens: eff.input_tokens,
    cache_read_tokens: eff.cache_read_tokens,
    savings_usd: eff.savings_usd,
    has_breakdown: eff.sessions_with_breakdown > 0,
  };
}

export interface CostOutlier {
  session_id: string;
  cost_usd: string;
  multiple_of_median: number;
}

export interface CostDistribution {
  median_cost_usd: string;
  p99_cost_usd: string;
  sample_size: number;
  /** 중앙값의 2배 이상이면서 p99를 넘는 세션 — 판정이 아니라 "볼 곳"을 가리키는 목록. */
  outliers: CostOutlier[];
}

/**
 * 세션당 비용의 중앙값·p99 분포를 낸다. 임계값으로 "낭비"를 선언하는 대신,
 * 어떤 세션이 분포에서 벗어났는지만 짚는다(Braintrust 방식).
 */
export function computeCostDistribution(
  runs: Array<{ id: string; cost?: string | number | null }>,
): CostDistribution {
  const costed = runs
    .map((r) => ({
      id: r.id,
      cost: typeof r.cost === 'string' ? parseFloat(r.cost) : Number(r.cost ?? 0),
    }))
    .filter((r) => Number.isFinite(r.cost) && r.cost > 0)
    .sort((a, b) => a.cost - b.cost);

  if (costed.length === 0) {
    return { median_cost_usd: '0.0000', p99_cost_usd: '0.0000', sample_size: 0, outliers: [] };
  }

  const percentile = (p: number): number => {
    const idx = Math.min(costed.length - 1, Math.max(0, Math.ceil((p / 100) * costed.length) - 1));
    return costed[idx].cost;
  };

  const median = percentile(50);
  const p99 = percentile(99);

  const outliers: CostOutlier[] = costed
    .filter((r) => r.cost >= p99 && median > 0 && r.cost >= median * 2)
    .map((r) => ({
      session_id: r.id,
      cost_usd: r.cost.toFixed(4),
      multiple_of_median: Math.round((r.cost / median) * 10) / 10,
    }))
    .reverse();

  return {
    median_cost_usd: median.toFixed(4),
    p99_cost_usd: p99.toFixed(4),
    sample_size: costed.length,
    outliers,
  };
}

export interface OptimizationGuide {
  id: string;
  title: string;
  description: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  action_hint?: string;
}

export interface ModelCacheBenchmark {
  model: string;
  discount: string;
  readPrice: string;
}

/** 일반적인 캐싱 실천 가이드 — 특정 프로젝트의 판정이 아니라 정적인 참고 정보다. */
export const OPTIMIZATION_GUIDES: OptimizationGuide[] = [
  {
    id: 'prompt-cache-pinning',
    title: '공통 컨텍스트 상단 배치 (Prompt Cache Pinning)',
    description:
      'README, API 명세, 설계서 등 변하지 않는 핵심 문서를 시스템 프롬프트 최상단에 배치하면 2026 최신 모델(Claude/Gemini)에서 90% 캐시 읽기 할인이 적용됩니다.',
    impact: 'HIGH',
    action_hint: '시스템 프롬프트의 가변 컨텍스트를 맨 뒤로 이동하세요.',
  },
  {
    id: 'session-compaction',
    title: '100턴 단위 세션 분할 또는 컴팩션 (/compact)',
    description:
      '100턴을 초과하는 대형 세션은 매 턴마다 전체 대화 히스토리가 누적 입력 토큰으로 재전송되어 비용이 기하급수적으로 증가합니다.',
    impact: 'MEDIUM',
    action_hint: '장기 세션은 새 세션으로 분기하거나 주기적으로 요약 압축하세요.',
  },
  {
    id: 'subagent-delegation',
    title: '경량 탐색 작업은 Flash/Haiku 서브에이전트로 위임',
    description:
      '단순 코드 검색, 파일 목록 조사 등은 Gemini 3.1 Flash-Lite($0.15/1M)나 Claude Haiku 5($0.40/1M) 서브에이전트로 분리하여 주력 모델의 입력 토큰을 절약하세요.',
    impact: 'MEDIUM',
    action_hint: '단순 탐색 시 경량 모델 서브에이전트를 적극 활용하세요.',
  },
];

/** 2026년 기준 주요 모델의 캐시 읽기 할인율 — model-pricing.service.ts와 같은 수치. */
export const MODEL_CACHE_BENCHMARKS: ModelCacheBenchmark[] = [
  { model: 'Claude Sonnet 5', discount: '90% 할인', readPrice: '$0.20 / 1M' },
  { model: 'Gemini 3.8 Flash', discount: '90% 할인', readPrice: '$0.075 / 1M' },
  { model: 'GPT-5.6 Terra', discount: '90% 할인', readPrice: '$0.20 / 1M' },
  { model: 'Claude Fable 5.1', discount: '97.5% 파격 할인', readPrice: '$0.25 / 1M' },
  { model: 'Gemini 3.6 Flash', discount: '90% 할인', readPrice: '$0.050 / 1M' },
];

export interface TokenWasteIntelligence {
  cache_efficiency: CacheEfficiencyMetric;
  cost_distribution: CostDistribution;
  optimization_guides: OptimizationGuide[];
  model_cache_benchmarks: ModelCacheBenchmark[];
}

/**
 * 프로젝트 에이전트 실행 데이터를 종합해 캐시 적중률·절감액(실측)과 세션당 비용 분포를 낸다.
 * 이전 버전의 임계값 기반 "낭비 판정"(50M/10M 토큰 → 60%/25% 낭비)은 캐시 읽기가 쌓인
 * 세션을 가장 낭비가 심하다고 찍는 오류가 있어 제거했다(DESIGN_DRIFT 18번).
 */
export function computeTokenWasteIntelligence(
  runs: CacheRunInput[],
  resolvePricing: PricingLookup,
): TokenWasteIntelligence {
  return {
    cache_efficiency: computeCacheEfficiency(runs, resolvePricing),
    cost_distribution: computeCostDistribution(runs),
    optimization_guides: OPTIMIZATION_GUIDES,
    model_cache_benchmarks: MODEL_CACHE_BENCHMARKS,
  };
}
