import { describe, expect, it } from 'vitest';
import { buildRunPatch, type CorrectableRun } from './runCorrection';

const current: CorrectableRun = { status: 'running', tokens_used: 100, cost: '1.5000' };

describe('buildRunPatch', () => {
  it('바뀐 칸만 싣는다', () => {
    const r = buildRunPatch(current, { status: 'succeeded', tokensUsed: '100', cost: '1.5' });

    expect(r).toEqual({ ok: true, body: { status: 'succeeded' } });
  });

  it('cost를 문자열 그대로 보낸다', () => {
    // 금액을 Number로 바꿨다 되돌리면 반올림 오차를 우리가 만들어 넣는 셈이 된다.
    const r = buildRunPatch(current, { status: 'running', tokensUsed: '', cost: '2.7500' });

    expect(r).toEqual({ ok: true, body: { cost: '2.7500' } });
  });

  it('"1.50"과 "1.5"는 같은 값으로 보고 보내지 않는다', () => {
    // 서버가 numeric(12,4)로 돌려주므로 표기만 다른 같은 값이 흔하다.
    const r = buildRunPatch(current, { status: 'running', tokensUsed: '', cost: '1.50' });

    expect(r).toEqual({ ok: false, reason: '바뀐 것이 없다.' });
  });

  it('빈 칸은 "안 고침"이다', () => {
    const r = buildRunPatch(current, { status: 'running', tokensUsed: '', cost: '' });

    expect(r).toEqual({ ok: false, reason: '바뀐 것이 없다.' });
  });

  it('정수가 아닌 토큰을 요청 전에 막는다', () => {
    for (const bad of ['1.5', '-1', '1e3', 'abc']) {
      expect(buildRunPatch(current, { status: 'running', tokensUsed: bad, cost: '' }).ok).toBe(
        false,
      );
    }
  });

  it('숫자가 아닌 비용을 요청 전에 막는다', () => {
    for (const bad of ['$1.25', '1,250', 'abc', '-2']) {
      expect(buildRunPatch(current, { status: 'running', tokensUsed: '', cost: bad }).ok).toBe(
        false,
      );
    }
  });

  it('토큰 0을 정상 값으로 받는다', () => {
    // 빈 칸("안 고침")과 0("정말 0")을 가르는 것이 이 함수의 일이다.
    const r = buildRunPatch(current, { status: 'running', tokensUsed: '0', cost: '' });

    expect(r).toEqual({ ok: true, body: { tokens_used: 0 } });
  });
});
