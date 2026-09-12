import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { SessionService } from '../src/modules/auth/session.service';
import { EnvConfigTransition, ProjectEnvConfig, Session, User } from '../src/database/entities';
import type { BuildStatus } from '../src/database/entities/enums';

/**
 * 환경 구성 상태 전이 이력.
 *
 * 단위 테스트는 "이력 행을 만들려고 시도하는가"까지만 본다(가짜 트랜잭션이다). 여기서
 * 확인하는 것은 그 위의 것들이다: 실제 Postgres에서 CHECK·FK가 통과하는가, 상태 변경과
 * 이력이 정말 **같은 트랜잭션**에 묶여 있는가, 그리고 남의 구성 이력이 새지 않는가.
 */
describe('Phase 7 — ENV_CONFIG_TRANSITIONS (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let sessions: SessionService;

  let alice: User;
  let bob: User;
  let aliceToken: string;
  let bobToken: string;
  let projectId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createUser = async (login: string): Promise<User> => {
    const repo = ds.getRepository(User);
    return repo.save(repo.create({ github_login: login, email: null }));
  };

  /**
   * 구성을 리포지토리로 직접 만든다 — 생성 엔드포인트를 타지 않는다.
   *
   * 생성 경로는 Gemini 생성기와 trivy·conftest 바이너리를 실제로 부르는데, 이 환경에는
   * 셋 다 없다. 그걸 여기서 흉내 내면 검증하는 대상이 "전이 이력"이 아니라 "가짜 생성기"가
   * 된다. 생성 시 두 줄(generated → 판정)이 남는다는 것은 단위 테스트가 이미 고정하고 있고,
   * 여기서 볼 것은 그 위의 것들이다 — 실제 Postgres의 CHECK·FK·트랜잭션 경계.
   *
   * 덤으로 이 구성들은 **이력 기능 도입 전에 만들어진 구성**과 같은 모양이다(이력이 비어
   * 있는 채로 상태만 있는 것). 그 상태에서도 이후 전이가 제대로 쌓이는지 함께 확인된다.
   */
  const createConfig = async (status: BuildStatus = 'policy_passed'): Promise<string> => {
    const repo = ds.getRepository(ProjectEnvConfig);
    const row = await repo.save(
      repo.create({
        project_id: projectId,
        template_id: null,
        stack_config: { language: 'node' },
        docker_config: { dockerfile: 'FROM node:22-alpine', compose: null, rationale: '' },
        build_status: status,
      }),
    );
    return row.id;
  };

  const transitionsOf = async (configId: string, token = aliceToken) => {
    const res = await http()
      .get(`/api/v1/env-configs/${configId}/transitions`)
      .set(auth(token))
      .expect(200);
    return res.body.items as {
      from_status: string | null;
      to_status: string;
      actor: string | null;
      reason: string | null;
      created_at: string;
    }[];
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    ds = app.get<DataSource>(DATA_SOURCE);
    sessions = app.get(SessionService);

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    alice = await createUser(`tr-alice-${stamp}`);
    bob = await createUser(`tr-bob-${stamp}`);
    aliceToken = (await sessions.issue(alice.id)).token;
    bobToken = (await sessions.issue(bob.id)).token;

    const res = await http()
      .post('/api/v1/projects')
      .set(auth(aliceToken))
      .send({ name: `transitions-${stamp}` })
      .expect(201);
    projectId = res.body.id as string;
  }, 30_000);

  afterAll(async () => {
    for (const user of [alice, bob]) {
      if (!user) continue;
      await ds.query(
        `DELETE FROM projects WHERE id IN (SELECT project_id FROM project_members WHERE user_id = $1)`,
        [user.id],
      );
      await ds.getRepository(Session).delete({ user_id: user.id });
      await ds.getRepository(User).delete({ id: user.id });
    }
    await app.close();
  });

  it('이력이 없던 구성도 첫 전이부터 쌓인다 — 승인한 사람이 남는다', async () => {
    const configId = await createConfig('policy_passed');
    expect(await transitionsOf(configId)).toHaveLength(0);

    await http().post(`/api/v1/env-configs/${configId}/approve`).set(auth(aliceToken)).expect(200);

    expect(await transitionsOf(configId)).toEqual([
      expect.objectContaining({
        from_status: 'policy_passed',
        to_status: 'approved',
        actor: alice.github_login,
        reason: null,
      }),
    ]);
  });

  it('여러 전이가 시간 오름차순으로 쌓인다 — 이력은 지나온 순서대로 읽는다', async () => {
    const configId = await createConfig('policy_passed');

    await http().post(`/api/v1/env-configs/${configId}/approve`).set(auth(aliceToken)).expect(200);
    await http().post(`/api/v1/env-configs/${configId}/execute`).set(auth(aliceToken)).expect(202);

    const items = await transitionsOf(configId);
    expect(items.map((i) => i.to_status)).toEqual(['approved', 'running']);
    // 두 번째 줄의 직전 상태가 첫 줄의 도착 상태와 이어져야 길이 복원된다.
    expect(items[1].from_status).toBe('approved');

    const times = items.map((i) => Date.parse(i.created_at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('반려도 누가 했는지를 남긴다', async () => {
    const configId = await createConfig('policy_blocked');

    await http().post(`/api/v1/env-configs/${configId}/reject`).set(auth(aliceToken)).expect(200);

    expect(await transitionsOf(configId)).toEqual([
      expect.objectContaining({
        from_status: 'policy_blocked',
        to_status: 'rejected',
        actor: alice.github_login,
      }),
    ]);
  });

  it('거부된 전이는 이력에도 남지 않는다 — 상태와 이력이 함께 롤백된다', async () => {
    // approved가 아닌 상태에서 실행하면 409다.
    const configId = await createConfig('policy_passed');

    await http().post(`/api/v1/env-configs/${configId}/execute`).set(auth(aliceToken)).expect(409);

    expect(await transitionsOf(configId)).toHaveLength(0);

    // 상태도 그대로여야 한다. 이력만 롤백되고 상태가 남으면 둘이 어긋난다.
    const repo = ds.getRepository(ProjectEnvConfig);
    expect((await repo.findOneByOrFail({ id: configId })).build_status).toBe('policy_passed');
  });

  it('제자리 전이는 DB가 막는다 — 들어오면 그건 이력이 아니라 기록 버그다', async () => {
    const configId = await createConfig();

    await expect(
      ds.query(
        `INSERT INTO env_config_transitions (env_config_id, from_status, to_status)
         VALUES ($1, 'approved', 'approved')`,
        [configId],
      ),
    ).rejects.toThrow();
  });

  it('알 수 없는 상태는 CHECK가 막는다', async () => {
    const configId = await createConfig();

    await expect(
      ds.query(
        `INSERT INTO env_config_transitions (env_config_id, to_status) VALUES ($1, 'exploded')`,
        [configId],
      ),
    ).rejects.toThrow();
  });

  it('구성을 지우면 이력도 함께 사라진다 (CASCADE)', async () => {
    const configId = await createConfig('policy_passed');
    await http().post(`/api/v1/env-configs/${configId}/approve`).set(auth(aliceToken)).expect(200);

    const repo = ds.getRepository(EnvConfigTransition);
    expect(await repo.countBy({ env_config_id: configId })).toBeGreaterThan(0);
    await ds.query(`DELETE FROM project_env_configs WHERE id = $1`, [configId]);
    expect(await repo.countBy({ env_config_id: configId })).toBe(0);
  });

  it('비멤버는 남의 구성 이력을 볼 수 없다 — 차단 사유와 승인자가 그대로 새어 나간다', async () => {
    const configId = await createConfig();

    await http().get(`/api/v1/env-configs/${configId}/transitions`).set(auth(bobToken)).expect(404);
  });
});
