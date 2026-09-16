import { describe, expect, it } from 'vitest';
import { formatTokenCount, getWasteBadge } from './tokenIntelligence';

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

  describe('getWasteBadge', () => {
    it('HIGH_WASTE는 signal 뱃지를 반환한다', () => {
      const badge = getWasteBadge('HIGH_WASTE');
      expect(badge.text).toBe('낭비 위험');
      expect(badge.className).toContain('badge--signal');
    });

    it('NORMAL 또는 미지정은 기본 badge를 반환한다', () => {
      const badge = getWasteBadge('NORMAL');
      expect(badge.text).toBe('정상');
      expect(badge.className).toBe('badge');
    });
  });
});
