import { buildPage, toPageRequest } from './paginate';
import { decodeCursor, encodeCursor } from './cursor';
import { ApiException } from '../errors/api.exception';
import { DEFAULT_PAGE_LIMIT } from './pagination.dto';

interface Row {
  id: string;
  created_at: string;
}

const row = (id: string, ts: string): Row => ({ id, created_at: ts });
const toCursor = (r: Row) => ({ ts: r.created_at, id: r.id });

describe('cursor', () => {
  it('인코딩한 커서를 그대로 복원한다', () => {
    const payload = { ts: '2026-09-07T00:00:00.000Z', id: 'abc' };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it('커서는 URL-safe base64라 인코딩 없이 쿼리스트링에 넣을 수 있다', () => {
    const cursor = encodeCursor({ ts: '2026-09-07T00:00:00.000Z', id: 'a/b+c' });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('망가진 커서는 INVALID_CURSOR로 400을 낸다', () => {
    expect(() => decodeCursor('!!!not-base64!!!')).toThrow(ApiException);
    try {
      decodeCursor('!!!not-base64!!!');
    } catch (e) {
      expect((e as ApiException).code).toBe('INVALID_CURSOR');
      expect((e as ApiException).getStatus()).toBe(400);
    }
  });

  it('형태는 맞지만 필드가 빠진 커서도 거부한다', () => {
    const bad = Buffer.from(JSON.stringify({ ts: '2026-09-07T00:00:00.000Z' })).toString(
      'base64url',
    );
    expect(() => decodeCursor(bad)).toThrow(ApiException);
  });
});

describe('toPageRequest', () => {
  it('limit 미지정 시 기본값 20을 쓴다', () => {
    expect(toPageRequest({}).limit).toBe(DEFAULT_PAGE_LIMIT);
  });

  it('cursor 미지정 시 after는 null이다', () => {
    expect(toPageRequest({}).after).toBeNull();
  });
});

describe('buildPage', () => {
  it('limit+1개가 오면 초과분을 잘라내고 next_cursor를 만든다', () => {
    const rows = [
      row('1', '2026-09-07T00:00:03.000Z'),
      row('2', '2026-09-07T00:00:02.000Z'),
      row('3', '2026-09-07T00:00:01.000Z'),
    ];
    const page = buildPage(rows, 2, toCursor);

    expect(page.items).toHaveLength(2);
    expect(page.items.map((r) => r.id)).toEqual(['1', '2']);
    expect(page.next_cursor).not.toBeNull();
    // 커서는 잘라내기 전이 아니라 반환된 마지막 행을 가리켜야 한다.
    expect(decodeCursor(page.next_cursor as string)).toEqual({
      ts: '2026-09-07T00:00:02.000Z',
      id: '2',
    });
  });

  it('마지막 페이지면 next_cursor는 null이다', () => {
    const page = buildPage([row('1', '2026-09-07T00:00:01.000Z')], 20, toCursor);
    expect(page.next_cursor).toBeNull();
  });

  it('결과가 없으면 빈 배열과 null을 반환한다', () => {
    expect(buildPage<Row>([], 20, toCursor)).toEqual({ items: [], next_cursor: null });
  });

  it('정확히 limit개면 다음 페이지가 없다고 본다', () => {
    const rows = [row('1', '2026-09-07T00:00:02.000Z'), row('2', '2026-09-07T00:00:01.000Z')];
    expect(buildPage(rows, 2, toCursor).next_cursor).toBeNull();
  });
});
