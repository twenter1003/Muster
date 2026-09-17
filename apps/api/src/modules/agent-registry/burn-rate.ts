export type SpikeLevel = 'normal' | 'warning' | 'critical';

export const BURN_RATE_SPIKE_WARNING_TOKENS = 30_000; // 분당 3만 토큰 이상: 주의
export const BURN_RATE_SPIKE_CRITICAL_TOKENS = 60_000; // 분당 6만 토큰 이상: 긴급 급증
export const BURN_RATE_SPIKE_CRITICAL_COST = 0.5; // 분당 $0.50 이상: 긴급 급증

export interface AgentBurnRate {
  agent_name: string;
  tokens_per_minute: number;
  cost_per_minute: string;
  is_spike: boolean;
  spike_level: SpikeLevel;
  active_runs_count: number;
}

export interface BurnRateStatus {
  current_tokens_per_min: number;
  current_cost_per_min: string;
  spike_level: SpikeLevel;
  is_spike: boolean;
  window_minutes: number;
  dominant_agent?: string;
  recommendation: string;
  agents: AgentBurnRate[];
}

export interface BurnRateRunItem {
  agent_name?: string;
  tokens_used: number;
  cost?: string | number | null;
  status: string;
  started_at: Date | string;
  ended_at?: Date | string | null;
}

/**
 * 주어진 시간 윈도우 및 활성 세션의 실행 데이터를 바탕으로
 * 에이전트별 실시간 Burn Rate 및 비정상 스파이크를 판정한다.
 */
export function computeBurnRate(
  runs: BurnRateRunItem[],
  windowMinutes = 15,
  now = new Date(),
): BurnRateStatus {
  const nowMs = now.getTime();
  const windowStartMs = nowMs - windowMinutes * 60 * 1000;

  // 1. 에이전트별 그룹핑
  const agentMap = new Map<string, BurnRateRunItem[]>();
  for (const r of runs) {
    const name = r.agent_name || 'agent';
    if (!agentMap.has(name)) {
      agentMap.set(name, []);
    }
    agentMap.get(name)!.push(r);
  }

  const agents: AgentBurnRate[] = [];

  for (const [agent_name, agentRuns] of agentMap.entries()) {
    let activeRunsCount = 0;
    let activeTokensRateSum = 0;
    let activeCostRateSum = 0;
    let windowTokensSum = 0;
    let windowCostSum = 0;

    for (const r of agentRuns) {
      const startedMs = new Date(r.started_at).getTime();
      const endedMs = r.ended_at ? new Date(r.ended_at).getTime() : null;
      const isActive = r.status === 'running' || endedMs === null;
      const costNum = Number(r.cost || 0);

      if (isActive) {
        activeRunsCount++;
        // 최소 10초(1/6분)로 보정하여 순간 과대 계산 방지
        const elapsedMinutes = Math.max(10_000, nowMs - startedMs) / 60_000;
        activeTokensRateSum += r.tokens_used / elapsedMinutes;
        activeCostRateSum += costNum / elapsedMinutes;
      }

      // 윈도우 내에 걸치는 세션의 총량 누적
      const isInWindow =
        startedMs >= windowStartMs || (endedMs !== null && endedMs >= windowStartMs);
      if (isInWindow) {
        windowTokensSum += r.tokens_used;
        windowCostSum += costNum;
      }
    }

    const windowTokensRate = windowTokensSum / Math.max(1, windowMinutes);
    const windowCostRate = windowCostSum / Math.max(1, windowMinutes);

    // 활성 실행 세션의 순간 속도와 최근 윈도우 평균 속도 중 높은 쪽을 반영
    const effectiveTokensRate = Math.round(Math.max(activeTokensRateSum, windowTokensRate));
    const effectiveCostRate = Math.max(activeCostRateSum, windowCostRate).toFixed(4);

    const isCritical =
      effectiveTokensRate >= BURN_RATE_SPIKE_CRITICAL_TOKENS ||
      Number(effectiveCostRate) >= BURN_RATE_SPIKE_CRITICAL_COST;
    const isWarning = !isCritical && effectiveTokensRate >= BURN_RATE_SPIKE_WARNING_TOKENS;

    const spike_level: SpikeLevel = isCritical ? 'critical' : isWarning ? 'warning' : 'normal';

    agents.push({
      agent_name,
      tokens_per_minute: effectiveTokensRate,
      cost_per_minute: effectiveCostRate,
      is_spike: spike_level !== 'normal',
      spike_level,
      active_runs_count: activeRunsCount,
    });
  }

  // 속도 내림차순 정렬
  agents.sort((a, b) => b.tokens_per_minute - a.tokens_per_minute);

  const current_tokens_per_min = agents.reduce((sum, a) => sum + a.tokens_per_minute, 0);
  const current_cost_per_min = agents
    .reduce((sum, a) => sum + Number(a.cost_per_minute), 0)
    .toFixed(4);

  const isCriticalOverall =
    current_tokens_per_min >= BURN_RATE_SPIKE_CRITICAL_TOKENS ||
    Number(current_cost_per_min) >= BURN_RATE_SPIKE_CRITICAL_COST;
  const isWarningOverall =
    !isCriticalOverall && current_tokens_per_min >= BURN_RATE_SPIKE_WARNING_TOKENS;

  const spike_level: SpikeLevel = isCriticalOverall
    ? 'critical'
    : isWarningOverall
      ? 'warning'
      : 'normal';

  const dominant = agents[0]?.tokens_per_minute > 0 ? agents[0].agent_name : undefined;

  let recommendation = '정상적인 토큰 소모 속도를 유지하고 있습니다.';
  if (spike_level === 'critical') {
    recommendation = dominant
      ? `[${dominant}] 비정상적인 대량 토큰 소모가 감지되었습니다. 무한 루프 또는 컨텍스트 폭주가 의심되니 즉시 세션을 확인하고 중단하세요.`
      : '비정상적인 대량 토큰 소모가 감지되었습니다. 에이전트 세션을 즉시 점검하세요.';
  } else if (spike_level === 'warning') {
    recommendation = dominant
      ? `[${dominant}] 토큰 소모 속도가 급증하고 있습니다. 반복 도구 호출이나 대용량 파일 읽기를 점검하세요.`
      : '토큰 소모 속도가 급증하고 있습니다. 실행 상태를 점검하세요.';
  }

  return {
    current_tokens_per_min,
    current_cost_per_min,
    spike_level,
    is_spike: spike_level !== 'normal',
    window_minutes: windowMinutes,
    dominant_agent: dominant,
    recommendation,
    agents,
  };
}
