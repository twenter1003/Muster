import { CursorPaginationQuery, DEFAULT_PAGE_LIMIT } from './pagination.dto';
import { CursorPayload, decodeCursor, encodeCursor } from './cursor';

/** API 설계 1장: `{ items: [...], next_cursor: string | null }`. */
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface PageRequest {
  limit: number;
  after: CursorPayload | null;
}

export function toPageRequest(query: CursorPaginationQuery): PageRequest {
  return {
    limit: query.limit ?? DEFAULT_PAGE_LIMIT,
    after: query.cursor ? decodeCursor(query.cursor) : null,
  };
}

/**
 * limit + 1개를 조회해 넘겨주면, 초과분을 잘라내고 next_cursor를 만들어 준다.
 * 다음 페이지 유무를 별도 count 쿼리 없이 판정하기 위한 관용 패턴이다.
 */
export function buildPage<T>(
  rows: T[],
  limit: number,
  toCursor: (row: T) => CursorPayload,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  return {
    items,
    next_cursor: hasMore && last !== undefined ? encodeCursor(toCursor(last)) : null,
  };
}
