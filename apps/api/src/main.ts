import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // API 설계 1장: Base URL은 /api/v1.
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
  new Logger('Bootstrap').log(`AgentOps API listening on :${port} (prefix /api/v1)`);
}

void bootstrap();
