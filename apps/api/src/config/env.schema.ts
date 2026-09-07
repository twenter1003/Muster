import { z } from 'zod';

/**
 * 부팅 시점에 환경변수를 검증한다. 누락된 설정 때문에 런타임에 실패하지 않도록,
 * 잘못된 값이면 서버가 아예 뜨지 않는다.
 *
 * 시크릿(GitHub 웹훅 시크릿, Claude API 키 등)은 통합설계서 Part 2 §6.2에 따라
 * GCP Secret Manager에서 주입되며 코드/DB에 평문으로 두지 않는다.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),

  DATABASE_URL: z.string().url().default('postgresql://agentops:agentops@localhost:5432/agentops'),

  /** GitHub OAuth 앱 자격증명. 없으면 로그인 엔드포인트가 503을 낸다. */
  GITHUB_OAUTH_CLIENT_ID: z.string().optional(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().optional(),

  /** OAuth state 서명 키. state는 CSRF 방어 수단이라 예측 가능하면 의미가 없다. */
  OAUTH_STATE_SECRET: z.string().min(16).default('dev-only-oauth-state-secret-change-me'),

  /** 콜백이 세션 토큰을 fragment로 붙여 되돌려보낼 프론트엔드 주소. */
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  /** GitHub에 넘길 redirect_uri를 만들 때 쓰는 이 API의 공개 주소. */
  API_BASE_URL: z.string().url().default('http://localhost:8080'),

  /** 로컬 시크릿 저장소 경로. 프로덕션에서는 Secret Manager 구현이 대체한다. */
  SECRETS_DIR: z.string().default('.secrets'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`환경변수 검증 실패:\n${details}`);
  }
  return result.data;
}

/**
 * ConfigModule에 넘길 검증기.
 *
 * 실제 환경변수가 .env 파일 값보다 우선하게 만든다. @nestjs/config는 .env 파일에서 읽은
 * 값을 먼저 넘기는데, 그러면 레포에 남은 빈 줄(예: `GITHUB_OAUTH_CLIENT_ID=`)이
 * 플랫폼이 주입한 진짜 값을 덮어쓴다. Cloud Run 배포에서 설정이 조용히 무시되는 경로다.
 *
 * validateEnv 자체는 process.env를 읽지 않는 순수 함수로 남겨 둔다.
 */
export function validateEnvWithProcessEnv(raw: Record<string, unknown>): Env {
  return validateEnv({ ...raw, ...process.env });
}
