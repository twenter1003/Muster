export type WasteLevel = 'NORMAL' | 'CAUTION' | 'HIGH_WASTE';

export interface WasteBadgeInfo {
  text: string;
  className: string;
}

/**
 * 큰 토큰 숫자를 사람이 읽기 쉬운 단위(B, M, K)로 축약한다.
 *
 * - 1,000,000,000 이상: B (예: 1.37B)
 * - 1,000,000 이상: M (예: 12.3M)
 * - 1,000 이상: K (예: 45K)
 * - 그 외: 원본 숫자 (쉼표 포함)
 */
export function formatTokenCount(tokens: number | string): string {
  const num = typeof tokens === 'string' ? Number(tokens) : tokens;
  if (!Number.isFinite(num) || num < 0) return '0';

  if (num >= 1_000_000_000) {
    const val = num / 1_000_000_000;
    return `${val >= 10 ? val.toFixed(1) : val.toFixed(2)}B`;
  }
  if (num >= 1_000_000) {
    const val = num / 1_000_000;
    return `${val >= 10 ? val.toFixed(1) : val.toFixed(2)}M`;
  }
  if (num >= 1_000) {
    const val = num / 1_000;
    return `${val >= 10 ? Math.round(val) : val.toFixed(1)}K`;
  }
  return num.toLocaleString();
}

/**
 * 낭비 위험도에 따른 뱃지 텍스트와 스타일 클래스를 반환한다.
 */
export function getWasteBadge(level?: WasteLevel): WasteBadgeInfo {
  switch (level) {
    case 'HIGH_WASTE':
      return { text: '낭비 위험', className: 'badge badge--signal' };
    case 'CAUTION':
      return { text: '주의', className: 'badge' };
    case 'NORMAL':
    default:
      return { text: '정상', className: 'badge' };
  }
}
