import { describe, expect, it } from 'vitest';
import { getAnalyzeButtonLabel, getUnanalyzedStatusText } from './goalsProgress';

describe('getAnalyzeButtonLabel', () => {
  it('분석 중일 때는 항상 "분석하는 중…"을 반환한다', () => {
    expect(getAnalyzeButtonLabel(true, false)).toBe('분석하는 중…');
    expect(getAnalyzeButtonLabel(true, true)).toBe('분석하는 중…');
  });

  it('분석 중이 아니고 기존 분석 결과가 있으면 "다시 분석"을 반환한다', () => {
    expect(getAnalyzeButtonLabel(false, true)).toBe('다시 분석');
  });

  it('분석 중이 아니고 기존 분석 결과가 없으면 "분석하기"를 반환한다', () => {
    expect(getAnalyzeButtonLabel(false, false)).toBe('분석하기');
  });
});

describe('getUnanalyzedStatusText', () => {
  it('분석 중이면 "진행률 분석 중…"을 반환한다', () => {
    expect(getUnanalyzedStatusText(true)).toBe('진행률 분석 중…');
  });

  it('분석 중이 아니면 "아직 분석하지 않았다."를 반환한다', () => {
    expect(getUnanalyzedStatusText(false)).toBe('아직 분석하지 않았다.');
  });
});
