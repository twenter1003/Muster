import { ConnectScriptController } from './agents.controller';

describe('ConnectScriptController', () => {
  let controller: ConnectScriptController;

  beforeEach(() => {
    controller = new ConnectScriptController();
  });

  it('GET /api/v1/connect.mjs — muster-connect 스크립트를 반환한다', () => {
    const script = controller.getScript();
    expect(script).toBeDefined();
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(1000);
    expect(script).toContain('muster-connect');
    expect(script).toContain('installGlobalHookScripts');
    expect(script).toContain('EMBEDDED_CLAUDE_HOOK');
    expect(script).toContain('EMBEDDED_ANTIGRAVITY_HOOK');
  });
});
