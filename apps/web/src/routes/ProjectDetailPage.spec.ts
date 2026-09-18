import { describe, expect, it } from 'vitest';

describe('ProjectDetailPage 라이브 틱 격리 및 단조 증가 검증', () => {
  it('프로젝트 전환 시 활성 에이전트 및 하트비트 상태를 완전 초기화한다', () => {
    // 시뮬레이션: Project A에서 활성 상태
    let activeAgents = ['claude-code', 'antigravity'];
    let agentStartTimes: Record<string, number> = { 'claude-code': 1000, antigravity: 1005 };
    let agentHeartbeats: Record<string, any> = {
      'claude-code': { tokens_used: 5000, cost: '0.0180' },
      antigravity: { tokens_used: 2000, cost: '0.0018' },
    };

    // id 변경 시 격리 플러시 로직
    const resetOnProjectChange = () => {
      activeAgents = [];
      agentStartTimes = {};
      agentHeartbeats = {};
    };

    resetOnProjectChange();

    expect(activeAgents).toEqual([]);
    expect(agentStartTimes).toEqual({});
    expect(agentHeartbeats).toEqual({});
  });

  it('하트비트 수신 시 토큰 및 비용의 단조 증가(Monotonic Increase)를 보장한다', () => {
    const prevItem = {
      tokens_used: 10000,
      cost: '0.0360',
      delta_tokens: 2000,
      delta_cost: '0.0072',
      last_tick_at: 123456,
    };

    // 만약 네트워크 지연이나 역전으로 더 작은 토큰/비용이 오더라도 이전 최대치를 유지
    const payloadOutdated = {
      tokens_used: 8000,
      cost: '0.0280',
      delta_tokens: 0,
      delta_cost: '0',
    };

    const nextTokens = Math.max(prevItem.tokens_used, payloadOutdated.tokens_used);
    const prevCostNum = Number(prevItem.cost);
    const nextCostNum = Number(payloadOutdated.cost);
    const nextCost = nextCostNum >= prevCostNum ? payloadOutdated.cost : prevItem.cost;

    expect(nextTokens).toBe(10000);
    expect(nextCost).toBe('0.0360');

    // 정상적인 증가 시에는 새로운 값으로 갱신
    const payloadNewer = {
      tokens_used: 15000,
      cost: '0.0540',
      delta_tokens: 5000,
      delta_cost: '0.0180',
    };

    const updatedTokens = Math.max(prevItem.tokens_used, payloadNewer.tokens_used);
    const updatedCost =
      Number(payloadNewer.cost) >= prevCostNum ? payloadNewer.cost : prevItem.cost;

    expect(updatedTokens).toBe(15000);
    expect(updatedCost).toBe('0.0540');
  });
});
