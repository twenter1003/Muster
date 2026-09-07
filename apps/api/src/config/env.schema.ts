import { z } from 'zod';

/**
 * 부팅 시점에 환경변수를 검증한다. 누락된 설정 때문에 런타임에 실패하지 않도록,
 * 잘못된 값이면 서버가 아예 뜨지 않는다.
 *
 * 시크릿(GitHub 웹훅 시크릿, Claude API 키 등)은 TechSpec 6.2에 따라
 * GCP Secret Manager에서 주입되며 코드/DB에 평문으로 두지 않는다.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),

  DATABASE_URL: z.string().url().default('postgresql://agentops:agentops@localhost:5432/agentops'),

  /** Phase 3에서 사용. Secret Manager 주입 전까지는 로컬 .env로만 채운다. */
  GITHUB_OAUTH_CLIENT_ID: z.string().optional(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().optional(),
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
