import { describe, expect, it } from 'vitest';
import { canRerun, prefillFromConfig } from './envConfigRetry';

describe('canRerun', () => {
  it('실패한 구성만 다시 실행할 수 있다', () => {
    expect(canRerun('failed')).toBe(true);
  });

  it('그 밖의 상태는 재실행 대상이 아니다 — 서버가 409를 낸다', () => {
    for (const s of ['generated', 'policy_passed', 'policy_blocked', 'approved', 'running']) {
      expect(canRerun(s)).toBe(false);
    }
  });

  it('succeeded도 아니다 — 다시 돌릴 이유가 없고, 성공 기록을 덮어쓰게 된다', () => {
    expect(canRerun('succeeded')).toBe(false);
  });
});

describe('prefillFromConfig', () => {
  it('UI 입력을 칸마다 되돌린다', () => {
    const r = prefillFromConfig(
      {
        language: 'python',
        framework: 'fastapi',
        database: 'postgres',
        extra_services: ['redis'],
        notes: '워커 하나',
      },
      null,
    );

    expect(r).toEqual({
      mode: 'ui',
      language: 'python',
      framework: 'fastapi',
      database: 'postgres',
      extras: ['redis'],
      notes: '워커 하나',
      templateId: '',
    });
  });

  /** text는 자연어 입력만 쓴다 — UI 입력은 같은 자리에 notes를 넣는다. */
  it('text가 있으면 자연어 입력으로 되읽는다', () => {
    const r = prefillFromConfig({ text: 'FastAPI에 postgres' }, null);

    expect(r.mode).toBe('natural_language');
    expect(r.notes).toBe('FastAPI에 postgres');
  });

  it('템플릿에서 파생된 구성은 템플릿 선택까지 되살린다', () => {
    expect(prefillFromConfig({ language: 'go' }, 'tpl-1').templateId).toBe('tpl-1');
  });

  it('빠진 칸은 빈 값이다 — 없는 값을 지어내지 않는다', () => {
    const r = prefillFromConfig({ language: 'go' }, null);

    expect(r).toEqual({ ...r, framework: '', database: '', extras: [], notes: '' });
  });

  it('구성이 없으면 빈 폼이다', () => {
    expect(prefillFromConfig(null, null).mode).toBe('ui');
    expect(prefillFromConfig(undefined, undefined).templateId).toBe('');
  });

  it('문자열이 아닌 값은 버린다 — 폼은 문자열만 그릴 수 있다', () => {
    const r = prefillFromConfig(
      { language: 42, extra_services: ['redis', 7, { a: 1 }], notes: null },
      null,
    );

    expect(r.language).toBe('');
    expect(r.extras).toEqual(['redis']);
    expect(r.notes).toBe('');
  });
});
