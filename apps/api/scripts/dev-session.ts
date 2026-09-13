/**
 * 개발용 세션 발급.
 *
 * 화면 훑기(scripts/smoke-ui.mjs)는 로그인한 상태가 필요한데, GitHub OAuth를 자동으로
 * 통과할 방법이 없다. 그래서 사용자와 세션을 직접 만들어 토큰만 찍는다. 실제 로그인 경로는
 * oauth.e2e-spec.ts가 따로 검증하므로, 여기서 그 경로를 흉내 낼 이유가 없다.
 *
 *   DATABASE_URL=... npx ts-node -r tsconfig-paths/register scripts/dev-session.ts
 *
 * 프로덕션에서 돌 일이 없도록 NODE_ENV=production이면 거부한다.
 */
import { NestFactory } from '@nestjs/core';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { User } from '../src/database/entities';
import { SessionService } from '../src/modules/auth/session.service';

const LOGIN = process.env.DEV_SESSION_LOGIN ?? 'smoketester';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('프로덕션에서는 쓸 수 없다 — 인증을 우회하는 도구다.');
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const users = app.get<DataSource>(DATA_SOURCE).getRepository(User);
    const user =
      (await users.findOneBy({ github_login: LOGIN })) ??
      (await users.save(users.create({ github_login: LOGIN, email: `${LOGIN}@example.invalid` })));

    const { token } = await app.get(SessionService).issue(user.id);
    // 스크립트가 받아 쓸 수 있게 토큰만 한 줄로 찍는다.
    console.log(token);
  } finally {
    await app.close();
  }
}

void main();
