import { describe, expect, it } from 'vitest';
import { formatCost, formatTokenCount, getCacheBadge, multipleOfMedian } from './tokenIntelligence';

describe('tokenIntelligence', () => {
  describe('formatTokenCount', () => {
    it('10억 이상은 B로 포맷팅한다', () => {
      expect(formatTokenCount(1_370_000_000)).toBe('1.37B');
      expect(formatTokenCount('12500000000')).toBe('12.5B');
    });

    it('100만 이상은 M으로 포맷팅한다', () => {
      expect(formatTokenCount(123_400_000)).toBe('123.4M');
      expect(formatTokenCount(2_500_000)).toBe('2.50M');
    });

    it('1000 이상은 K로 포맷팅한다', () => {
      expect(formatTokenCount(45_000)).toBe('45K');
      expect(formatTokenCount(3_200)).toBe('3.2K');
    });

    it('1000 미만은 그대로 반환한다', () => {
      expect(formatTokenCount(500)).toBe('500');
    });

    it('비정상 입력값은 0을 반환한다', () => {
      expect(formatTokenCount(NaN)).toBe('0');
      expect(formatTokenCount(-50)).toBe('0');
      expect(formatTokenCount('invalid')).toBe('0');
    });
  });

  describe('getCacheBadge', () => {
    it('내역이 없으면(null) "캐시 내역 없음"을 반환한다 — 0%로 세지 않는다', () => {
      const badge = getCacheBadge(null);
      expect(badge.text).toBe('캐시 내역 없음');
    });

    it('적중률 70% 이상은 ok 뱃지를 반환한다', () => {
      const badge = getCacheBadge(85);
      expect(badge.text).toBe('캐시 적중 85%');
      expect(badge.className).toContain('badge--ok');
    });

    it('적중률 40~69%는 caution 뱃지를 반환한다', () => {
      const badge = getCacheBadge(50);
      expect(badge.className).toContain('badge--caution');
    });

    it('적중률 40% 미만은 warn 뱃지를 반환한다', () => {
      const badge = getCacheBadge(10);
      expect(badge.className).toContain('badge--warn');
    });
  });

  describe('multipleOfMedian', () => {
    it('분포 데이터가 없으면 null을 반환한다', () => {
      expect(multipleOfMedian('10.00', null)).toBeNull();
    });

    it('분포 표본이 0이면 null을 반환한다', () => {
      expect(
        multipleOfMedian('10.00', {
          median_cost_usd: '0.0000',
          p99_cost_usd: '0.0000',
          sample_size: 0,
          outliers: [],
        }),
      ).toBeNull();
    });

    it('중앙값 대비 배수를 계산한다', () => {
      const result = multipleOfMedian('5.00', {
        median_cost_usd: '2.00',
        p99_cost_usd: '10.00',
        sample_size: 5,
        outliers: [],
      });
      expect(result).toBe(2.5);
    });
  });

  describe('formatCost', () => {
    it('0 또는 잘못된 값은 $0.00을 반환한다', () => {
      expect(formatCost(0)).toBe('$0.00');
      expect(formatCost('0')).toBe('$0.00');
      expect(formatCost(null)).toBe('$0.00');
      expect(formatCost(undefined)).toBe('$0.00');
      expect(formatCost(-5)).toBe('$0.00');
      expect(formatCost('invalid')).toBe('$0.00');
    });

    it('1센트 미만 소액은 소수점 4자리까지 표시한다', () => {
      expect(formatCost(0.0001)).toBe('$0.0001');
      expect(formatCost('0.0045')).toBe('$0.0045');
    });

    it('일반 금액은 달러 센트 2자리로 포맷팅한다', () => {
      expect(formatCost(0.05)).toBe('$0.05');
      expect(formatCost(3.6)).toBe('$3.60');
      expect(formatCost('19.44')).toBe('$19.44');
      expect(formatCost(1234.56)).toBe('$1,234.56');
    });
  });
});
