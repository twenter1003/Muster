import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { SessionService } from '../src/modules/auth/session.service';
import { Session, User } from '../src/database/entities';

/**
 * `POST /agents/:id/runs` — 에이전트의 API 키와 사람의 세션 둘 다 받는다.
 *
 * 전에는 키만 받았고, 그래서 브라우저에서는 무슨 수를 써도 401이었다(개요 화면의
 * "에이전트 실행" 버튼이 비활성이던 이유). 여기서 고정하는 것은 **두 신원이 각자
 * 자기 범위로만 제한되는가**다 — 문을 하나 더 열었으므로 범위가 새면 그게 곧 사고다.
 */
describe('Phase 7 — 실행 시작 인증 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let sessions: SessionService;

  let alice: User;
  let bob: User;
  let aliceToken: string;
  let bobToken: string;

  let aliceProject: string;
  let aliceAgent: string;
  let aliceKey: string;

  let bobProject: string;
  let bobAgent: string;
  let bobKey: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createUser = async (login: string): Promise<User> => {
    const repo = ds.getRepository(User);
    return repo.save(repo.create({ github_login: login, email: null }));
  };

  /** 프로젝트 + 그 안의 에이전트 + 그 프로젝트의 API 키를 한 번에 만든다. */
  const setup = async (token: string, name: string) => {
    const project = await http()
      .post('/api/v1/projects')
      .set(auth(token))
      .send({ name })
      .expect(201);
    const projectId = project.body.id as string;

    const agent = await http()
      .post(`/api/v1/projects/${projectId}/agents`)
      .set(auth(token))
      .send({ name: `${name}-agent`, config_md: '# agent' })
      .expect(201);

    const key = await http()
      .post(`/api/v1/projects/${projectId}/api-keys`)
      .set(auth(token))
      .send({ label: `${name}-key` })
      .expect(201);

    return { projectId, agentId: agent.body.id as string, key: key.body.key as string };
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
    alice = await createUser(`run-alice-${stamp}`);
    bob = await createUser(`run-bob-${stamp}`);
    aliceToken = (await sessions.issue(alice.id)).token;
    bobToken = (await sessions.issue(bob.id)).token;

    const a = await setup(aliceToken, `run-a-${stamp}`);
    aliceProject = a.projectId;
    aliceAgent = a.agentId;
    aliceKey = a.key;

    const b = await setup(bobToken, `run-b-${stamp}`);
    bobProject = b.projectId;
    bobAgent = b.agentId;
    bobKey = b.key;
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

  it('에이전트는 API 키로 실행을 시작한다 (기존 경로가 그대로 산다)', async () => {
    const res = await http()
      .post(`/api/v1/agents/${aliceAgent}/runs`)
      .set({ 'X-API-Key': aliceKey })
      .expect(201);

    expect(res.body).toMatchObject({ agent_id: aliceAgent, status: 'running', ended_at: null });
  });

  it('사람은 세션으로 실행을 시작한다 — 브라우저에서 되어야 버튼이 살아난다', async () => {
    const res = await http()
      .post(`/api/v1/agents/${aliceAgent}/runs`)
      .set(auth(aliceToken))
      .expect(201);

    expect(res.body.status).toBe('running');
  });

  it('쿠키 세션으로도 된다 — 브라우저가 실제로 쓰는 경로다', async () => {
    const res = await http()
      .post(`/api/v1/agents/${aliceAgent}/runs`)
      .set('Cookie', `muster_session=${aliceToken}`)
      .expect(201);

    expect(res.body.status).toBe('running');
  });

  it('신원이 하나도 없으면 401이다', async () => {
    await http().post(`/api/v1/agents/${aliceAgent}/runs`).expect(401);
  });

  it('남의 키로는 남의 에이전트에 실행을 끼워넣지 못한다', async () => {
    await http().post(`/api/v1/agents/${aliceAgent}/runs`).set({ 'X-API-Key': bobKey }).expect(404);
  });

  it('남의 세션으로도 마찬가지다 — 문을 하나 더 열었다고 범위가 넓어지지 않는다', async () => {
    await http().post(`/api/v1/agents/${aliceAgent}/runs`).set(auth(bobToken)).expect(404);
  });

  it('유효하지 않은 키는 401이다 (세션으로 조용히 넘어가지 않는다)', async () => {
    // 키를 보냈다는 것은 키로 인증하겠다는 뜻이다. 그게 틀렸는데 쿠키로 통과시키면
    // 호출자가 의도한 신원이 조용히 바뀐다.
    await http()
      .post(`/api/v1/agents/${aliceAgent}/runs`)
      .set({ 'X-API-Key': 'muster_not-a-real-key' })
      .set('Cookie', `muster_session=${aliceToken}`)
      .expect(401);
  });

  it('폐기된 키는 401이다', async () => {
    const issued = await http()
      .post(`/api/v1/projects/${aliceProject}/api-keys`)
      .set(auth(aliceToken))
      .send({ label: 'to-revoke' })
      .expect(201);

    await http().delete(`/api/v1/api-keys/${issued.body.id}`).set(auth(aliceToken)).expect(204);

    await http()
      .post(`/api/v1/agents/${aliceAgent}/runs`)
      .set({ 'X-API-Key': issued.body.key })
      .expect(401);
  });

  it('밥은 자기 에이전트를 자기 세션으로 실행한다 (대칭 확인)', async () => {
    const res = await http()
      .post(`/api/v1/agents/${bobAgent}/runs`)
      .set(auth(bobToken))
      .expect(201);

    expect(res.body.agent_id).toBe(bobAgent);
    expect(bobProject).toBeTruthy();
  });
});
