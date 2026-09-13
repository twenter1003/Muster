/**
 * 실패한 환경 구성을 다시 돌리는 두 갈래.
 *
 * 실패 원인이 두 종류라 답도 둘이다. 바깥 사정(권한 부족·Actions 비활성·러너 장애)이면
 * 구성은 멀쩡하니 그 자리에서 **다시 실행**하는 것이 맞다. 설정 자체가 문제였다면
 * 같은 값을 채운 만들기 화면을 열어 **고쳐서 새로 만드는** 쪽이 맞다.
 *
 * 판단을 화면에서 떼어 낸 이유: 아래 두 규칙(어떤 상태에서 재실행이 되는가, 저장된
 * stack_config를 어떤 입력 방식으로 되읽는가)이 서버 계약과 어긋나면 조용히 틀린 폼이
 * 뜬다. DOM 없이 검증할 수 있는 곳에 둔다.
 */

/** 서버가 재실행을 받아 주는 상태. env-configs.service.ts의 requireStatus와 같아야 한다. */
export function canRerun(buildStatus: string): boolean {
  return buildStatus === 'failed';
}

export type InputMode = 'ui' | 'natural_language';

/** 만들기 화면의 폼 값 한 벌. */
export interface EnvConfigPrefill {
  mode: InputMode;
  language: string;
  framework: string;
  database: string;
  extras: string[];
  notes: string;
  templateId: string;
}

const EMPTY: EnvConfigPrefill = {
  mode: 'ui',
  language: '',
  framework: '',
  database: '',
  extras: [],
  notes: '',
  templateId: '',
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * 저장된 구성 → 만들기 화면의 폼 값.
 *
 * input_mode는 DB에 없다(구성 행에 컬럼이 없다). 대신 stack_config의 모양으로 되읽는다:
 * 자연어 입력은 `{ text }` 하나로 저장되고, UI 입력은 language·framework·database·
 * extra_services·notes만 넣으며 text를 절대 쓰지 않는다. 이 비대칭이 판별의 근거다 —
 * 만들기 화면이 본문을 만드는 곳(EnvConfigCreatePage)과 함께 봐야 하는 규칙이라
 * 여기 적어 둔다.
 */
export function prefillFromConfig(
  stackConfig: Record<string, unknown> | null | undefined,
  templateId: string | null | undefined,
): EnvConfigPrefill {
  const base = { ...EMPTY, templateId: templateId ?? '' };
  if (!stackConfig) return base;

  if (typeof stackConfig.text === 'string') {
    return { ...base, mode: 'natural_language', notes: stackConfig.text };
  }

  return {
    ...base,
    language: str(stackConfig.language),
    framework: str(stackConfig.framework),
    database: str(stackConfig.database),
    // 문자열이 아닌 원소는 버린다 — 폼의 칩은 문자열만 그릴 수 있고,
    // 여기서 통과시키면 화면이 [object Object]를 보여 준다.
    extras: Array.isArray(stackConfig.extra_services)
      ? stackConfig.extra_services.filter((v): v is string => typeof v === 'string')
      : [],
    notes: str(stackConfig.notes),
  };
}
