import { describe, expect, it } from 'vitest';
import { relativeTime } from './InboxPage';

// 전역 주입을 켜지 않은 저장소라 describe/it/expect를 명시적으로 들여온다(api.spec.ts와 같다).
describe('relativeTime', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');

  it('1분 미만은 "방금"으로 접는다', () => {
    expect(relativeTime('2026-09-12T11:59:30.000Z', now)).toBe('방금');
  });

  it('분·시간·일 경계에서 단위를 바꾼다', () => {
    expect(relativeTime('2026-09-12T11:59:00.000Z', now)).toBe('1분 전');
    expect(relativeTime('2026-09-12T11:00:00.000Z', now)).toBe('1시간 전');
    expect(relativeTime('2026-09-11T12:00:00.000Z', now)).toBe('1일 전');
  });

  it('미래 시각(시계 어긋남)은 "-3분 전"이 아니라 "방금"이다', () => {
    expect(relativeTime('2026-09-12T12:03:00.000Z', now)).toBe('방금');
  });

  it('해석할 수 없는 값은 0이 아니라 —다', () => {
    expect(relativeTime('not-a-date', now)).toBe('—');
  });
});
