import { createHmac } from 'node:crypto';
import { isValidSignature } from './github-signature';

const SECRET = 'a'.repeat(64);
const BODY = Buffer.from('{"zen":"Keep it logically awesome."}', 'utf8');
const sign = (body: Buffer, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

/**
 * 이 함수가 웹훅 엔드포인트의 유일한 인증 수단이다 (@Public이라 전역 가드가 없다).
 * 통과시키면 안 되는 것을 통과시키는 순간 공개 쓰기 API가 된다.
 */
describe('GitHub 웹훅 서명 검증', () => {
  it('올바른 서명을 통과시킨다', () => {
    expect(isValidSignature(BODY, SECRET, sign(BODY))).toBe(true);
  });

  it('헤더가 없으면 거부한다', () => {
    expect(isValidSignature(BODY, SECRET, undefined)).toBe(false);
  });

  it('다른 시크릿으로 만든 서명을 거부한다', () => {
    expect(isValidSignature(BODY, SECRET, sign(BODY, 'b'.repeat(64)))).toBe(false);
  });

  it('본문이 한 바이트라도 바뀌면 거부한다', () => {
    const signature = sign(BODY);
    const tampered = Buffer.from('{"zen":"Keep it logically awesome!"}', 'utf8');
    expect(isValidSignature(tampered, SECRET, signature)).toBe(false);
  });

  it('sha256= 접두사가 없으면 거부한다', () => {
    const bare = sign(BODY).slice('sha256='.length);
    expect(isValidSignature(BODY, SECRET, bare)).toBe(false);
  });

  it('sha1 서명(구형 헤더 값)을 거부한다', () => {
    expect(isValidSignature(BODY, SECRET, 'sha1=0123456789abcdef')).toBe(false);
  });

  it('길이가 다른 서명에도 던지지 않고 false를 준다', () => {
    // timingSafeEqual은 길이가 다르면 예외를 던진다. 그대로 새면 500이 되고,
    // 500과 401의 차이는 그 자체로 정보다.
    expect(() => isValidSignature(BODY, SECRET, 'sha256=short')).not.toThrow();
    expect(isValidSignature(BODY, SECRET, 'sha256=short')).toBe(false);
  });

  it('JSON을 다시 직렬화한 본문으로는 검증되지 않는다 (원문 바이트를 써야 하는 이유)', () => {
    const spaced = Buffer.from(JSON.stringify(JSON.parse(BODY.toString()), null, 2), 'utf8');
    expect(isValidSignature(spaced, SECRET, sign(BODY))).toBe(false);
  });
});
