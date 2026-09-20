export interface HookVersionRun {
  agent_name: string;
  hook_version?: number | null;
}

/**
 * 가장 최근 실행이 보고한 훅 버전이 서버가 아는 최신 버전보다 낮거나(또는 아예 안
 * 보내면) "이 머신의 훅이 오래됨" 배너를 띄우기 위해 대상 실행을 돌려준다.
 *
 * hook_version이 없는(null/undefined) "가장 최근" 실행은 컬럼 도입 이전의 과거 기록이
 * 아니라 지금도 버전 정보를 안 보내는 구버전 훅이 여전히 돌고 있다는 뜻이라 낡은
 * 것으로 본다 — 오늘 실제로 겪은 사고(코드는 고쳐졌는데 설치된 훅만 218줄 뒤처져
 * model·토큰 필드를 아예 안 보내던 것)를 다음에는 화면에서 바로 잡아내기 위함이다.
 */
export function findOutdatedHookRun<T extends HookVersionRun>(
  recentRuns: T[] | undefined,
  latestHookVersion: number | undefined,
): T | null {
  if (latestHookVersion === undefined) return null;
  const latestRun = recentRuns?.[0];
  if (!latestRun) return null;
  if (latestRun.hook_version != null && latestRun.hook_version >= latestHookVersion) return null;
  return latestRun;
}
