import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { SessionService } from '../src/modules/auth/session.service';
import type { BuildStatus } from '../src/database/entities/enums';
import {
  Agent,
  Document,
  HealthSnapshot,
  LogEntry,
  ProjectEnvConfig,
  Session,
  User,
} from '../src/database/entities';

interface ScopedItem {
  id: string;
  project_id: string;
  project_name: string;
}

interface PageBody<T> {
  items: T[];
  next_cursor: string | null;
}

/**
 * 프로젝트를 가로지르는 조회 5종 (`/documents`, `/agents`, `/env-configs`, `/logs`,
 * `/health-snapshots`).
 *
 * 이 엔드포인트들은 앱에서 처음으로 **프로젝트 경계를 넘어** 읽는다. 프로젝트 하위 경로는
 * ProjectMemberGuard가 한 곳에서 막아 주지만 여기에는 그런 가드가 없고, 스코프를 서비스
 * 질의가 직접 책임진다. 그래서 가장 비중 있게 보는 것은 "남의 행이 섞이지 않는가"다 —
 * 새면 프로젝트 이름과 로그 본문·문서 제목이 그대로 나간다.
 *
 * 나머지(커서 경계, 정렬, 필터)는 단위 테스트가 못 보는 부분만 본다: 키셋 튜플 비교와
 * IN (:...ids)가 Postgres에서 실제로 도는지.
 */
