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

  DATABASE_URL: z.string().url().default('postgresql://muster:muster@localhost:5432/muster'),

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

  /**
   * 문서 원본을 담을 GCS 버킷과 프로젝트 (설계서 Part 2 §4.1).
   * 비어 있으면 DocStore가 503을 낸다 — 자격증명 없이 뜨는 것 자체는 막지 않는다.
   * 나머지 기능은 GCS 없이도 동작해야 하기 때문이다.
   */
  GCS_BUCKET: z.string().optional(),
  GCP_PROJECT_ID: z.string().optional(),

  /**
   * signed URL 서명에 쓸 서비스 계정 이메일.
   * Cloud Run에서는 메타데이터 서버가 알려주므로 비워 둔다. 로컬은 사용자 ADC를 쓰는데
   * 거기엔 서명 주체 정보가 없어, 이 계정을 가장해 서명한다.
   */
  GCS_SIGNER_SERVICE_ACCOUNT: z.string().optional(),

  /**
   * LLM. Vertex AI로 Gemini를 부르므로 API 키가 없다 — 인증은 GCS와 같은 ADC를 쓴다.
   * 프로젝트는 GCP_PROJECT_ID를 그대로 쓰고, 없으면 환경 구성 생성만 503을 낸다.
   * 벤더 근거는 DESIGN_DRIFT.md 4번, Vertex 전환 근거는 8번.
   */
  VERTEX_LOCATION: z.string().default('us-central1'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
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
