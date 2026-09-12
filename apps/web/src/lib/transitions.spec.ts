import { describe, expect, it } from 'vitest';
import { SYSTEM_ACTOR, actorLabel } from './transitions';

// 전역 주입을 켜지 않은 저장소라 describe/it/expect를 명시적으로 들여온다(api.spec.ts와 같다).
describe('actorLabel', () => {
  it('사람의 전이는 github_login을 그대로 쓴다', () => {
    expect(actorLabel('twenter1003')).toBe('twenter1003');
  });

  it('기계 전이(null)는 빈칸이 아니라 시스템이다', () => {
    expect(actorLabel(null)).toBe(SYSTEM_ACTOR);
  });

  it('공백만 있는 값도 사람 이름으로 치지 않는다', () => {
    expect(actorLabel('   ')).toBe(SYSTEM_ACTOR);
  });

  it('앞뒤 공백은 털어낸다 — 표기가 줄마다 흔들리면 대조가 어렵다', () => {
    expect(actorLabel(' twenter1003 ')).toBe('twenter1003');
  });
});
