/**
 * 목록 조회 경로 조립.
 *
 * 네 화면(DocStore · EnvCatalog · AgentRegistry · 로그)이 전부 `?limit=&cursor=`에
 * 필터 하나를 얹은 같은 모양을 쓴다. 화면마다 손으로 이어 붙이면 두 가지가 어긋난다 —
 * 커서를 encodeURIComponent에 통과시키는 것을 한 곳에서 빠뜨리고(커서는 서버가 만든
 * 불투명 문자열이라 `+`나 `=`가 들어온다), 필터가 비었을 때 `type=`를 빈 값으로 보내
 * 서버의 `@IsIn` 검증에 400을 맞는다. 둘 다 화면이 아니라 여기서 한 번만 막는다.
 *
 * null·undefined·빈 문자열은 "거르지 않음"이라 아예 키를 내보내지 않는다.
 */
export function listPath(
  base: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    query.set(key, String(value));
  }
  const suffix = query.toString();
  return suffix === '' ? base : `${base}?${suffix}`;
}
