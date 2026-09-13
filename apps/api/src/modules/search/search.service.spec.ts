import { ESCAPE_CHAR, escapeLike } from './search.service';

/**
 * LIKE 패턴 이스케이프.
 *
 * 여기가 새면 사용자가 친 한 글자가 "전부"를 뜻하게 되어, 자기가 속한 모든 프로젝트의
 * 문서 제목이 쏟아진다. 질의 자체는 파라미터 바인딩이라 주입 위험은 없지만, **의미가
 * 바뀌는 것**은 바인딩이 막아 주지 않는다.
 */
describe('escapeLike', () => {
  it('평범한 검색어는 그대로 둔다', () => {
    expect(escapeLike('kiosk-pos')).toBe('kiosk-pos');
    expect(escapeLike('설계서 v2.1')).toBe('설계서 v2.1');
  });

  it('%는 리터럴이 된다 — 이게 없으면 한 글자로 전부가 걸린다', () => {
    expect(escapeLike('%')).toBe(`${ESCAPE_CHAR}%`);
    expect(escapeLike('50%off')).toBe(`50${ESCAPE_CHAR}%off`);
  });

  it('_는 리터럴이 된다 — 임의의 한 글자로 읽히면 안 된다', () => {
    expect(escapeLike('api_key')).toBe(`api${ESCAPE_CHAR}_key`);
  });

  it('이스케이프 문자 자신이 먼저 치환된다', () => {
    // 순서가 틀리면 뒤에 넣은 백슬래시를 다시 이스케이프해 패턴이 망가진다.
    expect(escapeLike(ESCAPE_CHAR)).toBe(ESCAPE_CHAR + ESCAPE_CHAR);
    expect(escapeLike(`${ESCAPE_CHAR}%`)).toBe(`${ESCAPE_CHAR}${ESCAPE_CHAR}${ESCAPE_CHAR}%`);
  });

  it('여러 개가 섞여도 전부 처리된다', () => {
    expect(escapeLike('%_%')).toBe(`${ESCAPE_CHAR}%${ESCAPE_CHAR}_${ESCAPE_CHAR}%`);
  });
});
