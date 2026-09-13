import { describe, expect, it } from 'vitest';
import { isDeploymentSignal, leadTimeText, shortCommit } from './deploymentEvent';
import { EM_DASH } from './domain';

// 전역 주입을 켜지 않은 저장소라 describe/it/expect를 명시적으로 들여온다(api.spec.ts와 같다).

describe('shortCommit', () => {
  it('40자 해시를 7자로 줄인다', () => {
    expect(shortCommit('0123456789abcdef0123456789abcdef01234567')).toBe('0123456');
  });

  it('이미 짧은 해시는 그대로 둔다', () => {
    expect(shortCommit('abc12')).toBe('abc12');
  });

  it('빈 값은 —다', () => {
    expect(shortCommit('')).toBe(EM_DASH);
  });
});

describe('leadTimeText', () => {
  const occurred = '2026-09-12T12:00:00.000Z';

  it('커밋 시각이 없으면 0분이 아니라 —다', () => {
    expect(leadTimeText(null, occurred)).toBe(EM_DASH);
  });

  it('분 단위', () => {
    expect(leadTimeText('2026-09-12T11:23:00.000Z', occurred)).toBe('37분');
  });

  it('1분 미만은 0분으로 접지 않는다', () => {
    expect(leadTimeText('2026-09-12T11:59:40.000Z', occurred)).toBe('1분 미만');
  });

  it('시간 단위는 아래 단위까지만 붙인다', () => {
    expect(leadTimeText('2026-09-12T08:30:00.000Z', occurred)).toBe('3시간 30분');
    expect(leadTimeText('2026-09-12T09:00:00.000Z', occurred)).toBe('3시간');
  });

  it('일 단위는 시간까지만 붙인다', () => {
    expect(leadTimeText('2026-09-09T08:00:00.000Z', occurred)).toBe('3일 4시간');
    expect(leadTimeText('2026-09-09T12:00:00.000Z', occurred)).toBe('3일');
  });

  it('시계가 어긋나 음수가 나오면 —다', () => {
    expect(leadTimeText('2026-09-13T12:00:00.000Z', occurred)).toBe(EM_DASH);
  });

  it('파싱되지 않는 시각은 —다', () => {
    expect(leadTimeText('어제', occurred)).toBe(EM_DASH);
  });
});

describe('isDeploymentSignal', () => {
  it('실패만 신호다', () => {
    expect(isDeploymentSignal('failure')).toBe(true);
    expect(isDeploymentSignal('success')).toBe(false);
  });
});
