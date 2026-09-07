/**
 * 통합설계서 Part 4 §1: 에러 포맷 `{ error: { code, message } }`.
 * code 값 집합은 설계 문서에 정의되어 있지 않아 여기서 확정한다.
 * 새 코드를 추가할 때는 반드시 이 목록에 등록한다.
 */
export const ErrorCode = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CONFLICT: 'CONFLICT',
  /** Policy Gate 미통과 구성에 대한 승인 시도 (통합설계서 Part 4 §5.2: 409) */
  POLICY_NOT_PASSED: 'POLICY_NOT_PASSED',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  INVALID_CURSOR: 'INVALID_CURSOR',
  WEBHOOK_SIGNATURE_INVALID: 'WEBHOOK_SIGNATURE_INVALID',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
