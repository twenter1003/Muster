/**
 * GitHub OAuth 토큰 한 벌.
 *
 * GitHub OAuth 앱은 "Expire user access tokens" 설정에 따라 두 가지 응답을 준다.
 * 꺼져 있으면 access_token만 오고 만료가 없다. 켜져 있으면 8시간짜리 access_token과
 * 6개월짜리 refresh_token이 함께 온다. 우리는 둘 다 받아들여야 한다 —
 * 만료를 끄는 운영 우회에 기대면, 누가 기본값(만료 켜짐)으로 앱을 새로 만드는 순간
 * 로그인 몇 시간 뒤부터 레포 연동이 조용히 실패한다.
 */
export interface GitHubTokenSet {
  accessToken: string;
  /** 만료가 꺼진 앱에서는 GitHub이 주지 않는다. */
  refreshToken: string | null;
  /** 액세스 토큰 만료 시각(epoch ms). 만료가 없으면 null. */
  expiresAt: number | null;
}

/** 만료 직전 토큰으로 요청을 보내 경합에서 지지 않도록 두는 여유. */
export const TOKEN_EXPIRY_SKEW_MS = 60_000;

/** 지금 이 토큰을 그대로 써도 되는가. 만료가 없는 토큰은 항상 유효하다. */
export function isExpired(tokens: GitHubTokenSet, now = Date.now()): boolean {
  return tokens.expiresAt !== null && tokens.expiresAt - TOKEN_EXPIRY_SKEW_MS <= now;
}

/** 시크릿 저장소에 넣을 문자열. 저장소 계약이 문자열 하나뿐이라 JSON으로 묶는다. */
export function serializeTokenSet(tokens: GitHubTokenSet): string {
  return JSON.stringify(tokens);
}

/**
 * 저장소에서 읽은 문자열을 토큰 한 벌로 되돌린다.
 *
 * JSON이 아니면 액세스 토큰 원문으로 취급한다. 이 기능 이전에 로그인한 사용자의
 * 시크릿이 그 형태로 남아 있고, 그들을 강제로 로그아웃시킬 이유는 없다.
 */
export function parseTokenSet(raw: string): GitHubTokenSet {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { accessToken: raw, refreshToken: null, expiresAt: null };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { accessToken: raw, refreshToken: null, expiresAt: null };
  }

  const obj = parsed as Partial<Record<keyof GitHubTokenSet, unknown>>;
  if (typeof obj.accessToken !== 'string') {
    return { accessToken: raw, refreshToken: null, expiresAt: null };
  }

  return {
    accessToken: obj.accessToken,
    refreshToken: typeof obj.refreshToken === 'string' ? obj.refreshToken : null,
    expiresAt: typeof obj.expiresAt === 'number' ? obj.expiresAt : null,
  };
}

/** GitHub 토큰 응답의 상대 수명(expires_in, 초)을 절대 시각으로 바꾼다. */
export function expiresAtFrom(expiresIn: unknown, now = Date.now()): number | null {
  // GitHub은 form 인코딩 호환을 위해 숫자를 문자열로 보낼 때가 있다.
  const seconds = typeof expiresIn === 'string' ? Number(expiresIn) : expiresIn;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  return now + seconds * 1000;
}
