import {
  SESSION_COOKIE_NAME,
  clearedSessionCookie,
  readCookie,
  sessionCookie,
  sessionTokenFrom,
} from './session-cookie';

describe('readCookie', () => {
  it('여러 쿠키 중 이름이 맞는 것만 꺼낸다', () => {
    const header = `theme=dark; ${SESSION_COOKIE_NAME}=abc123; other=x`;
    expect(readCookie(header, SESSION_COOKIE_NAME)).toBe('abc123');
  });

  it('이름 앞뒤 공백에 영향받지 않는다', () => {
    expect(readCookie(`  ${SESSION_COOKIE_NAME} = abc123 `, SESSION_COOKIE_NAME)).toBe('abc123');
  });

  it('percent-encoding을 되돌린다', () => {
    // 토큰은 base64url이라 인코딩될 문자가 없지만, 심을 때 encodeURIComponent를 쓰므로
    // 읽는 쪽도 대칭이어야 한다.
    expect(readCookie(`${SESSION_COOKIE_NAME}=a%2Fb`, SESSION_COOKIE_NAME)).toBe('a/b');
  });

  it('이름은 접두사가 겹쳐도 정확히 일치해야 한다', () => {
    expect(readCookie(`${SESSION_COOKIE_NAME}_old=abc`, SESSION_COOKIE_NAME)).toBeNull();
  });

  it('깨진 인코딩은 예외 대신 null이다', () => {
    expect(readCookie(`${SESSION_COOKIE_NAME}=%ZZ`, SESSION_COOKIE_NAME)).toBeNull();
  });

  it('헤더가 없으면 null', () => {
    expect(readCookie(undefined, SESSION_COOKIE_NAME)).toBeNull();
  });
});

describe('sessionCookie', () => {
  it('HttpOnly·SameSite=Lax·Path=/를 항상 붙인다', () => {
    const value = sessionCookie('tok', { secure: false, maxAgeMs: 60_000 });
    expect(value).toContain('HttpOnly');
    expect(value).toContain('SameSite=Lax');
    expect(value).toContain('Path=/');
    expect(value).toContain('Max-Age=60');
  });

  it('개발(비프로덕션)에서는 Secure를 붙이지 않는다 — 붙이면 HTTP에서 저장되지 않는다', () => {
    expect(sessionCookie('tok', { secure: false, maxAgeMs: 60_000 })).not.toContain('Secure');
  });

  it('프로덕션에서는 Secure를 붙인다', () => {
    expect(sessionCookie('tok', { secure: true, maxAgeMs: 60_000 })).toContain('Secure');
  });

  it('심은 쿠키를 그대로 다시 읽을 수 있다', () => {
    const setCookie = sessionCookie('a/b+c', { secure: false, maxAgeMs: 60_000 });
    const header = setCookie.split(';')[0];
    expect(readCookie(header, SESSION_COOKIE_NAME)).toBe('a/b+c');
  });
});

describe('clearedSessionCookie', () => {
  it('Max-Age=0과 빈 값으로 덮어쓴다', () => {
    const value = clearedSessionCookie({ secure: false });
    expect(value).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(value).toContain('Max-Age=0');
  });

  it('Path·SameSite가 심을 때와 같다 — 다르면 브라우저가 원본을 지우지 않는다', () => {
    const cleared = clearedSessionCookie({ secure: true });
    const set = sessionCookie('tok', { secure: true, maxAgeMs: 1000 });
    for (const attr of ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Secure']) {
      expect(cleared).toContain(attr);
      expect(set).toContain(attr);
    }
  });
});

describe('sessionTokenFrom', () => {
  it('Bearer 헤더에서 꺼낸다', () => {
    expect(sessionTokenFrom({ authorization: 'Bearer tok' })).toBe('tok');
  });

  it('헤더가 없으면 쿠키에서 꺼낸다', () => {
    expect(sessionTokenFrom({ cookie: `${SESSION_COOKIE_NAME}=tok` })).toBe('tok');
  });

  it('둘 다 있으면 Bearer가 이긴다', () => {
    expect(
      sessionTokenFrom({
        authorization: 'Bearer from-header',
        cookie: `${SESSION_COOKIE_NAME}=from-cookie`,
      }),
    ).toBe('from-header');
  });

  it('Bearer가 아닌 스킴이면 쿠키로 넘어간다', () => {
    expect(
      sessionTokenFrom({ authorization: 'Basic x', cookie: `${SESSION_COOKIE_NAME}=tok` }),
    ).toBe('tok');
  });

  it('아무것도 없으면 null', () => {
    expect(sessionTokenFrom({})).toBeNull();
  });
});
