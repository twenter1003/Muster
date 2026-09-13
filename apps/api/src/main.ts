import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

/**
 * 빌드된 프론트엔드가 놓이는 자리. Dockerfile이 여기로 복사한다.
 *
 * **왜 API가 정적 파일까지 서빙하는가.** 프론트를 다른 호스트에 두면 세션 쿠키가 교차
 * 사이트가 되어 SameSite=Lax로는 실려 가지 않고, CORS와 CSRF 방어를 새로 설계해야 한다.
 * 그 판단은 auth.guard.ts 주석에 이미 "단일 호스트 배포"를 전제로 적혀 있고, 개발 환경의
 * vite 프록시도 같은 경로 모양을 흉내 내려고 있는 것이다. 서비스를 둘로 나누면 Cloud Run
 * 인스턴스도 둘이 되어 무료 한도를 나눠 쓰게 된다.
 */
const WEB_ROOT = join(__dirname, '..', 'web');

async function bootstrap() {
  // rawBody: GitHub 웹훅 HMAC은 원문 바이트로 계산해야 한다. 파싱 후 다시 직렬화하면
  // 키 순서·공백 차이로 서명이 어긋난다 (Part 2 §6.3, ingest/github-signature.ts).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    rawBody: true,
  });

  // 통합설계서 Part 4 §1: Base URL은 /api/v1.
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  serveWebIfBuilt(app);

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Muster API listening on :${port} (prefix /api/v1)`);
}

/**
 * 정적 파일과 SPA 폴백.
 *
 * 빌드 결과가 없으면 아무것도 하지 않는다 — 로컬 개발에서는 vite가 5173에서 따로 돌고,
 * 그때 여기서 index.html을 찾다 실패하면 API가 뜨지 않는다.
 */
function serveWebIfBuilt(app: NestExpressApplication): void {
  const index = join(WEB_ROOT, 'index.html');
  if (!existsSync(index)) {
    new Logger('Bootstrap').log('빌드된 프론트엔드가 없어 정적 서빙을 건너뜁니다 (개발 모드).');
    return;
  }

  // index: false — 디렉터리 요청에 index.html을 자동으로 내주면 아래 폴백과 순서가 엉킨다.
  // maxAge: 해시가 붙은 자산(assets/*.js)은 내용이 바뀌면 이름이 바뀌므로 오래 캐시해도
  // 안전하다. index.html은 폴백이 직접 내주며 캐시하지 않는다 — 캐시되면 새 배포 뒤에도
  // 낡은 자산 이름을 가리킨 문서가 계속 나온다.
  app.useStaticAssets(WEB_ROOT, { index: false, maxAge: '1y', immutable: true });

  app.use((req: Request, res: Response, next: NextFunction) => {
    // API와 정적 자산은 건드리지 않는다. /api/v1로 시작하는 것은 없는 경로라도 API의
    // 404여야 한다 — 여기서 index.html을 내주면 클라이언트가 HTML을 JSON으로 파싱한다.
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    if (req.path.includes('.')) return next();

    // 나머지 GET은 전부 SPA의 경로다(/projects/:id, /invite/:token …).
    // 브라우저 주소창에 직접 치거나 새로고침해도 index.html이 나와야 라우터가 받는다.
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}

void bootstrap();
