import type { AgentRunStatus } from './domain';

/** 정정 대상 실행의 현재 값. 화면의 RunView 중 고칠 수 있는 세 칸만 본다. */
export interface CorrectableRun {
  status: string;
  tokens_used: number;
  /** NUMERIC이라 서버가 문자열로 준다. 숫자로 바꾸지 않는다 — 아래 주석 참조. */
  cost: string;
}

/** 폼 입력은 전부 문자열이다. 빈 칸과 0의 구분은 여기서 한 번만 내린다. */
export interface RunForm {
  status: AgentRunStatus;
  tokensUsed: string;
  cost: string;
}

export interface RunPatch {
  status?: AgentRunStatus;
  tokens_used?: number;
  cost?: string;
}

export type RunPatchResult = { ok: true; body: RunPatch } | { ok: false; reason: string };

/**
 * 폼 입력 → `PATCH /agent-runs/:id` 본문.
 *
 * 이 화면이 필요한 이유부터: 실행을 **끝내는** 어댑터가 아직 없어(기술 사양서 9장 미해결)
 * 시작한 실행은 running에 머문다. 사람이 결과를 적어 넣는 것이 유일한 종료 경로이고,
 * 그 값이 그대로 예산 사용량과 DORA 입력이 된다. 그래서 형식을 여기서 엄격히 잡는다.
 *
 * **cost를 문자열로 유지한다.** 서버가 numeric으로 저장하고 문자열로 주고받는 이유와 같다 —
 * 부동소수점으로 금액을 다루면 반올림 오차가 쌓여 예산 임계치 판정이 어긋난다. 화면에서
 * Number로 바꿨다가 문자열로 되돌리면 그 오차를 우리가 만들어 넣는 셈이다.
 */
export function buildRunPatch(current: CorrectableRun, form: RunForm): RunPatchResult {
  const body: RunPatch = {};

  if (form.status !== current.status) body.status = form.status;

  const tokens = form.tokensUsed.trim();
  if (tokens.length > 0) {
    // 서버는 정수만 받는다(@IsInt @Min(0)). "1.5"나 "-1"을 보내면 400이고, 그때는
    // "정정 실패"로만 읽혀 어느 칸이 문제인지 사용자가 되짚어야 한다.
    if (!/^\d+$/.test(tokens)) return { ok: false, reason: '토큰은 0 이상의 정수여야 한다.' };
    const value = Number(tokens);
    if (!Number.isSafeInteger(value)) return { ok: false, reason: '토큰 값이 너무 크다.' };
    if (value !== current.tokens_used) body.tokens_used = value;
  }

  const cost = form.cost.trim();
  if (cost.length > 0) {
    // 서버는 @IsNumberString이다. 통화 기호나 쉼표가 섞이면 거부한다.
    if (!/^\d+(\.\d+)?$/.test(cost))
      return { ok: false, reason: '비용은 숫자여야 한다 (예: 1.25).' };
    // 문자열 비교는 "1.50"과 "1.5"를 다르다고 본다. 값으로 견주되 보내는 것은 입력 원문이다.
    if (Number(cost) !== Number(current.cost)) body.cost = cost;
  }

  if (Object.keys(body).length === 0) return { ok: false, reason: '바뀐 것이 없다.' };
  return { ok: true, body };
}
