import {
  Controller,
  Get,
  INestApplication,
  Inject,
  Injectable,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CurrentUser } from '../src/common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../src/common/auth/authenticated-user';
import { DATA_SOURCE } from '../src/database/database.module';
import { InjectRepository } from '../src/database/inject-repository.decorator';
import { Project } from '../src/database/entities';
import type { DataSource, Repository } from 'typeorm';

/**
 * 전역 가드가 "기본 차단"인지 검증하려면 매칭되는 라우트가 필요하다.
 * (Nest 가드는 라우트가 매칭된 뒤에만 실행되므로, 없는 경로는 가드 이전에 404가 난다.)
 * 기능 모듈이 아직 비어 있는 Phase 1에서는 테스트 전용 컨트롤러를 붙여 확인한다.
 */
@Controller('__probe')
class ProbeController {
  @Get()
  whoami(@CurrentUser() user: AuthenticatedUser) {
    return { user_id: user.id };
  }
}

/** 자체 DatabaseModule의 DI가 실제로 주입되는지 확인하기 위한 테스트 전용 프로바이더. */
@Injectable()
class ProbeService {
  constructor(
    @Inject(DATA_SOURCE) readonly dataSource: DataSource,
    @InjectRepository(Project) readonly projects: Repository<Project>,
  ) {}
}

@Module({ controllers: [ProbeController], providers: [ProbeService] })
class ProbeModule {}

describe('Muster API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ProbeModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('7개 모듈이 모두 로드된 상태로 앱이 부팅된다', () => {
    expect(app).toBeDefined();
  });

  it('DATA_SOURCE가 초기화된 상태로 주입된다', () => {
    const probe = app.get(ProbeService);
    expect(probe.dataSource.isInitialized).toBe(true);
  });

  it('@InjectRepository가 엔티티 리포지토리를 주입한다', () => {
    const probe = app.get(ProbeService);
    expect(probe.projects.metadata.tableName).toBe('projects');
  });

  it('마이그레이션이 모두 적용된 상태다 (미적용 마이그레이션 0건)', async () => {
    const probe = app.get(ProbeService);
    expect(await probe.dataSource.showMigrations()).toBe(false);
  });

  it('GET /api/v1/health 는 인증 없이 200을 반환한다', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime_seconds).toBe('number');
  });

  it('@Public이 아닌 라우트는 토큰이 없으면 401 + 규약 에러 포맷', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/__probe').expect(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
    });
  });

  it('DB에 없는 토큰은 401이다', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/__probe')
      .set('Authorization', 'Bearer anything')
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('존재하지 않는 경로의 404도 규약 에러 포맷으로 응답한다', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });

  it('글로벌 프리픽스가 없는 경로는 매칭되지 않는다', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
