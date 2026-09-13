import { describe, expect, it } from 'vitest';
import { AGENT_CONFIG_MAX, AGENT_NAME_MAX, buildAgentPatch, type EditableAgent } from './agentEdit';

const current: EditableAgent = { name: '리뷰어', config_md: '# 역할\n리뷰한다.\n' };

describe('buildAgentPatch', () => {
  it('바뀐 칸만 싣는다', () => {
    const r = buildAgentPatch(current, { name: '리뷰어 v2', configMd: current.config_md });

    expect(r).toEqual({ ok: true, body: { name: '리뷰어 v2' } });
  });

  it('설정만 고치면 이름을 함께 보내지 않는다', () => {
    // 이름을 같이 보내면 그 사이 남이 바꾼 이름을 덮어쓴다.
    const r = buildAgentPatch(current, { name: '리뷰어', configMd: '# 역할\n다시 쓴다.\n' });

    expect(r).toEqual({ ok: true, body: { config_md: '# 역할\n다시 쓴다.\n' } });
  });

  it('설정을 비우면 빈 문자열을 명시해 보낸다', () => {
    const r = buildAgentPatch(current, { name: '리뷰어', configMd: '' });

    expect(r).toEqual({ ok: true, body: { config_md: '' } });
  });

  it('이미 비어 있는 설정은 다시 보내지 않는다', () => {
    const r = buildAgentPatch({ name: '리뷰어', config_md: '' }, { name: '리뷰어', configMd: '' });

    expect(r).toEqual({ ok: false, reason: '바뀐 것이 없다.' });
  });

  it('이름 앞뒤 공백은 버리고 보낸다', () => {
    const r = buildAgentPatch(current, { name: '  새 이름 ', configMd: current.config_md });

    expect(r).toEqual({ ok: true, body: { name: '새 이름' } });
  });

  it('공백만 남은 이름은 거절한다', () => {
    const r = buildAgentPatch(current, { name: '   ', configMd: current.config_md });

    expect(r).toEqual({ ok: false, reason: `이름은 1~${AGENT_NAME_MAX}자여야 한다.` });
  });

  it('설정의 들여쓰기·끝줄은 깎지 않는다', () => {
    // 마크다운은 공백이 문법이다. 화면이 임의로 깎으면 쓴 것과 저장된 것이 달라진다.
    const r = buildAgentPatch(current, { name: '리뷰어', configMd: '  들여쓴 줄\n\n' });

    expect(r).toEqual({ ok: true, body: { config_md: '  들여쓴 줄\n\n' } });
  });

  it('상한을 넘는 설정은 요청 전에 막는다', () => {
    const r = buildAgentPatch(current, {
      name: '리뷰어',
      configMd: 'x'.repeat(AGENT_CONFIG_MAX + 1),
    });

    expect(r.ok).toBe(false);
  });
});
