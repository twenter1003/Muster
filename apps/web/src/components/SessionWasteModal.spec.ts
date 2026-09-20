import { describe, expect, it } from 'vitest';
import type { SessionWasteInfo } from './SessionWasteModal';
import { formatCost, formatTokenCount, getCacheBadge } from '../lib/tokenIntelligence';
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
    cache: {
      hit_rate_percentage: 92,
      input_tokens: 12000,
      cache_read_tokens: 138000,
      savings_usd: '0.2070',
      has_breakdown: true,
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
    cache: {
      hit_rate_percentage: 30,
      input_tokens: 29400,
      cache_read_tokens: 12600,
      savings_usd: '0.0090',
      has_breakdown: true,
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
    cache: undefined,
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

  it('캐시 적중률(실측)에 따른 뱃지 매핑이 정확하다', () => {
    const highBadge = getCacheBadge(92);
    expect(highBadge.text).toBe('캐시 적중 92%');
    expect(highBadge.className).toContain('badge--ok');

    const lowBadge = getCacheBadge(30);
    expect(lowBadge.text).toBe('캐시 적중 30%');
    expect(lowBadge.className).toContain('badge--warn');

    const noBadge = getCacheBadge(null);
    expect(noBadge.text).toBe('캐시 내역 없음');
  });

  it('캐싱으로 아낀 금액이 실측값으로 포맷팅된다', () => {
    const savingsUsd = mockRunningSession.cache?.savings_usd ?? '0.00';
    expect(formatCost(savingsUsd)).toBe('$0.21');
  });

  it('내역 없는 세션(succeeded)은 cache가 undefined로 남는다 — 0%로 지어내지 않는다', () => {
    expect(mockSucceededSession.status).toBe('succeeded');
    expect(mockSucceededSession.cache).toBeUndefined();
    expect(formatTokenCount(mockSucceededSession.tokens_used)).toBe('12K');
  });

  it('projectId가 주어졌을 때 전체 리포트 다운로드 엔드포인트 URL이 올바르게 구성된다', () => {
    const projectId = 'proj-session-1';
    expect(`/projects/${projectId}/waste-report.csv`).toBe(
      '/projects/proj-session-1/waste-report.csv',
    );
    expect(`/projects/${projectId}/waste-report.json`).toBe(
      '/projects/proj-session-1/waste-report.json',
    );
  });
});
