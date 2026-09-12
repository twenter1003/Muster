import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: GitHub 웹훅 HMAC은 원문 바이트로 계산해야 한다. 파싱 후 다시 직렬화하면
  // 키 순서·공백 차이로 서명이 어긋난다 (Part 2 §6.3, ingest/github-signature.ts).
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });

  // 통합설계서 Part 4 §1: Base URL은 /api/v1.
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Muster API listening on :${port} (prefix /api/v1)`);
}

void bootstrap();
