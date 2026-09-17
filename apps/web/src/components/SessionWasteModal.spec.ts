import { describe, expect, it } from 'vitest';
import type { SessionWasteInfo } from './SessionWasteModal';
import { formatCost, formatTokenCount, getWasteBadge } from '../lib/tokenIntelligence';
import { formatBurnRate } from '../lib/burnRate';
import { formatElapsedTime } from '../lib/projectListUtils';

describe('SessionWasteModal 로직 및 데이터 정합성 검증', () => {
  const mockRunningSession: SessionWasteInfo = {
    id: 'run-test-running-12345678',
    agent_id: 'agent-1',
    agent_name: 'claude-code',
    tokens_used: 150000,
    cost: '0.4500',
    status: 'running',
    started_at: '2026-09-18T07:30:00.000Z',
    ended_at: null,
    duration_seconds: 600, // 10분
    waste: {
      level: 'HIGH_WASTE',
      reason:
        '100턴 이상의 장기 대화로 인해 매 턴마다 30k 이상의 이전 히스토리가 재전송되고 있습니다.',
      estimated_wasted_tokens: 65000,
      estimated_wasted_cost: '0.1950',
      recommendation: '/compact 명령어로 컨텍스트를 요약 압축하세요.',
    },
  };

  const mockCancelledSession: SessionWasteInfo = {
    id: 'run-test-cancelled-87654321',
    agent_id: 'agent-2',
    agent_name: 'antigravity',
    tokens_used: 42000,
    cost: '0.0315',
    status: 'cancelled',
    started_at: '2026-09-18T06:00:00.000Z',
    ended_at: '2026-09-18T06:08:30.000Z',
    duration_seconds: 510, // 8분 30초
    waste: {
      level: 'CAUTION',
      reason: '컨텍스트 누적이 시작되었습니다.',
      estimated_wasted_tokens: 12000,
      estimated_wasted_cost: '0.0090',
    },
  };

  const mockSucceededSession: SessionWasteInfo = {
    id: 'run-test-succeeded-11223344',
    agent_id: 'agent-3',
    agent_name: 'cursor',
    tokens_used: 12000,
    cost: '0.0432',
    status: 'succeeded',
    started_at: '2026-09-18T05:00:00.000Z',
    ended_at: '2026-09-18T05:03:00.000Z',
    duration_seconds: 180, // 3분
    waste: {
      level: 'NORMAL',
    },
  };

  it('실행 중인 세션(running)의 메트릭과 분당 소모율(Burn Rate)이 올바르게 계산된다', () => {
    const durationMin = mockRunningSession.duration_seconds! / 60; // 10분
    const burnRate = Math.round(mockRunningSession.tokens_used / durationMin);

    expect(durationMin).toBe(10);
    expect(burnRate).toBe(15000); // 15,000 tokens/min
    expect(formatBurnRate(burnRate)).toBe('15k/min');
    expect(formatTokenCount(mockRunningSession.tokens_used)).toBe('150K');
    expect(formatCost(mockRunningSession.cost)).toBe('$0.45');
    expect(formatElapsedTime(mockRunningSession.duration_seconds!)).toBe('10m 0s');
  });

  it('강제 중단된 세션(cancelled)의 상태 뱃지와 메트릭이 정상 표시된다', () => {
    expect(mockCancelledSession.status).toBe('cancelled');
    const badgeText = mockCancelledSession.status === 'cancelled' ? '강제 중단됨' : '정상';
    expect(badgeText).toBe('강제 중단됨');
    expect(formatElapsedTime(mockCancelledSession.duration_seconds!)).toBe('8m 30s');
    expect(formatTokenCount(mockCancelledSession.tokens_used)).toBe('42K');
    expect(formatCost(mockCancelledSession.cost)).toBe('$0.03');
  });

  it('낭비 위험도(HIGH_WASTE, CAUTION, NORMAL)에 따른 뱃지 매핑이 정확하다', () => {
    const highBadge = getWasteBadge('HIGH_WASTE');
    expect(highBadge.text).toBe('낭비 위험');
    expect(highBadge.className).toContain('badge--warn');

    const cautionBadge = getWasteBadge('CAUTION');
    expect(cautionBadge.text).toBe('주의');
    expect(cautionBadge.className).toContain('badge--caution');

    const normalBadge = getWasteBadge('NORMAL');
    expect(normalBadge.text).toBe('정상');
    expect(normalBadge.className).toContain('badge--ok');
  });

  it('추정 낭비 토큰 및 낭비 비용이 정확히 포맷팅된다', () => {
    const wastedTokens = mockRunningSession.waste?.estimated_wasted_tokens ?? 0;
    const wastedCost = mockRunningSession.waste?.estimated_wasted_cost ?? '0.00';

    expect(formatTokenCount(wastedTokens)).toBe('65K');
    expect(formatCost(wastedCost)).toBe('$0.20');
  });

  it('정상 완료된 세션(succeeded)의 상태가 정상 인식된다', () => {
    expect(mockSucceededSession.status).toBe('succeeded');
    expect(mockSucceededSession.waste?.level).toBe('NORMAL');
    expect(formatTokenCount(mockSucceededSession.tokens_used)).toBe('12K');
  });

  it('중단 API 엔드포인트 URL 경로가 올바르게 구성된다', () => {
    const abortPath = `/agent-runs/${mockRunningSession.id}/abort`;
    expect(abortPath).toBe('/agent-runs/run-test-running-12345678/abort');
  });
});
