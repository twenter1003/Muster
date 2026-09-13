import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { SessionService } from '../src/modules/auth/session.service';
import { Agent, Document, Session, User } from '../src/database/entities';

/**
 * 상단바 검색.
 *
 * 검색은 범위가 새기 특히 쉬운 자리다 — 한 글자만 쳐도 남의 프로젝트 이름과 문서 제목이
 * 쏟아질 수 있는 모양이기 때문이다. 그래서 여기서 가장 무겁게 보는 것이 스코프이고,
 * 그다음이 LIKE 특수문자가 실제 Postgres에서 리터럴로 도는가다.
 */
describe('Phase 7 — Search (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let sessions: SessionService;

  let alice: User;
  let bob: User;
  let carol: User;
  let aliceToken: string;
  let bobToken: string;
  let carolToken: string;

  let aliceProject: string;
  let stamp: string;
  /** bob만 가진 문자열. alice의 응답 어디에도 나타나면 안 된다. */
  let secret: string;

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

  const addDocument = async (projectId: string, title: string): Promise<void> => {
    const repo = ds.getRepository(Document);
    await repo.save(
      repo.create({
        project_id: projectId,
        title,
        type: 'prd',
        file_url: null,
        commit_ref: null,
      }),
    );
  };

  const addAgent = async (projectId: string, name: string): Promise<void> => {
    const repo = ds.getRepository(Agent);
    await repo.save(repo.create({ project_id: projectId, name, config_md: '# a' }));
  };

  const search = async (token: string, q: string) => {
    const res = await http()
      .get(`/api/v1/search?q=${encodeURIComponent(q)}`)
      .set(auth(token))
      .expect(200);
    return res.body as {
      query: string;
      hits: { kind: string; id: string; title: string; project_id: string; project_name: string }[];
      truncated: Record<string, boolean>;
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

    stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    secret = `bobonly-${stamp}`;

    alice = await createUser(`sr-alice-${stamp}`);
    bob = await createUser(`sr-bob-${stamp}`);
    carol = await createUser(`sr-carol-${stamp}`);
    aliceToken = (await sessions.issue(alice.id)).token;
    bobToken = (await sessions.issue(bob.id)).token;
    carolToken = (await sessions.issue(carol.id)).token;

    aliceProject = await createProject(aliceToken, `kiosk-${stamp}`);
    await addDocument(aliceProject, `키오스크 요구사항 ${stamp}`);
    await addAgent(aliceProject, `kiosk-agent-${stamp}`);
    // LIKE 특수문자가 들어간 제목. 이스케이프가 없으면 '%' 검색에 이것만이 아니라 전부 걸린다.
    await addDocument(aliceProject, `할인 50%off ${stamp}`);

    const bobProject = await createProject(bobToken, secret);
    await addDocument(bobProject, `${secret} 문서`);
    await addAgent(bobProject, `${secret}-agent`);
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

  describe('스코프 — 이 파일에서 가장 중요한 검사', () => {
    it('남의 프로젝트·문서·에이전트는 검색되지 않는다', async () => {
      const body = await search(aliceToken, secret);

      expect(body.hits).toEqual([]);
      // hits뿐 아니라 거기 딸린 이름까지 없어야 한다 — 새는 것은 보통 행이 아니라
      // 행에 붙어 오는 프로젝트 **이름**이다. query 필드는 검사에서 뺀다: 그건 요청자가
      // 방금 직접 친 글자를 되돌려주는 것이라 유출이 아니다(화면이 늦게 온 응답을
      // 버리는 데 쓴다).
      expect(JSON.stringify(body.hits)).not.toContain(secret);
      expect(JSON.stringify(body.truncated)).not.toContain(secret);
    });

    it('멤버 프로젝트가 없는 사용자는 빈 결과를 받는다 (404도 500도 아니다)', async () => {
      const body = await search(carolToken, stamp);
      expect(body.hits).toEqual([]);
    });

    it('인증 없이는 접근할 수 없다', async () => {
      await http().get('/api/v1/search?q=kiosk').expect(401);
    });
  });

  describe('찾기', () => {
    it('부분 문자열로 프로젝트를 찾는다 — kiosk가 kiosk-... 를 건진다', async () => {
      const body = await search(aliceToken, 'kiosk');
      const project = body.hits.find((h) => h.kind === 'project');

      expect(project).toBeDefined();
      expect(project?.id).toBe(aliceProject);
      expect(project?.project_name).toBe(`kiosk-${stamp}`);
    });

    it('문서 제목과 에이전트 이름도 찾는다', async () => {
      const body = await search(aliceToken, stamp);
      const kinds = new Set(body.hits.map((h) => h.kind));

      expect(kinds.has('document')).toBe(true);
      expect(kinds.has('agent')).toBe(true);
      // 딸린 프로젝트 이름이 함께 와야 화면이 "어느 프로젝트의 것인지"를 말할 수 있다.
      for (const hit of body.hits) expect(hit.project_name.length).toBeGreaterThan(0);
    });

    it('프로젝트가 먼저 온다 — 이름을 쳤을 때 찾는 것은 대개 그 프로젝트다', async () => {
      const body = await search(aliceToken, 'kiosk');
      expect(body.hits[0].kind).toBe('project');
    });

    it('대소문자를 가리지 않는다', async () => {
      const body = await search(aliceToken, 'KIOSK');
      expect(body.hits.some((h) => h.kind === 'project')).toBe(true);
    });

    it('한국어 제목도 부분 일치로 찾는다', async () => {
      const body = await search(aliceToken, '키오스크');
      expect(body.hits.some((h) => h.kind === 'document')).toBe(true);
    });
  });

  describe('LIKE 특수문자', () => {
    it('%는 리터럴이다 — 전부가 걸리지 않는다', async () => {
      const body = await search(aliceToken, '%');

      // '50%off' 문서 하나만 걸려야 한다. 이스케이프가 없으면 alice의 모든 행이 걸린다.
      expect(body.hits).toHaveLength(1);
      expect(body.hits[0].title).toContain('50%off');
    });

    it('_도 리터럴이다', async () => {
      // 어떤 제목에도 밑줄이 없으므로 아무것도 걸리지 않아야 한다.
      // 이스케이프가 없으면 "임의의 한 글자"가 되어 전부 걸린다.
      const body = await search(aliceToken, '_');
      expect(body.hits).toEqual([]);
    });
  });

  describe('입력 검증', () => {
    it('q가 없으면 400이다 — 검색어 없는 찾기는 뜻이 없다', async () => {
      await http().get('/api/v1/search').set(auth(aliceToken)).expect(400);
    });

    it('빈 q는 400이다', async () => {
      await http().get('/api/v1/search?q=').set(auth(aliceToken)).expect(400);
    });

    it('공백만 친 경우는 빈 결과다 (400이 아니다 — 사용자가 지우는 중일 뿐이다)', async () => {
      const body = await search(aliceToken, '   ');
      expect(body.hits).toEqual([]);
    });
  });
});
