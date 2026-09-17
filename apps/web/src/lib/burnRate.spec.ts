import { describe, it, expect } from 'vitest';
import {
  formatBurnRate,
  formatCostPerMin,
  evaluateSpikeLevel,
  getSpikeIcon,
  getSpikeLabel,
  computeLiveBurnRate,
  type BurnRateStatus,
} from './burnRate';

describe('burnRate utils', () => {
  describe('formatBurnRate', () => {
    it('0 또는 음수일 때 0/min을 반환한다', () => {
      expect(formatBurnRate(0)).toBe('0/min');
      expect(formatBurnRate(-100)).toBe('0/min');
    });

    it('1,000 미만일 때 정수/min으로 포맷팅한다', () => {
      expect(formatBurnRate(850)).toBe('850/min');
    });

    it('1,000 이상일 때 k/min으로 포맷팅한다', () => {
      expect(formatBurnRate(1200)).toBe('1.2k/min');
      expect(formatBurnRate(15000)).toBe('15k/min');
      expect(formatBurnRate(45600)).toBe('45.6k/min');
    });

    it('1,000,000 이상일 때 M/min으로 포맷팅한다', () => {
      expect(formatBurnRate(1200000)).toBe('1.2M/min');
      expect(formatBurnRate(5000000)).toBe('5M/min');
    });
  });

  describe('formatCostPerMin', () => {
    it('0일 때 $0.00/min을 반환한다', () => {
      expect(formatCostPerMin(0)).toBe('$0.00/min');
      expect(formatCostPerMin('0')).toBe('$0.00/min');
    });

    it('0.01 미만일 때 <$0.01/min을 반환한다', () => {
      expect(formatCostPerMin(0.004)).toBe('<$0.01/min');
    });

    it('0.01 이상일 때 소수 2자리로 포맷팅한다', () => {
      expect(formatCostPerMin(0.254)).toBe('$0.25/min');
      expect(formatCostPerMin('1.500')).toBe('$1.50/min');
    });
  });

  describe('evaluateSpikeLevel', () => {
    it('분당 3만 미만 및 $0.50 미만일 때 normal을 반환한다', () => {
      expect(evaluateSpikeLevel(25000, 0.1)).toBe('normal');
    });

    it('분당 3만 이상 6만 미만일 때 warning을 반환한다', () => {
      expect(evaluateSpikeLevel(35000, 0.2)).toBe('warning');
      expect(evaluateSpikeLevel(59999, 0.3)).toBe('warning');
    });

    it('분당 6만 이상일 때 critical을 반환한다', () => {
      expect(evaluateSpikeLevel(60000, 0.1)).toBe('critical');
      expect(evaluateSpikeLevel(120000, 0.4)).toBe('critical');
    });

    it('토큰 수가 적어도 비용이 분당 $0.50 이상이면 critical을 반환한다', () => {
      expect(evaluateSpikeLevel(10000, 0.55)).toBe('critical');
    });
  });

  describe('getSpikeIcon & getSpikeLabel', () => {
    it('각 레벨에 맞는 아이콘과 라벨을 반환한다', () => {
      expect(getSpikeIcon('normal')).toBe('⚡');
      expect(getSpikeLabel('normal')).toBe('정상 소모');

      expect(getSpikeIcon('warning')).toBe('⚠️');
      expect(getSpikeLabel('warning')).toBe('주의: 소모 급증');

      expect(getSpikeIcon('critical')).toBe('🚨');
      expect(getSpikeLabel('critical')).toBe('위험: 비정상 급증');
    });
  });

  describe('computeLiveBurnRate', () => {
    it('활성 에이전트가 없으면 기본 API 상태를 반환한다', () => {
      const base: BurnRateStatus = {
        current_tokens_per_min: 5000,
        current_cost_per_min: '0.0150',
        spike_level: 'normal',
        is_spike: false,
        window_minutes: 15,
        recommendation: '정상 소모 중',
        agents: [],
      };

      const result = computeLiveBurnRate(base, [], {}, {});
      expect(result).toEqual(base);
    });

    it('활성 에이전트의 실시간 하트비트를 반영하여 60fps 속도를 재계산한다', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const startSec = nowSec - 60; // 1분 전 시작

      const heartbeats = {
        'claude-code': {
          tokens_used: 75000, // 1분에 75,000 토큰 소모
          cost: '0.2250',
          delta_tokens: 5000,
          delta_cost: '0.0150',
          last_tick_at: Date.now(),
        },
      };

      const result = computeLiveBurnRate(undefined, ['claude-code'], heartbeats, {
        'claude-code': startSec,
      });

      expect(result.current_tokens_per_min).toBeGreaterThanOrEqual(70000);
      expect(result.spike_level).toBe('critical');
      expect(result.is_spike).toBe(true);
      expect(result.dominant_agent).toBe('claude-code');
      expect(result.recommendation).toContain('무한 루프 또는 컨텍스트 폭주');
    });
  });
});
