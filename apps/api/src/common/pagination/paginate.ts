import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { CursorPaginationQuery, DEFAULT_PAGE_LIMIT } from './pagination.dto';
import { CursorPayload, decodeCursor, encodeCursor } from './cursor';

/** 통합설계서 Part 4 §1: `{ items: [...], next_cursor: string | null }`. */
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

/**
 * 키셋 페이지네이션 쿼리의 공통부. 정렬·한 건 더 읽기·커서 조건·페이지 조립이 매번 같아서
 * 조회 엔드포인트마다 같은 12줄이 복사되고 있었다.
 *
 * `(정렬시각, id)` 튜플로 비교하는 것이 핵심이다 — 시각이 같은 행이 있어도 순서가 흔들리지
 * 않고, OFFSET과 달리 새 행이 삽입돼도 페이지가 밀리지 않는다.
 *
 * 호출부는 WHERE(프로젝트 스코프, 필터)까지만 세운 쿼리빌더를 넘긴다.
 */
export async function keysetPage<T extends ObjectLiteral & { id: string }>(
  qb: SelectQueryBuilder<T>,
  column: string,
  page: PageRequest,
  timestampOf: (row: T) => Date,
): Promise<Page<T>> {
  const alias = qb.alias;

  qb.orderBy(`${alias}.${column}`, 'DESC')
    .addOrderBy(`${alias}.id`, 'DESC')
    // 다음 페이지 유무를 별도 count 없이 판정하기 위해 하나 더 가져온다.
    .take(page.limit + 1);

  if (page.after) {
    qb.andWhere(`(${alias}.${column}, ${alias}.id) < (:__ts, :__id)`, {
      __ts: page.after.ts,
      __id: page.after.id,
    });
  }

  const rows = await qb.getMany();
  return buildPage(rows, page.limit, (row) => ({
    ts: timestampOf(row).toISOString(),
    id: row.id,
  }));
}
