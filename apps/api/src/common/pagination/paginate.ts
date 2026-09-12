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

/**
 * 여러 프로젝트를 가로지르는 목록의 한 페이지.
 *
 * `project_names`를 페이지에 딸려 보내는 이유: 이 조회들은 **요청자가 멤버인 프로젝트**로
 * 범위를 먼저 좁히는데(id→이름 조인 한 번), 그 결과 맵에 화면이 필요로 하는 프로젝트
 * 이름이 이미 다 들어 있다. 행마다 프로젝트를 다시 조인하거나 클라이언트가 프로젝트를
 * 따로 조회하는 것은 같은 데이터를 두 번 읽는 일이다.
 */
export interface ScopedPage<T> extends Page<T> {
  project_names: ReadonlyMap<string, string>;
}

/**
 * 스코프 질의가 이미 가져온 프로젝트 이름을 뷰에 붙인다.
 * 맵에 없을 수가 없다 — 행 자체가 그 맵의 프로젝트로 좁혀 뽑은 것이다. 그래도 단언(!) 대신
 * 빈 문자열로 떨어뜨린다. 이름 하나 때문에 목록 전체가 500이 되는 편이 더 나쁘다.
 */
export function withProjectName<V extends { project_id: string }>(
  view: V,
  names: ReadonlyMap<string, string>,
): V & { project_name: string } {
  return { ...view, project_name: names.get(view.project_id) ?? '' };
}
