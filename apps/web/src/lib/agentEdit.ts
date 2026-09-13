/** 수정 폼이 다루는 에이전트의 현재 값. 상세 응답(GET /agents/:id) 중 폼이 건드리는 두 칸만 본다. */
export interface EditableAgent {
  name: string;
  config_md: string;
}

/** 폼 입력은 전부 문자열이다. */
export interface AgentForm {
  name: string;
  configMd: string;
}

export interface AgentPatch {
  name?: string;
  config_md?: string;
}

export type AgentPatchResult = { ok: true; body: AgentPatch } | { ok: false; reason: string };

/** 서버 UpdateAgentDto와 같은 규칙. 어긋나면 400이 나므로 여기서 먼저 막는다. */
export const AGENT_NAME_MAX = 200;
export const AGENT_CONFIG_MAX = 200_000;

/**
 * 폼 입력 → PATCH 본문.
 *
 * 판단이 셋 들어 있어 화면에서 떼어 냈다. DOM 없이 검증할 수 있는 곳에 두는 편이,
 * 이 규칙들이 조용히 어긋나는 것보다 낫다.
 *
 * 1. 바뀐 칸만 싣는다. PATCH는 부분 수정이고, 안 바뀐 값을 같이 보내면 그 사이 남이 고친
 *    것을 덮어쓴다(EditProjectDialog와 같은 이유). 특히 config_md는 남이 고친 흔적이
 *    통째로 날아가는 칸이라, 손대지 않았으면 아예 실리지 않아야 한다.
 * 2. 이름만 trim한다. config_md는 마크다운 전문이고 들여쓰기·끝줄이 뜻을 가지는 문법이라
 *    (코드 블록, 목록 이어쓰기) 화면이 임의로 깎으면 사용자가 쓴 것과 저장된 것이 달라진다.
 * 3. config_md는 비울 수 있다. 서버가 0자를 허용하므로 ""도 정상적인 수정이며,
 *    "안 고침"과 구분해야 하니 이전 값이 비어 있지 않았을 때만 빈 문자열을 싣는다.
 */
export function buildAgentPatch(current: EditableAgent, form: AgentForm): AgentPatchResult {
  const name = form.name.trim();
  if (name.length === 0 || name.length > AGENT_NAME_MAX) {
    return { ok: false, reason: `이름은 1~${AGENT_NAME_MAX}자여야 한다.` };
  }

  if (form.configMd.length > AGENT_CONFIG_MAX) {
    return { ok: false, reason: `설정은 ${AGENT_CONFIG_MAX.toLocaleString()}자를 넘을 수 없다.` };
  }

  const body: AgentPatch = {};
  if (name !== current.name) body.name = name;
  if (form.configMd !== current.config_md) body.config_md = form.configMd;

  if (Object.keys(body).length === 0) return { ok: false, reason: '바뀐 것이 없다.' };
  return { ok: true, body };
}
