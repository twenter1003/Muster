export type WasteLevel = 'NORMAL' | 'CAUTION' | 'HIGH_WASTE';

export interface SessionWasteAssessment {
  level: WasteLevel;
  reason: string;
  estimated_wasted_tokens: number;
}

export interface WasteInsightSummary {
  total_wasted_tokens: number;
  waste_percentage: number;
  high_waste_sessions_count: number;
  recommendation: string;
}

/**
 * 개별 에이전트 실행의 토큰 사용량과 턴 수를 기반으로 낭비 위험도를 진단한다.
 *
 * - 5천만 토큰 이상이거나 300턴 이상: 초장기 세션으로 인한 컨텍스트 팽창 낭비 (약 60% 낭비 추정)
 * - 1천만 토큰 이상이거나 100턴 이상: 주의 단계 (약 25% 낭비 추정)
 * - 그 외: 정상 범위
 */
export function assessSessionWaste(tokens: number, turns?: number | null): SessionWasteAssessment {
  if (tokens >= 50_000_000 || (typeof turns === 'number' && turns >= 300)) {
    return {
      level: 'HIGH_WASTE',
      reason: '장기 세션으로 인한 컨텍스트 누적 낭비가 심각합니다. 세션 분리가 필요합니다.',
      estimated_wasted_tokens: Math.round(tokens * 0.6),
    };
  }

  if (tokens >= 10_000_000 || (typeof turns === 'number' && turns >= 100)) {
    return {
      level: 'CAUTION',
      reason: '세션 길이가 길어지며 토큰 소모율이 증가하고 있습니다. 컴팩션을 권장합니다.',
      estimated_wasted_tokens: Math.round(tokens * 0.25),
    };
  }

  return {
    level: 'NORMAL',
    reason: '컨텍스트 크기가 최적 상태로 유지되고 있습니다.',
    estimated_wasted_tokens: 0,
  };
}

/**
 * 프로젝트 전체 에이전트 실행 목록의 낭비 지표를 종합 요약한다.
 */
export function computeWasteInsight(
  runs: Array<{ tokens_used: number; turns?: number | null }>,
): WasteInsightSummary {
  let totalTokens = 0;
  let totalWasted = 0;
  let highWasteCount = 0;

  for (const run of runs) {
    totalTokens += run.tokens_used;
    const assessment = assessSessionWaste(run.tokens_used, run.turns);
    totalWasted += assessment.estimated_wasted_tokens;
    if (assessment.level === 'HIGH_WASTE') {
      highWasteCount++;
    }
  }

  const wastePercentage = totalTokens > 0 ? Math.round((totalWasted / totalTokens) * 100) : 0;
  let recommendation = '세션 컨텍스트가 적정 범위 내에서 유지되고 있습니다.';

  if (highWasteCount > 0) {
    recommendation = `초장기 세션(${highWasteCount}건)으로 인해 약 ${wastePercentage}%의 토큰이 과거 문맥 재전송에 소모되었습니다. 100~200턴 단위 세션 리셋을 권장합니다.`;
  } else if (wastePercentage > 15) {
    recommendation =
      '세션 길이가 다소 길어지는 경향이 있습니다. 주기적인 세션 초기화(/compact)를 권장합니다.';
  }

  return {
    total_wasted_tokens: totalWasted,
    waste_percentage: wastePercentage,
    high_waste_sessions_count: highWasteCount,
    recommendation,
  };
}

export interface CacheEfficiencyMetric {
  hit_rate_percentage: number;
  current_estimated_cost: string;
  optimized_cost: string;
  potential_savings: string;
  savings_percentage: number;
}

