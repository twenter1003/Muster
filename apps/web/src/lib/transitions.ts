/**
 * 환경 구성 상태 전이 이력(GET /env-configs/:id/transitions).
 *
 * 왜 화면이 아니라 여기인가: 같은 이력을 환경 구성 생성 화면과 프로젝트 개요가 함께 쓴다.
 * 행위자 표기 규칙이 두 화면에서 갈리면 "누가 승인했는가"가 화면마다 다르게 읽히는데,
 * 그것은 감사 기록으로서 치명적이다. 타입과 표기 규칙을 한 곳에만 둔다.
 */

/** env-catalog 컨트롤러의 전이 응답 그대로다. 추측한 필드는 없다. */
export interface TransitionView {
  id: string;
  from_status: string | null;
  to_status: string;
  actor: string | null;
  reason: string | null;
  created_at: string;
}

/** 기계 전이(Policy Gate의 자동 판정)를 가리키는 표기. */
export const SYSTEM_ACTOR = '시스템';

/**
 * 행위자 표기.
 *
 * actor가 null인 것은 "모른다"가 아니라 "사람이 아니다"다 — Policy Gate의 자동 pass/block은
 * 누구의 결정도 아니다. 그래서 빈칸으로 두지 않고(빈칸은 데이터가 빠진 것으로 읽힌다)
 * EM_DASH("측정 불가")로도 두지 않는다. 둘 다 기계의 판정을 사람의 판정처럼 보이게 하거나,
 * 기록이 누락된 것처럼 보이게 한다.
 */
export function actorLabel(actor: string | null): string {
  const trimmed = actor?.trim() ?? '';
  return trimmed === '' ? SYSTEM_ACTOR : trimmed;
}
