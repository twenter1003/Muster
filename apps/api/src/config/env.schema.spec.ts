import { validateEnv, validateEnvWithProcessEnv } from './env.schema';

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

  it('짧은 OAUTH_STATE_SECRET은 거부한다 (서명 키가 추측 가능하면 CSRF 방어가 무의미)', () => {
    expect(() => validateEnv({ OAUTH_STATE_SECRET: 'short' })).toThrow(/OAUTH_STATE_SECRET/);
  });

  it('process.env를 읽지 않는 순수 함수다', () => {
    process.env.PORT = '9999';
    try {
      expect(validateEnv({}).PORT).toBe(8080);
    } finally {
      delete process.env.PORT;
    }
  });
});

describe('validateEnvWithProcessEnv', () => {
  it('실제 환경변수가 .env 파일 값을 이긴다', () => {
    const saved = process.env.GITHUB_OAUTH_CLIENT_ID;
    process.env.GITHUB_OAUTH_CLIENT_ID = 'from-platform';
    try {
      // raw는 .env 파일에서 읽힌 빈 값을 흉내낸다.
      const env = validateEnvWithProcessEnv({ GITHUB_OAUTH_CLIENT_ID: '' });
      expect(env.GITHUB_OAUTH_CLIENT_ID).toBe('from-platform');
    } finally {
      if (saved === undefined) delete process.env.GITHUB_OAUTH_CLIENT_ID;
      else process.env.GITHUB_OAUTH_CLIENT_ID = saved;
    }
  });
});
