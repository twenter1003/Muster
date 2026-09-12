/**
 * 세션 토큰을 실어 나르는 쿠키의 이름·직렬화·파싱.
 *
 * cookie-parser를 넣지 않은 이유: 우리가 읽어야 하는 쿠키는 이 파일이 정의하는 **한 개**뿐이고,
 * 필요한 동작은 `;`로 자르고 첫 `=`에서 이름/값을 나눈 뒤 percent-decoding 하는 것이 전부다.
 * 미들웨어를 하나 더 얹으면 main.ts의 부팅 순서와 rawBody 설정에 얽히는 지점이 늘어나는데,
 * 그 대가로 얻는 게 30줄 남짓의 문자열 처리라 균형이 맞지 않는다. 파서를 순수 함수로 두면
 * 요청 객체 없이 테스트할 수도 있다.
 */

/** `__Host-` 접두사는 쓰지 않는다 — 그 접두사는 Secure를 강제하고, 개발은 HTTP다. */
export const SESSION_COOKIE_NAME = 'muster_session';

/**
 * `Cookie` 헤더에서 값 하나를 꺼낸다. 없으면 null.
 *
 * 같은 이름이 여러 번 오면 첫 번째를 쓴다. 브라우저는 더 좁은 Path의 쿠키를 앞에 보내므로,
 * 뒤엣것을 택하면 경로가 더 넓은(= 우리가 심지 않았을 수도 있는) 값을 집게 된다.
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;

    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw) || null;
    } catch {
      // 잘못 인코딩된 값(%ZZ 등)은 우리가 심은 쿠키가 아니다. 예외를 밖으로 던지면
      // 남이 심은 쓰레기 쿠키 하나 때문에 요청 전체가 500이 된다.
      return null;
    }
  }

  return null;
}

/** `Authorization: Bearer <token>`에서 토큰을 꺼낸다. 스킴이 다르면 null. */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim() || null;
}

/**
 * 요청 헤더에서 세션 토큰을 찾는다. 가드와 로그아웃이 **같은 규칙**으로 찾아야 한다 —
 * 한쪽만 쿠키를 보면 쿠키로 로그인한 사용자가 로그아웃해도 세션이 살아남는다.
 *
 * Bearer가 먼저인 이유는 auth.guard.ts의 주석 참조.
 */
export function sessionTokenFrom(headers: {
  authorization?: string;
  cookie?: string;
}): string | null {
  return (
    extractBearerToken(headers.authorization) ?? readCookie(headers.cookie, SESSION_COOKIE_NAME)
  );
}

/**
 * 로그인 성공 시 심을 `Set-Cookie` 값.
 *
 * SameSite=Lax인 이유: OAuth 콜백은 GitHub에서 우리 콜백 URL로 오는 **top-level 네비게이션**이라
 * Lax에서도 쿠키가 실린다. None으로 열면 모든 교차 사이트 요청에 쿠키가 따라붙어 CSRF 표면만
 * 넓어지고, Strict로 조이면 외부 링크를 타고 들어온 첫 요청에서 로그아웃처럼 보인다.
 *
 * Secure를 프로덕션에서만 붙이는 이유: 브라우저는 HTTP 응답이 심으려는 Secure 쿠키를 버린다.
 * 개발은 http://localhost라 Secure를 고정하면 로그인이 조용히 실패한다.
 */
export function sessionCookie(token: string, opts: { secure: boolean; maxAgeMs: number }): string {
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly', // JS에서 못 읽으므로 XSS가 토큰을 통째로 들고 나가지 못한다.
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${Math.floor(opts.maxAgeMs / 1000)}`,
  ];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}

/**
 * 로그아웃 시 쿠키를 지우는 `Set-Cookie` 값.
 *
 * 지우기는 "같은 이름·Path·SameSite로 Max-Age=0을 덮어쓰는 것"이다. 속성이 하나라도 어긋나면
 * 브라우저가 다른 쿠키로 보고 원본을 그대로 남겨 둔다.
 */
export function clearedSessionCookie(opts: { secure: boolean }): string {
  const attrs = [`${SESSION_COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}
