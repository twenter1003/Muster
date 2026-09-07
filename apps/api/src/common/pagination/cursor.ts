import { ApiException } from '../errors/api.exception';
import { ErrorCode } from '../errors/error-codes';

/**
 * 커서 페이로드. 키셋(keyset) 페이지네이션용으로 정렬 기준값과 tie-breaker(id)를 담는다.
 * OFFSET 방식은 레코드가 삽입되면 페이지가 밀리므로 쓰지 않는다.
 */
export interface CursorPayload {
  /** 정렬 기준 타임스탬프의 ISO 문자열 */
  ts: string;
  /** 동일 타임스탬프 레코드 간 순서를 고정하기 위한 tie-breaker */
  id: string;
}

/** 커서는 클라이언트가 해석하지 않는 불투명(opaque) 문자열이다. */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new ApiException(ErrorCode.INVALID_CURSOR, '커서 형식이 올바르지 않습니다.', 400);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as CursorPayload).ts !== 'string' ||
    typeof (parsed as CursorPayload).id !== 'string' ||
    Number.isNaN(Date.parse((parsed as CursorPayload).ts))
  ) {
    throw new ApiException(ErrorCode.INVALID_CURSOR, '커서 형식이 올바르지 않습니다.', 400);
  }

  return parsed as CursorPayload;
}
