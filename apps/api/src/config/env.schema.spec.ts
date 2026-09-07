import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('빈 환경에서도 개발용 기본값으로 채워진다', () => {
    const env = validateEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(8080);
  });

  it('PORT 문자열을 숫자로 강제 변환한다', () => {
    expect(validateEnv({ PORT: '3000' }).PORT).toBe(3000);
  });

  it('잘못된 DATABASE_URL이면 부팅을 막는다', () => {
    expect(() => validateEnv({ DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  });

  it('알 수 없는 NODE_ENV는 거부한다', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
