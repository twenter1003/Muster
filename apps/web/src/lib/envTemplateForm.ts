/** 폼 입력은 전부 문자열이다 — JSON 해석과 빈 칸 판정은 아래에서 한 번만 내린다. */
export interface EnvTemplateForm {
  name: string;
  stackPresetJson: string;
  dockerPresetJson: string;
}

export interface EnvTemplateBody {
  name: string;
  stack_preset: Record<string, unknown>;
  docker_preset?: Record<string, unknown>;
}

export type EnvTemplateBodyResult =
  { ok: true; body: EnvTemplateBody } | { ok: false; reason: string };

export const ENV_TEMPLATE_NAME_MAX = 200;

/**
 * 스택 프리셋 기본값. 빈 텍스트 영역을 주면 사용자는 "여기에 무슨 키를 적어야 하나"부터
 * 막힌다 — 서버 DTO는 객체라는 것 말고 아무 모양도 강제하지 않아서 화면 외에는 알려 줄
 * 곳이 없다. 키는 domain.ts의 readStack이 실제로 읽는 것들(language·framework·database·
 * services)로 골랐다. 목록에 스택이 그대로 찍히는 것도 이 키들일 때뿐이다.
 */
export const DEFAULT_STACK_PRESET = `{
  "language": "typescript",
  "framework": "nestjs",
  "database": "postgres",
  "services": ["redis"]
}`;

/**
 * JSON 텍스트 한 칸 → 객체.
 *
 * 배열·숫자·문자열·null까지 걸러 내는 이유: JSON.parse는 `[1,2]`도 `3`도 통과시키는데
 * 서버는 @IsObject로 막는다. 여기서 안 걸면 그 왕복이 "생성 실패"라는 한 줄로만 돌아온다.
 * typeof null === 'object'라 null 검사를 따로 둔다.
 */
function parsePreset(
  label: string,
  text: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, reason: `${label}이(가) 올바른 JSON이 아니다.` };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: `${label}은(는) 객체({...})여야 한다. 배열·숫자·문자열은 서버가 거부한다.`,
    };
  }

  return { ok: true, value: parsed as Record<string, unknown> };
}

/**
 * 폼 입력 → POST /env-templates 본문.
 *
 * 화면에서 떼어 낸 이유는 판단이 셋 들어 있어서다(이름 길이·JSON 해석·객체 여부).
 * 전부 서버가 400으로 막는 것들이지만, 400을 받아 보여 주면 어느 칸이 왜 틀렸는지는
 * 사용자가 되짚어야 한다.
 *
 * docker_preset은 비워 두면 키 자체를 뺀다. `{}`를 보내는 것과 안 보내는 것이 서버에서는
 * 같은 결과({}로 저장)지만, "도커는 매번 생성한다"는 뜻은 키를 빼야 본문에 남는다.
 */
export function buildEnvTemplateBody(form: EnvTemplateForm): EnvTemplateBodyResult {
  const name = form.name.trim();
  if (name.length === 0 || name.length > ENV_TEMPLATE_NAME_MAX) {
    return { ok: false, reason: `이름은 1~${ENV_TEMPLATE_NAME_MAX}자여야 한다.` };
  }

  const stack = parsePreset('스택 프리셋', form.stackPresetJson);
  if (!stack.ok) return stack;

  const body: EnvTemplateBody = { name, stack_preset: stack.value };

  const dockerText = form.dockerPresetJson.trim();
  if (dockerText.length > 0) {
    const docker = parsePreset('도커 프리셋', dockerText);
    if (!docker.ok) return docker;
    body.docker_preset = docker.value;
  }

  return { ok: true, body };
}
