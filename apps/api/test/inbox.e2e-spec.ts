import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { SessionService } from '../src/modules/auth/session.service';
import {
  Agent,
  AgentRun,
  AuditLog,
  DeploymentEvent,
  PolicyCheckResult,
  ProjectBudget,
  ProjectEnvConfig,
  Session,
  User,
} from '../src/database/entities';

/**
 * 인박스 — "처리해야 할 일" 큐.
 *
 * 여기서 검증하는 것은 실제로 깨질 수 있는 것들이다: 범위(남의 프로젝트가 섞이는가),
 * 큐 판정(임계치 미만 예산·복구된 배포가 들어오는가), 그리고 DISTINCT ON 질의가 Postgres
 * 에서 실제로 도는가. 마지막 것은 단위 테스트가 절대 잡아 줄 수 없는 부분이다.
 */
describe('Phase 7 — Inbox (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let sessions: SessionService;

  let alice: User;
  let bob: User;
  let aliceToken: string;
  let bobToken: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createUser = async (login: string): Promise<User> => {
    const repo = ds.getRepository(User);
    return repo.save(repo.create({ github_login: login, email: null }));
  };

  const createProject = async (token: string, name: string): Promise<string> => {
    const res = await http().post('/api/v1/projects').set(auth(token)).send({ name }).expect(201);
    return res.body.id as string;
  };

  const addEnvConfig = async (
    projectId: string,
    status: 'policy_blocked' | 'policy_passed' | 'approved',
    createdAt: Date,
  ): Promise<string> => {
    const repo = ds.getRepository(ProjectEnvConfig);
    const row = await repo.save(
      repo.create({
        project_id: projectId,
        template_id: null,
        stack_config: {},
        docker_config: {},
        build_status: status,
      }),
    );
    // created_at은 @CreateDateColumn이라 직접 못 넣는다. 순서를 만들려면 갱신해야 한다.
    await repo.update({ id: row.id }, { created_at: createdAt });
    return row.id;
  };

  const addRun = async (projectId: string, cost: string, tokens: number): Promise<void> => {
    const agents = ds.getRepository(Agent);
    const agent = await agents.save(
      agents.create({ project_id: projectId, name: `inbox-agent-${Date.now()}`, config_md: '#' }),
    );
    const runs = ds.getRepository(AgentRun);
    await runs.save(
      runs.create({
        agent_id: agent.id,
        status: 'succeeded',
        tokens_used: tokens,
        cost,
        started_at: new Date(),
        ended_at: new Date(),
      }),
    );
  };

  const getInbox = async (token: string, query = '') => {
    const res = await http().get(`/api/v1/inbox${query}`).set(auth(token)).expect(200);
    return res.body as {
      items: {
        id: string;
        category: string;
        project_id: string;
        project_name: string;
        title: string;
        detail: string;
        occurred_at: string;
        href: string;
        target: { kind: string; id: string };
        approvable: boolean;
      }[];
      counts: Record<string, number>;
      truncated: boolean;
    };
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
    alice = await createUser(`inbox-alice-${stamp}`);
    bob = await createUser(`inbox-bob-${stamp}`);
    aliceToken = (await sessions.issue(alice.id)).token;
    bobToken = (await sessions.issue(bob.id)).token;
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

  it('멤버 프로젝트가 없으면 빈 큐를 준다 (에러가 아니다)', async () => {
    const body = await getInbox(bobToken);
    expect(body.items).toEqual([]);
    expect(body.counts).toEqual({ policy: 0, budget: 0, deployment: 0, audit: 0, total: 0 });
    expect(body.truncated).toBe(false);
  });

  it('차단된 환경 구성이 원인·이동 대상과 함께 올라온다', async () => {
    const projectId = await createProject(aliceToken, `inbox-blocked-${Date.now()}`);
    const configId = await addEnvConfig(projectId, 'policy_blocked', new Date());

    const results = ds.getRepository(PolicyCheckResult);
    await results.save(
      results.create({
        env_config_id: configId,
        tool: 'conftest',
        verdict: 'fail',
        risk_notes: '호스트 루트 마운트 규칙 위반',
      }),
    );

    const body = await getInbox(aliceToken);
    const item = body.items.find((i) => i.target.id === configId);

    expect(item).toBeDefined();
    expect(item?.category).toBe('policy');
    expect(item?.project_name).toContain('inbox-blocked');
    expect(item?.detail).toContain('conftest — 호스트 루트 마운트 규칙 위반');
    // policy_blocked는 승인으로 해소되지 않는다 (Part 1 §3.2.1).
    expect(item?.approvable).toBe(false);
    expect(item?.href).toContain(projectId);
  });

  it('새 구성이 생기면 이전 구성은 큐에서 빠진다 (프로젝트당 최신 하나)', async () => {
    const projectId = await createProject(aliceToken, `inbox-latest-${Date.now()}`);
    const old = await addEnvConfig(projectId, 'policy_blocked', new Date(Date.now() - 60_000));
    const fresh = await addEnvConfig(projectId, 'policy_passed', new Date());

    const ids = (await getInbox(aliceToken)).items.map((i) => i.target.id);
    expect(ids).toContain(fresh);
    expect(ids).not.toContain(old);
  });

  it('처리가 끝난 구성(approved)은 큐에 없다', async () => {
    const projectId = await createProject(aliceToken, `inbox-approved-${Date.now()}`);
    const configId = await addEnvConfig(projectId, 'approved', new Date());

    const ids = (await getInbox(aliceToken)).items.map((i) => i.target.id);
    expect(ids).not.toContain(configId);
  });

  it('임계치 미만 예산은 들어가지 않고, 넘으면 사용액/한도와 함께 들어간다', async () => {
    const projectId = await createProject(aliceToken, `inbox-budget-${Date.now()}`);
    const budgets = ds.getRepository(ProjectBudget);
    await budgets.save(
      budgets.create({
        project_id: projectId,
        token_limit: null,
        cost_limit: '45.0000',
        alert_threshold_pct: '80',
      }),
    );

    // 30 / 45 = 66.67% — 임계치 미만.
    await addRun(projectId, '30.0000', 100);
    const before = await getInbox(aliceToken, '?category=budget');
    expect(before.items.some((i) => i.project_id === projectId)).toBe(false);

    // +6 → 36 / 45 = 80%.
    await addRun(projectId, '6.0000', 100);
    const after = await getInbox(aliceToken, '?category=budget');
    const item = after.items.find((i) => i.project_id === projectId);

    expect(item).toBeDefined();
    expect(item?.category).toBe('budget');
    expect(item?.title).toContain('80%');
    expect(item?.detail).toContain('$36.00 / $45.00');
  });

  it('마지막 배포가 실패면 큐에 들어가고, 뒤이어 성공하면 사라진다', async () => {
    const projectId = await createProject(aliceToken, `inbox-deploy-${Date.now()}`);
    const events = ds.getRepository(DeploymentEvent);
    await events.save(
      events.create({
        project_id: projectId,
        kind: 'workflow_run',
        status: 'failure',
        commit_sha: '7be0d14abcdef0123456789abcdef0123456789a',
        committed_at: null,
        occurred_at: new Date(Date.now() - 60_000),
      }),
    );

    const failed = await getInbox(aliceToken, '?category=deployment');
    const item = failed.items.find((i) => i.project_id === projectId);
    expect(item?.detail).toContain('7be0d14');

    await events.save(
      events.create({
        project_id: projectId,
        kind: 'workflow_run',
        status: 'success',
        commit_sha: 'aaa0000abcdef0123456789abcdef0123456789a',
        committed_at: null,
        occurred_at: new Date(),
      }),
    );

    const recovered = await getInbox(aliceToken, '?category=deployment');
    expect(recovered.items.some((i) => i.project_id === projectId)).toBe(false);
  });

  it('오래된 배포 실패는 큐를 막지 않는다', async () => {
    const projectId = await createProject(aliceToken, `inbox-stale-${Date.now()}`);
    const events = ds.getRepository(DeploymentEvent);
    await events.save(
      events.create({
        project_id: projectId,
        kind: 'deployment',
        status: 'failure',
        commit_sha: 'deadbee',
        committed_at: null,
        occurred_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      }),
    );

    const body = await getInbox(aliceToken, '?category=deployment');
    expect(body.items.some((i) => i.project_id === projectId)).toBe(false);
  });

  it('알릴 가치가 있는 감사 액션만 올라온다 (API 키 발급 O, 문서 생성 X)', async () => {
    const projectId = await createProject(aliceToken, `inbox-audit-${Date.now()}`);
    const logs = ds.getRepository(AuditLog);
    await logs.save([
      logs.create({ user_id: alice.id, project_id: projectId, action: 'api_key.create' }),
      logs.create({ user_id: alice.id, project_id: projectId, action: 'document.create' }),
    ]);

    const body = await getInbox(aliceToken, '?category=audit');
    const mine = body.items.filter((i) => i.project_id === projectId);

    expect(mine).toHaveLength(1);
    expect(mine[0].detail).toContain('api_key.create');
    expect(mine[0].detail).toContain(alice.github_login);
  });

  it('멤버가 아닌 프로젝트는 어떤 카테고리에도 섞이지 않는다', async () => {
    const aliceProject = await createProject(aliceToken, `inbox-private-${Date.now()}`);
    await addEnvConfig(aliceProject, 'policy_blocked', new Date());
    const events = ds.getRepository(DeploymentEvent);
    await events.save(
      events.create({
        project_id: aliceProject,
        kind: 'deployment',
        status: 'failure',
        commit_sha: 'secret1',
        committed_at: null,
        occurred_at: new Date(),
      }),
    );

    const body = await getInbox(bobToken);
    expect(body.items).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('inbox-private');
  });

  it('정렬은 occurred_at 내림차순이고, counts는 필터와 무관하게 전체 기준이다', async () => {
    const all = await getInbox(aliceToken);
    const times = all.items.map((i) => Date.parse(i.occurred_at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(all.counts.total).toBeGreaterThan(0);

    const onlyPolicy = await getInbox(aliceToken, '?category=policy');
    expect(onlyPolicy.items.every((i) => i.category === 'policy')).toBe(true);
    // 필터가 걸려도 다른 탭의 배지 숫자는 그대로여야 한다.
    expect(onlyPolicy.counts).toEqual(all.counts);
  });

  it('모르는 카테고리는 400이다', async () => {
    await http().get('/api/v1/inbox?category=nope').set(auth(aliceToken)).expect(400);
  });

  it('인증 없이는 접근할 수 없다', async () => {
    await http().get('/api/v1/inbox').expect(401);
  });
});