export interface WasteBreakdown {
  level: WasteLevel;
  total_wasted_tokens: number;
  waste_percentage: number;
  context_bloat_tokens: number;
  duplicate_reads_tokens: number;
  high_waste_sessions_count: number;
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

export interface TokenWasteIntelligence {
  cache_efficiency: CacheEfficiencyMetric;
  waste_breakdown: WasteBreakdown;
  optimization_guides: OptimizationGuide[];
  model_cache_benchmarks: ModelCacheBenchmark[];
}

/**
 * 프로젝트 에이전트 실행 데이터를 종합 분석하여 2026 프롬프트 캐싱 최적화 시뮬레이션 및
 * 토큰 낭비 인텔리전스 리포트를 생성한다.
 */
export function computeTokenWasteIntelligence(
  runs: Array<{
    tokens_used: number;
    cost?: string | number | null;
    turns?: number | null;
    agent_name?: string;
  }>,
): TokenWasteIntelligence {
  const summary = computeWasteInsight(runs);
  let totalCost = 0;

  for (const run of runs) {
    const costNum = typeof run.cost === 'string' ? parseFloat(run.cost) : Number(run.cost || 0);
    if (Number.isFinite(costNum) && costNum > 0) {
      totalCost += costNum;
    }
  }

  // 중복 읽기 토큰: 세션 내 반복 호출 및 파일 재조회로 인한 중복 추정 (약 15%)
  let totalTokens = 0;
  for (const run of runs) {
    totalTokens += run.tokens_used;
  }
  const duplicateReadsTokens = Math.round(totalTokens * 0.15);

  // 현재 추정 캐시 적중률: 낭비율이 높을수록 캐싱 미비로 인한 비효율이 큼
  let currentHitRate = 70;
  if (summary.waste_percentage >= 50) {
    currentHitRate = 25;
  } else if (summary.waste_percentage >= 25) {
    currentHitRate = 45;
  } else if (summary.waste_percentage >= 15) {
    currentHitRate = 60;
  }

  // 최적화 적용 시: 2026 프롬프트 캐싱 가이드라인 적용 시 85% 이상 적중률 달성
  // 캐시 읽기 단가는 정규 입력가의 10% (90% 할인)이므로, 적중 토큰은 비용이 1/10로 감소
  // 절감률 산출 공식: (목표적중률 - 현재적중률) * 0.90
  const savingsRate = Math.min(
    0.85,
    Math.max(0.1, ((85 - currentHitRate) / 100) * 0.9 + (summary.waste_percentage / 100) * 0.4),
  );
  const potentialSavingsNum = totalCost * savingsRate;
  const optimizedCostNum = Math.max(0, totalCost - potentialSavingsNum);
  const savingsPercentage = totalCost > 0 ? Math.round((potentialSavingsNum / totalCost) * 100) : 0;

  let overallLevel: WasteLevel = 'NORMAL';
  if (summary.high_waste_sessions_count > 0 || summary.waste_percentage >= 40) {
    overallLevel = 'HIGH_WASTE';
  } else if (summary.waste_percentage >= 15) {
    overallLevel = 'CAUTION';
  }

  const guides: OptimizationGuide[] = [
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
      impact: overallLevel === 'HIGH_WASTE' ? 'HIGH' : 'MEDIUM',
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

  const benchmarks: ModelCacheBenchmark[] = [
    { model: 'Claude Sonnet 5', discount: '90% 할인', readPrice: '$0.20 / 1M' },
    { model: 'Gemini 3.8 Flash', discount: '90% 할인', readPrice: '$0.075 / 1M' },
    { model: 'GPT-5.6 Terra', discount: '90% 할인', readPrice: '$0.20 / 1M' },
    { model: 'Claude Fable 5.1', discount: '97.5% 파격 할인', readPrice: '$0.25 / 1M' },
    { model: 'Gemini 3.6 Flash', discount: '90% 할인', readPrice: '$0.050 / 1M' },
  ];

  return {
    cache_efficiency: {
      hit_rate_percentage: currentHitRate,
      current_estimated_cost: totalCost.toFixed(4),
      optimized_cost: optimizedCostNum.toFixed(4),
      potential_savings: potentialSavingsNum.toFixed(4),
      savings_percentage: savingsPercentage,
    },
    waste_breakdown: {
      level: overallLevel,
      total_wasted_tokens: summary.total_wasted_tokens,
      waste_percentage: summary.waste_percentage,
      context_bloat_tokens: summary.total_wasted_tokens,
      duplicate_reads_tokens: duplicateReadsTokens,
      high_waste_sessions_count: summary.high_waste_sessions_count,
    },
    optimization_guides: guides,
    model_cache_benchmarks: benchmarks,
  };
}
