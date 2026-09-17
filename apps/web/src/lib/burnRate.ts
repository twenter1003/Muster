export type SpikeLevel = 'normal' | 'warning' | 'critical';

export const BURN_RATE_SPIKE_WARNING_TOKENS = 30_000;
export const BURN_RATE_SPIKE_CRITICAL_TOKENS = 60_000;
export const BURN_RATE_SPIKE_CRITICAL_COST = 0.5;

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

export interface AgentHeartbeatData {
  tokens_used: number;
  cost: string;
  delta_tokens: number;
  delta_cost: string;
  last_tick_at: number;
}

/**
 * 분당 토큰 수를 직관적인 k/min, M/min 문자열로 포맷팅한다.
 */
export function formatBurnRate(tokensPerMin: number): string {
  if (!tokensPerMin || tokensPerMin <= 0) return '0/min';
  if (tokensPerMin >= 1_000_000) {
    return `${(tokensPerMin / 1_000_000).toFixed(1).replace(/\.0$/, '')}M/min`;
  }
  if (tokensPerMin >= 1_000) {
    return `${(tokensPerMin / 1_000).toFixed(1).replace(/\.0$/, '')}k/min`;
  }
  return `${Math.round(tokensPerMin)}/min`;
}

/**
 * 분당 비용(USD)을 포맷팅한다.
 */
export function formatCostPerMin(costPerMin: string | number): string {
  const num = Number(costPerMin) || 0;
  if (num === 0) return '$0.00/min';
  if (num < 0.01) return `<$0.01/min`;
  return `$${num.toFixed(2)}/min`;
}

/**
 * 토큰 속도 및 비용 속도를 기반으로 스파이크 위험 등급을 판정한다.
 */
export function evaluateSpikeLevel(tokensPerMin: number, costPerMin?: number | string): SpikeLevel {
  const costNum = Number(costPerMin) || 0;
  if (tokensPerMin >= BURN_RATE_SPIKE_CRITICAL_TOKENS || costNum >= BURN_RATE_SPIKE_CRITICAL_COST) {
    return 'critical';
  }
  if (tokensPerMin >= BURN_RATE_SPIKE_WARNING_TOKENS) {
    return 'warning';
  }
  return 'normal';
}

/**
 * 스파이크 레벨에 따른 시각 뱃지 아이콘을 반환한다.
 */
export function getSpikeIcon(level: SpikeLevel): string {
  switch (level) {
    case 'critical':
      return '🚨';
    case 'warning':
      return '⚠️';
    default:
      return '⚡';
  }
}

/**
 * 스파이크 레벨에 따른 라벨 텍스트를 반환한다.
 */
export function getSpikeLabel(level: SpikeLevel): string {
  switch (level) {
    case 'critical':
      return '위험: 비정상 급증';
    case 'warning':
      return '주의: 소모 급증';
    default:
      return '정상 소모';
  }
}

/**
 * 기본 API 응답과 클라이언트 SSE 라이브 하트비트를 결합하여
 * 60fps 실시간 Burn Rate 상태를 산출한다.
 */
export function computeLiveBurnRate(
  baseStatus?: BurnRateStatus,
  activeAgents: string[] = [],
  agentHeartbeats: Record<string, AgentHeartbeatData> = {},
  agentStartTimes: Record<string, number> = {},
): BurnRateStatus {
  // 활성 실행 에이전트가 없으면 기본 API 상태를 그대로 반환
  if (activeAgents.length === 0) {
    return (
      baseStatus ?? {
        current_tokens_per_min: 0,
        current_cost_per_min: '0.0000',
        spike_level: 'normal',
        is_spike: false,
        window_minutes: 15,
        recommendation: '정상적인 토큰 소모 속도를 유지하고 있습니다.',
        agents: [],
      }
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);

  // 기본 상태의 에이전트 맵 복사
  const agentMap = new Map<string, AgentBurnRate>();
  if (baseStatus?.agents) {
    for (const a of baseStatus.agents) {
      agentMap.set(a.agent_name, { ...a });
    }
  }

  for (const agentName of activeAgents) {
    const hb = agentHeartbeats[agentName];
    const startTimeSec = agentStartTimes[agentName] ?? nowSec;
    const elapsedSec = Math.max(10, nowSec - startTimeSec);
    const elapsedMin = elapsedSec / 60;

    const tokensUsed = hb?.tokens_used ?? 0;
    const costNum = Number(hb?.cost ?? 0);

    const liveTokensPerMin = Math.round(tokensUsed / elapsedMin);
    const liveCostPerMin = (costNum / elapsedMin).toFixed(4);

    const level = evaluateSpikeLevel(liveTokensPerMin, liveCostPerMin);

    const updated: AgentBurnRate = {
      agent_name: agentName,
      tokens_per_minute: liveTokensPerMin,
      cost_per_minute: liveCostPerMin,
      is_spike: level !== 'normal',
      spike_level: level,
      active_runs_count: 1,
    };

    agentMap.set(agentName, updated);
  }

  const agentList = Array.from(agentMap.values()).sort(
    (a, b) => b.tokens_per_minute - a.tokens_per_minute,
  );

  const totalTokensPerMin = agentList.reduce((sum, a) => sum + a.tokens_per_minute, 0);
  const totalCostPerMin = agentList
    .reduce((sum, a) => sum + Number(a.cost_per_minute), 0)
    .toFixed(4);

  const overallLevel = evaluateSpikeLevel(totalTokensPerMin, totalCostPerMin);
  const dominant = agentList[0]?.tokens_per_minute > 0 ? agentList[0].agent_name : undefined;

  let recommendation = '정상적인 토큰 소모 속도를 유지하고 있습니다.';
  if (overallLevel === 'critical') {
    recommendation = dominant
      ? `[${dominant}] 비정상적인 대량 토큰 소모가 감지되었습니다. 무한 루프 또는 컨텍스트 폭주가 의심되니 즉시 세션을 확인하고 중단하세요.`
      : '비정상적인 대량 토큰 소모가 감지되었습니다. 에이전트 세션을 즉시 점검하세요.';
  } else if (overallLevel === 'warning') {
    recommendation = dominant
      ? `[${dominant}] 토큰 소모 속도가 급증하고 있습니다. 반복 도구 호출이나 대용량 파일 읽기를 점검하세요.`
      : '토큰 소모 속도가 급증하고 있습니다. 실행 상태를 점검하세요.';
  }

  return {
    current_tokens_per_min: totalTokensPerMin,
    current_cost_per_min: totalCostPerMin,
    spike_level: overallLevel,
    is_spike: overallLevel !== 'normal',
    window_minutes: baseStatus?.window_minutes ?? 15,
    dominant_agent: dominant,
    recommendation,
    agents: agentList,
  };
}
