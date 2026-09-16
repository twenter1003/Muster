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
