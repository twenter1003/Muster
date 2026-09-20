import { describe, expect, it } from 'vitest';
import { findOutdatedHookRun } from './hookVersion';

describe('findOutdatedHookRun', () => {
  it('가장 최근 실행의 hook_version이 최신보다 낮으면 그 실행을 돌려준다', () => {
    const runs = [{ agent_name: 'claude-code', hook_version: 1 }];
    expect(findOutdatedHookRun(runs, 2)).toEqual(runs[0]);
  });

  it('hook_version이 아예 없으면(구버전 훅이 여전히 도는 중) 낡은 것으로 본다', () => {
    const runs = [{ agent_name: 'claude-code', hook_version: null }];
    expect(findOutdatedHookRun(runs, 1)).toEqual(runs[0]);

    const runsUndefined = [{ agent_name: 'claude-code' }];
    expect(findOutdatedHookRun(runsUndefined, 1)).toEqual(runsUndefined[0]);
  });

  it('가장 최근 실행이 최신 버전과 같거나 높으면 null이다', () => {
    const runs = [{ agent_name: 'claude-code', hook_version: 2 }];
    expect(findOutdatedHookRun(runs, 2)).toBeNull();
    expect(findOutdatedHookRun(runs, 1)).toBeNull();
  });

  it('서버가 최신 버전 자체를 안 보내면(구버전 API) 판단하지 않는다', () => {
    const runs = [{ agent_name: 'claude-code', hook_version: null }];
    expect(findOutdatedHookRun(runs, undefined)).toBeNull();
  });

  it('최근 실행이 없으면 null이다', () => {
    expect(findOutdatedHookRun([], 1)).toBeNull();
    expect(findOutdatedHookRun(undefined, 1)).toBeNull();
  });
});
