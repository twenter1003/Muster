/**
 * 진행률 분석 버튼의 라벨을 결정한다.
 *
 * - 분석이 진행 중이면 "분석하는 중…"
 * - 이미 분석 결과가 존재하면 "다시 분석"
 * - 한 번도 분석한 적 없으면 "분석하기"
 */
export function getAnalyzeButtonLabel(analyzing: boolean, hasProgress: boolean): string {
  if (analyzing) {
    return '분석하는 중…';
  }
  return hasProgress ? '다시 분석' : '분석하기';
}

/**
 * 진행률 결과가 아직 없을 때 표시할 안내 문구를 결정한다.
 *
 * - 분석이 진행 중이면 "진행률 분석 중…"
 * - 분석 전이면 "아직 분석하지 않았다."
 */
export function getUnanalyzedStatusText(analyzing: boolean): string {
  return analyzing ? '진행률 분석 중…' : '아직 분석하지 않았다.';
}
