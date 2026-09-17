import {
  computeBurnRate,
  BURN_RATE_SPIKE_WARNING_TOKENS,
  BURN_RATE_SPIKE_CRITICAL_TOKENS,
  BURN_RATE_SPIKE_CRITICAL_COST,
} from './burn-rate';

describe('computeBurnRate', () => {
  const baseNow = new Date('2026-09-18T12:00:00.000Z');

  it('스파이크 임계치 상수가 올바르게 정의되어 있다', () => {
    expect(BURN_RATE_SPIKE_WARNING_TOKENS).toBe(30_000);
    expect(BURN_RATE_SPIKE_CRITICAL_TOKENS).toBe(60_000);
    expect(BURN_RATE_SPIKE_CRITICAL_COST).toBe(0.5);
  });

  it('실행 이력이 전혀 없는 경우 정상(normal) 상태와 0 속도를 반환한다', () => {
    const result = computeBurnRate([], 15, baseNow);

    expect(result.current_tokens_per_min).toBe(0);
    expect(result.current_cost_per_min).toBe('0.0000');
    expect(result.spike_level).toBe('normal');
    expect(result.is_spike).toBe(false);
    expect(result.dominant_agent).toBeUndefined();
    expect(result.recommendation).toContain('정상적인 토큰 소모 속도');
    expect(result.agents).toEqual([]);
  });

  it('소량 토큰 소모 세션은 정상(normal) 등급으로 평가한다', () => {
    // 5분 전 시작하여 실행 중, 10,000 토큰 사용 (분당 2,000 토큰)
    const runs = [
      {
        agent_name: 'claude-code',
        tokens_used: 10_000,
        cost: '0.0300',
        status: 'running',
        started_at: new Date('2026-09-18T11:55:00.000Z'),
        ended_at: null,
      },
    ];

    const result = computeBurnRate(runs, 15, baseNow);

    expect(result.current_tokens_per_min).toBe(2000);
    expect(result.current_cost_per_min).toBe('0.0060');
    expect(result.spike_level).toBe('normal');
    expect(result.is_spike).toBe(false);
    expect(result.dominant_agent).toBe('claude-code');
  });

  it('분당 3만 토큰 이상 소모 시 주의(warning) 스파이크로 판정한다', () => {
    // 2분 전 시작하여 실행 중, 80,000 토큰 사용 (분당 40,000 토큰)
    const runs = [
      {
        agent_name: 'claude-code',
        tokens_used: 80_000,
        cost: '0.2400',
        status: 'running',
        started_at: new Date('2026-09-18T11:58:00.000Z'),
        ended_at: null,
      },
    ];

    const result = computeBurnRate(runs, 15, baseNow);

    expect(result.current_tokens_per_min).toBe(40000);
    expect(result.spike_level).toBe('warning');
    expect(result.is_spike).toBe(true);
    expect(result.dominant_agent).toBe('claude-code');
    expect(result.recommendation).toContain('토큰 소모 속도가 급증');
  });

  it('분당 6만 토큰 초과 시 긴급(critical) 스파이크로 판정하고 중단 권고를 제시한다', () => {
    // 1분 전 시작하여 90,000 토큰 사용 (분당 90,000 토큰)
    const runs = [
      {
        agent_name: 'antigravity',
        tokens_used: 90_000,
        cost: '0.0810',
        status: 'running',
        started_at: new Date('2026-09-18T11:59:00.000Z'),
        ended_at: null,
      },
    ];

    const result = computeBurnRate(runs, 15, baseNow);

    expect(result.current_tokens_per_min).toBe(90000);
    expect(result.spike_level).toBe('critical');
    expect(result.is_spike).toBe(true);
    expect(result.dominant_agent).toBe('antigravity');
    expect(result.recommendation).toContain('무한 루프 또는 컨텍스트 폭주');
  });

  it('토큰 수는 임계치 미만이라도 분당 비용이 $0.50 이상이면 critical 스파이크로 판정한다', () => {
    // 1분 전 시작하여 20,000 토큰 사용했으나 고비용 모델로 $0.60 소모
    const runs = [
      {
        agent_name: 'cursor',
        tokens_used: 20_000,
        cost: '0.6000',
        status: 'running',
        started_at: new Date('2026-09-18T11:59:00.000Z'),
        ended_at: null,
      },
    ];

    const result = computeBurnRate(runs, 15, baseNow);

    expect(result.spike_level).toBe('critical');
    expect(result.is_spike).toBe(true);
    expect(result.dominant_agent).toBe('cursor');
  });

  it('다중 에이전트 실행 시 개별 속도를 정렬하고 합산 속도를 정확히 계산한다', () => {
    const runs = [
      {
        agent_name: 'antigravity',
        tokens_used: 30_000,
        cost: '0.0300',
        status: 'running',
        started_at: new Date('2026-09-18T11:59:00.000Z'), // 1분 경과: 30k/min
        ended_at: null,
      },
      {
        agent_name: 'claude-code',
        tokens_used: 50_000,
        cost: '0.1500',
        status: 'running',
        started_at: new Date('2026-09-18T11:59:00.000Z'), // 1분 경과: 50k/min
        ended_at: null,
      },
    ];

    const result = computeBurnRate(runs, 15, baseNow);

    expect(result.current_tokens_per_min).toBe(80000); // 30k + 50k
    expect(result.spike_level).toBe('critical'); // 80k >= 60k
    expect(result.dominant_agent).toBe('claude-code');
    expect(result.agents).toHaveLength(2);
    expect(result.agents[0].agent_name).toBe('claude-code');
    expect(result.agents[0].tokens_per_minute).toBe(50000);
    expect(result.agents[0].spike_level).toBe('warning');
    expect(result.agents[1].agent_name).toBe('antigravity');
    expect(result.agents[1].tokens_per_minute).toBe(30000);
    expect(result.agents[1].spike_level).toBe('warning');
  });

  it('10초 미만의 매우 짧은 세션의 경우 10초 보정을 적용하여 과대 계산을 방지한다', () => {
    // 2초 만에 10,000 토큰을 사용한 경우, 2초 대신 10초(1/6분)로 보정 -> 60,000/min
    const runs = [
      {
        agent_name: 'fast-runner',
        tokens_used: 10_000,
        cost: '0.0200',
        status: 'running',
        started_at: new Date('2026-09-18T11:59:58.000Z'), // 2초 전
        ended_at: null,
      },
    ];

    const result = computeBurnRate(runs, 15, baseNow);

    expect(result.current_tokens_per_min).toBe(60000);
    expect(result.spike_level).toBe('critical');
  });
});
