export interface WasteBadgeInfo {
  text: string;
  className: string;
}

/**
 * 큰 토큰 숫자를 사람이 읽기 쉬운 단위(B, M, K)로 축약한다.
 *
 * - 1,000,000,000 이상: B (예: 1.37B)
 * - 1,000,000 이상: M (예: 12.3M)
 * - 1,000 이상: K (예: 45K)
 * - 그 외: 원본 숫자 (쉼표 포함)
 */
export function formatTokenCount(tokens: number | string): string {
  const num = typeof tokens === 'string' ? Number(tokens) : tokens;
  if (!Number.isFinite(num) || num < 0) return '0';

  if (num >= 1_000_000_000) {
    const val = num / 1_000_000_000;
    return `${val >= 10 ? val.toFixed(1) : val.toFixed(2)}B`;
  }
  if (num >= 1_000_000) {
    const val = num / 1_000_000;
    return `${val >= 10 ? val.toFixed(1) : val.toFixed(2)}M`;
  }
  if (num >= 1_000) {
    const val = num / 1_000;
    return `${val >= 10 ? Math.round(val) : val.toFixed(1)}K`;
  }
  return num.toLocaleString();
}

/**
 * 캐시 적중률(실측)에 따른 뱃지 텍스트와 스타일 클래스를 반환한다.
 * 내역이 없는(예전) 세션은 "0%"가 아니라 "모름"으로 구분한다.
 */
export function getCacheBadge(hitRatePercentage: number | null | undefined): WasteBadgeInfo {
  if (hitRatePercentage === null || hitRatePercentage === undefined) {
    return { text: '캐시 내역 없음', className: 'badge' };
  }
  if (hitRatePercentage >= 70) {
    return { text: `캐시 적중 ${hitRatePercentage}%`, className: 'badge badge--ok' };
  }
  if (hitRatePercentage >= 40) {
    return { text: `캐시 적중 ${hitRatePercentage}%`, className: 'badge badge--caution' };
  }
  return { text: `캐시 적중 ${hitRatePercentage}%`, className: 'badge badge--warn' };
}

/**
 * USD 비용을 통화 형식($X.XX)으로 포맷팅한다.
 * 1센트 미만의 소액인 경우 소수점 4자리까지 표기($0.0001)하여 정밀도를 보존한다.
 */
export function formatCost(cost?: number | string | null): string {
  if (cost === undefined || cost === null) return '$0.00';
  const num = typeof cost === 'string' ? Number(cost) : cost;
  if (!Number.isFinite(num) || num <= 0) return '$0.00';

  if (num < 0.01) {
    return `$${num.toFixed(4)}`;
  }
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface CacheEfficiencyMetric {
  hit_rate_percentage: number | null;
  input_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  savings_usd: string;
  sessions_with_breakdown: number;
  sessions_without_breakdown: number;
}

export interface SessionCacheView {
  hit_rate_percentage: number | null;
  input_tokens: number;
  cache_read_tokens: number;
  savings_usd: string;
  has_breakdown: boolean;
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
  outliers: CostOutlier[];
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
  cost_distribution: CostDistribution;
  optimization_guides: OptimizationGuide[];
  model_cache_benchmarks: ModelCacheBenchmark[];
}

/** 세션 비용이 프로젝트 중앙값의 몇 배인지 계산한다. 분포 데이터가 없으면 null. */
export function multipleOfMedian(
  costUsd: string | number | null | undefined,
  distribution: CostDistribution | null | undefined,
): number | null {
  if (!distribution || distribution.sample_size === 0) return null;
  const median = Number(distribution.median_cost_usd);
  const cost = typeof costUsd === 'string' ? Number(costUsd) : costUsd;
  if (!Number.isFinite(median) || median <= 0 || !Number.isFinite(cost) || !cost) return null;
  return Math.round((cost / median) * 10) / 10;
}
