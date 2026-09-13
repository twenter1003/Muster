import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';

/**
 * 헬스체크.
 *
 * 배포에서 이 경로가 하는 일은 둘이다: Cloud Run이 "떴는가"를 묻고, 주간 깨우기 작업이
 * 무료 Supabase의 7일 정지를 막는다. 둘 다 **DB까지 닿아야** 뜻이 있다 —
 * 프로세스만 살아 있고 DB가 끊긴 상태에서 200이 나오면, 배포는 초록인데 모든 화면이
 * 500인 상태를 통과시키게 된다. 그게 배포 실패의 대부분이다.
 *
 * 마지막 테스트가 연결을 끊으므로 이 파일의 순서는 의미가 있다.
 */
describe('Phase 7 — 헬스체크 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    ds = app.get<DataSource>(DATA_SOURCE);
  }, 30_000);

  afterAll(async () => {
    // 아래 테스트가 이미 끊었을 수 있다. 그 경우 close가 던지므로 삼킨다.
    await app.close().catch(() => undefined);
  });

  it('인증 없이 열린다 — Cloud Run 프로브와 깨우기 작업에는 세션이 없다', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime_seconds).toBe('number');
  });

  it('내부 사정을 흘리지 않는다 — 인증 없이 열려 있는 경로다', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    // 버전·DB 이름·호스트 같은 것이 늘어나면 공개 경로에서 새는 것이 된다.
    expect(Object.keys(res.body).sort()).toEqual(['status', 'uptime_seconds']);
  });

  it('DB가 끊기면 200이 아니라 503이다 — 이게 이 경로의 존재 이유다', async () => {
    await ds.destroy();

    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(503);

    expect(res.body.error.code).toBe('INTERNAL');
    // 실패 사유에 호스트명·사용자명이 섞여 나가지 않아야 한다.
    expect(JSON.stringify(res.body)).not.toMatch(/postgres|password|@/i);
  });
});