describe('Phase 7 — 프로젝트 교차 조회 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let sessions: SessionService;

  let alice: User;
  let bob: User;
  let carol: User;
  let aliceToken: string;
  let bobToken: string;
  let carolToken: string;

  /** bob의 프로젝트. alice에게 절대 보이면 안 되는 쪽. */
  let bobProject: string;

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const SECRET = `crossread-secret-${stamp}`;

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

  /**
   * created_at/measured_at은 @CreateDateColumn이라 insert로 못 정한다. 정렬과 커서 경계를
   * 시험하려면 시각을 내가 통제해야 하므로 넣은 뒤 갱신한다.
   */
  const addLog = async (
    projectId: string,
    message: string,
    level: 'error' | 'warn' | 'info',
    createdAt: Date,
  ): Promise<string> => {
    const repo = ds.getRepository(LogEntry);
    const row = await repo.save(
      repo.create({ project_id: projectId, agent_id: null, level, message }),
    );
    await repo.update({ id: row.id }, { created_at: createdAt });
    return row.id;
  };

  const addSnapshot = async (projectId: string, measuredAt: Date): Promise<string> => {
    const repo = ds.getRepository(HealthSnapshot);
    const row = await repo.save(
      repo.create({
        project_id: projectId,
        deploy_freq_score: 4,
        lead_time_score: null,
        change_fail_score: 3,
        mttr_score: null,
        composite_score: '3.50',
      }),
    );
    await repo.update({ id: row.id }, { measured_at: measuredAt });
    return row.id;
  };

  const addDocument = async (
    projectId: string,
    title: string,
    type: 'prd' | 'srs' | 'tech_spec' | 'other',
    createdAt: Date,
  ): Promise<string> => {
    const repo = ds.getRepository(Document);
    const row = await repo.save(
      repo.create({
        project_id: projectId,
        title,
        type,
        commit_ref: null,
        upload_status: 'pending',
        file_url: null,
      }),
    );
    await repo.update({ id: row.id }, { created_at: createdAt });
    return row.id;
  };

  const addAgent = async (projectId: string, name: string): Promise<string> => {
    const repo = ds.getRepository(Agent);
    const row = await repo.save(repo.create({ project_id: projectId, name, config_md: '# agent' }));
    return row.id;
  };

  /**
   * 환경 구성은 API로 만들 수 없다 — 생성 경로가 Policy Gate(trivy/conftest)를 태우는데
   * 이 환경에는 그 도구가 없다. 스코프·페이지네이션을 보는 데는 행만 있으면 된다.
   */
  const addEnvConfig = async (projectId: string, buildStatus: BuildStatus): Promise<string> => {
    const repo = ds.getRepository(ProjectEnvConfig);
    const row = await repo.save(
      repo.create({
        project_id: projectId,
        template_id: null,
        stack_config: {},
        docker_config: {},
        build_status: buildStatus,
      }),
    );
    return row.id;
  };

  const list = async <T = ScopedItem>(
    token: string,
    path: string,
    query = '',
  ): Promise<PageBody<T>> => {
    const res = await http().get(`/api/v1/${path}${query}`).set(auth(token)).expect(200);
    return res.body as PageBody<T>;
  };

  const ALL = ['documents', 'agents', 'env-configs', 'logs', 'health-snapshots'];

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

    alice = await createUser(`crossread-alice-${stamp}`);
    bob = await createUser(`crossread-bob-${stamp}`);
    // carol은 끝까지 어떤 프로젝트에도 속하지 않는다 — 빈 페이지 경로 전용.
    carol = await createUser(`crossread-carol-${stamp}`);
    aliceToken = (await sessions.issue(alice.id)).token;
    bobToken = (await sessions.issue(bob.id)).token;
    carolToken = (await sessions.issue(carol.id)).token;

    bobProject = await createProject(bobToken, `${SECRET}-proj`);

    // bob 쪽에는 5종 전부에 행을 하나씩 심는다. alice의 어떤 목록에도 나오면 안 된다.
    await addDocument(bobProject, `${SECRET}-doc`, 'prd', new Date());
    await addAgent(bobProject, `${SECRET}-agent`);
    await addEnvConfig(bobProject, 'policy_blocked');
    await addLog(bobProject, `${SECRET}-log`, 'error', new Date());
    await addSnapshot(bobProject, new Date());
  }, 30_000);

  afterAll(async () => {
    for (const user of [alice, bob, carol]) {
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

  /**
   * 이 파일에서 가장 중요한 검사. id뿐 아니라 응답 전문에 bob의 문자열이 없는지도 본다 —
   * 새어 나가는 것은 보통 행 자체가 아니라 거기 딸려 오는 프로젝트 **이름**이다.
   */
  describe('스코프 — 남의 프로젝트는 섞이지 않는다', () => {
    it.each(ALL)('GET /%s 에 bob의 행이 없다', async (path) => {
      const body = await list(aliceToken, path);

      expect(body.items.some((i) => i.project_id === bobProject)).toBe(false);
      expect(JSON.stringify(body)).not.toContain(SECRET);
    });

    it.each(ALL)('GET /%s 는 인증 없이 접근할 수 없다', async (path) => {
      await http().get(`/api/v1/${path}`).expect(401);
    });

    it.each(ALL)('멤버 프로젝트가 없는 사용자는 빈 200을 받는다 — GET /%s', async (path) => {
      const body = await list(carolToken, path);

      expect(body.items).toEqual([]);
      expect(body.next_cursor).toBeNull();
    });
  });

  describe('GET /documents', () => {
    let projectId: string;
    let projectName: string;
    const ids: string[] = [];

    beforeAll(async () => {
      projectName = `crossread-docs-${stamp}`;
      projectId = await createProject(aliceToken, projectName);

      // 3건은 prd, 1건은 srs. 시각을 1분 간격으로 벌려 정렬을 단정할 수 있게 한다.
      const base = Date.parse('2026-09-01T00:00:00.000Z');
      for (let i = 0; i < 3; i += 1) {
        ids.push(await addDocument(projectId, `doc-prd-${i}`, 'prd', new Date(base + i * 60_000)));
      }
      ids.push(await addDocument(projectId, 'doc-srs', 'srs', new Date(base + 3 * 60_000)));
    });

    const mine = (body: PageBody<ScopedItem>) =>
      body.items.filter((i) => i.project_id === projectId);

    it('project_name이 채워져 있고 실제 프로젝트 이름과 같다', async () => {
      const rows = mine(await list(aliceToken, 'documents'));

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.project_name === projectName)).toBe(true);
    });

    it('최신순으로 내려온다', async () => {
      const body = await list<ScopedItem & { created_at: string }>(aliceToken, 'documents');
      const times = body.items.map((i) => Date.parse(i.created_at));

      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });

    it('type 필터가 실제로 거른다', async () => {
      const body = await list<ScopedItem & { type: string }>(aliceToken, 'documents', '?type=srs');

      expect(body.items.every((i) => i.type === 'srs')).toBe(true);
      expect(mine(body)).toHaveLength(1);
    });

    it('모르는 type은 400이다 (조용히 무시하지 않는다)', async () => {
      await http().get('/api/v1/documents?type=nope').set(auth(aliceToken)).expect(400);
    });

    it('커서로 페이지 경계를 넘어도 중복도 누락도 없다', async () => {
      const seen: string[] = [];
      let cursor: string | null = null;

      // limit=2로 강제해 3건짜리 집합이 반드시 두 페이지 이상으로 쪼개지게 한다.
      for (let guard = 0; guard < 20; guard += 1) {
        const query: string = `?type=prd&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const body: PageBody<ScopedItem> = await list(aliceToken, 'documents', query);
        seen.push(...body.items.filter((i) => i.project_id === projectId).map((i) => i.id));
        cursor = body.next_cursor;
        if (!cursor) break;
      }

      expect(cursor).toBeNull();
      expect(new Set(seen).size).toBe(seen.length);
      // 이 프로젝트의 prd 3건이 하나도 빠지지 않고 정확히 한 번씩.
      expect([...seen].sort()).toEqual([...ids.slice(0, 3)].sort());
    });
  });

  describe('GET /logs', () => {
    let projectId: string;
    let projectName: string;
    const errorIds: string[] = [];

    beforeAll(async () => {
      projectName = `crossread-logs-${stamp}`;
      projectId = await createProject(aliceToken, projectName);

      const base = Date.parse('2026-09-02T00:00:00.000Z');
      for (let i = 0; i < 3; i += 1) {
        errorIds.push(
          await addLog(projectId, `log-error-${i}`, 'error', new Date(base + i * 60_000)),
        );
      }
      await addLog(projectId, 'log-info', 'info', new Date(base + 3 * 60_000));
    });

    const mine = (body: PageBody<ScopedItem>) =>
      body.items.filter((i) => i.project_id === projectId);

    it('project_name이 채워져 있고 실제 프로젝트 이름과 같다', async () => {
      const rows = mine(await list(aliceToken, 'logs'));

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.project_name === projectName)).toBe(true);
    });

    it('최신순으로 내려온다', async () => {
      const body = await list<ScopedItem & { created_at: string }>(aliceToken, 'logs');
      const times = body.items.map((i) => Date.parse(i.created_at));

      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });

    it('level 필터가 실제로 거른다', async () => {
      const body = await list<ScopedItem & { level: string }>(aliceToken, 'logs', '?level=info');

      expect(body.items.every((i) => i.level === 'info')).toBe(true);
      expect(mine(body)).toHaveLength(1);
    });

    it('모르는 level은 400이다', async () => {
      await http().get('/api/v1/logs?level=trace').set(auth(aliceToken)).expect(400);
    });

    it('커서로 페이지 경계를 넘어도 중복도 누락도 없다', async () => {
      const seen: string[] = [];
      let cursor: string | null = null;

      for (let guard = 0; guard < 20; guard += 1) {
        const query: string = `?level=error&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const body: PageBody<ScopedItem> = await list(aliceToken, 'logs', query);
        seen.push(...body.items.filter((i) => i.project_id === projectId).map((i) => i.id));
        cursor = body.next_cursor;
        if (!cursor) break;
      }

      expect(cursor).toBeNull();
      expect(new Set(seen).size).toBe(seen.length);
      expect([...seen].sort()).toEqual([...errorIds].sort());
    });
  });

  describe('GET /health-snapshots', () => {
    let projectId: string;
    let projectName: string;

    beforeAll(async () => {
      projectName = `crossread-health-${stamp}`;
      projectId = await createProject(aliceToken, projectName);

      const base = Date.parse('2026-09-03T00:00:00.000Z');
      for (let i = 0; i < 3; i += 1) {
        await addSnapshot(projectId, new Date(base + i * 60_000));
      }
    });

    it('project_name과 점수 타입이 프로젝트 하위 응답과 같다', async () => {
      const body = await list<
        ScopedItem & { composite_score: string; measured_at: string; mttr_score: number | null }
      >(aliceToken, 'health-snapshots');
      const rows = body.items.filter((i) => i.project_id === projectId);

      expect(rows.length).toBe(3);
      expect(rows.every((r) => r.project_name === projectName)).toBe(true);
      // numeric 컬럼은 문자열로 나간다. 숫자로 바뀌면 프론트의 소수 표기가 흔들린다.
      expect(typeof rows[0].composite_score).toBe('string');
      expect(rows[0].mttr_score).toBeNull();

      const times = body.items.map((i) => Date.parse(i.measured_at));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });
  });

  describe('GET /agents, /env-configs', () => {
    it('project_name이 채워진다', async () => {
      const name = `crossread-agents-${stamp}`;
      const projectId = await createProject(aliceToken, name);
      await addAgent(projectId, `agent-${stamp}`);
      await addEnvConfig(projectId, 'policy_passed');

      const agents = (await list(aliceToken, 'agents')).items.filter(
        (i) => i.project_id === projectId,
      );
      const configs = (await list(aliceToken, 'env-configs')).items.filter(
        (i) => i.project_id === projectId,
      );

      expect(agents.map((a) => a.project_name)).toEqual([name]);
      expect(configs.map((c) => c.project_name)).toEqual([name]);
    });

    it('build_status 필터가 걸리고, 모르는 값은 400이다', async () => {
      const body = await list<ScopedItem & { build_status: string }>(
        aliceToken,
        'env-configs',
        '?build_status=policy_passed',
      );
      expect(body.items.every((i) => i.build_status === 'policy_passed')).toBe(true);

      await http().get('/api/v1/env-configs?build_status=nope').set(auth(aliceToken)).expect(400);
    });
  });
});
