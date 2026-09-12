import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { SessionService } from '../src/modules/auth/session.service';
import { Session, User } from '../src/database/entities';

/**
 * Phase 3 — Auth(세션) + ProjectCore(CRUD/소유권) 검증.
 *
 * OAuth 로그인 플로우는 아직 없으므로 SessionService로 직접 세션을 발급해
 * "발급 이후"의 계약만 검증한다.
 */
describe('Phase 3 — Auth + ProjectCore (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let sessions: SessionService;

  // 두 사용자를 두어야 "남의 프로젝트 접근 차단"을 실제로 검증할 수 있다.
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
    alice = await createUser(`alice-${stamp}`);
    bob = await createUser(`bob-${stamp}`);
    aliceToken = (await sessions.issue(alice.id)).token;
    bobToken = (await sessions.issue(bob.id)).token;
  }, 30_000);

  afterAll(async () => {
    // 프로젝트는 soft delete라 일반 delete로는 안 지워진다. 테스트 잔여물은 물리 삭제한다.
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

  describe('세션', () => {
    it('발급된 토큰으로 /auth/me가 본인 정보를 돌려준다', async () => {
      const res = await http().get('/api/v1/auth/me').set(auth(aliceToken)).expect(200);
      expect(res.body).toEqual({
        id: alice.id,
        github_login: alice.github_login,
        email: null,
      });
    });

    it('원문 토큰은 DB에 저장되지 않는다 (해시만 보관)', async () => {
      const rows = (await ds.query(`SELECT token_hash FROM sessions WHERE user_id = $1`, [
        alice.id,
      ])) as Array<{ token_hash: string }>;

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.token_hash).not.toBe(aliceToken);
        expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('로그아웃하면 같은 토큰이 즉시 401이 된다', async () => {
      const { token } = await sessions.issue(bob.id);

      await http().get('/api/v1/auth/me').set(auth(token)).expect(200);
      await http().post('/api/v1/auth/logout').set(auth(token)).expect(204);

      const res = await http().get('/api/v1/auth/me').set(auth(token)).expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('만료된 세션은 401이다', async () => {
      const { token } = await sessions.issue(bob.id);
      // 만료 시각을 과거로 밀어 시간 경과를 흉내낸다.
      await ds.query(
        `UPDATE sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1`,
        [createHash('sha256').update(token).digest('hex')],
      );

      await http().get('/api/v1/auth/me').set(auth(token)).expect(401);
    });

    it('없는 토큰은 401이다', async () => {
      await http().get('/api/v1/auth/me').set(auth('not-a-real-token')).expect(401);
    });
  });

  describe('프로젝트 CRUD', () => {
    it('생성하면 201과 함께 요청자가 owner로 등록된다', async () => {
      const res = await http()
        .post('/api/v1/projects')
        .set(auth(aliceToken))
        .send({ name: 'nol-clone-dashboard' })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'nol-clone-dashboard',
        current_stage: 'planning',
      });
      expect(res.body.deleted_at).toBeUndefined();

      const members = (await ds.query(
        `SELECT user_id, role FROM project_members WHERE project_id = $1`,
        [res.body.id],
      )) as Array<{ user_id: string; role: string }>;
      expect(members).toEqual([{ user_id: alice.id, role: 'owner' }]);
    });

    it('생성 시 최초 단계가 이력에 남는다 (타임라인 시작점)', async () => {
      const res = await http()
        .post('/api/v1/projects')
        .set(auth(aliceToken))
        .send({ name: 'stage-history-probe' })
        .expect(201);

      const history = (await ds.query(
        `SELECT stage FROM project_stage_history WHERE project_id = $1`,
        [res.body.id],
      )) as Array<{ stage: string }>;
      expect(history).toEqual([{ stage: 'planning' }]);
    });

    it('이름이 비면 400 VALIDATION_FAILED', async () => {
      const res = await http()
        .post('/api/v1/projects')
        .set(auth(aliceToken))
        .send({ name: '' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('정의되지 않은 필드를 보내면 거부한다', async () => {
      await http()
        .post('/api/v1/projects')
        .set(auth(aliceToken))
        .send({ name: 'x', owner_id: bob.id })
        .expect(400);
    });

    it('단계를 바꾸면 이력에 추가된다', async () => {
      const created = await http()
        .post('/api/v1/projects')
        .set(auth(aliceToken))
        .send({ name: 'stage-change' })
        .expect(201);

      await http()
        .patch(`/api/v1/projects/${created.body.id}`)
        .set(auth(aliceToken))
        .send({ current_stage: 'development' })
        .expect(200);

      const history = (await ds.query(
        `SELECT stage FROM project_stage_history WHERE project_id = $1 ORDER BY entered_at`,
        [created.body.id],
      )) as Array<{ stage: string }>;
      expect(history.map((h) => h.stage)).toEqual(['planning', 'development']);
    });

    it('같은 단계로 다시 PATCH하면 이력이 늘지 않는다', async () => {
      const created = await http()
        .post('/api/v1/projects')
        .set(auth(aliceToken))
        .send({ name: 'stage-noop' })
        .expect(201);

      await http()
        .patch(`/api/v1/projects/${created.body.id}`)
        .set(auth(aliceToken))
        .send({ current_stage: 'planning' })
        .expect(200);

      const history = (await ds.query(
        `SELECT count(*)::int AS n FROM project_stage_history WHERE project_id = $1`,
        [created.body.id],
      )) as Array<{ n: number }>;
      expect(history[0].n).toBe(1);
    });

    it('정의되지 않은 단계는 400이다', async () => {
      const created = await http()
        .post('/api/v1/projects')
        .set(auth(aliceToken))
        .send({ name: 'bad-stage' })
        .expect(201);

      await http()
        .patch(`/api/v1/projects/${created.body.id}`)
        .set(auth(aliceToken))
        .send({ current_stage: 'shipped' })
        .expect(400);
    });

    it('삭제는 soft delete다 — 조회에서 사라지지만 행은 남는다', async () => {
      const created = await http()
        .post('/api/v1/projects')
        .set(auth(aliceToken))
        .send({ name: 'to-delete' })
        .expect(201);

      await http().delete(`/api/v1/projects/${created.body.id}`).set(auth(aliceToken)).expect(204);

      await http().get(`/api/v1/projects/${created.body.id}`).set(auth(aliceToken)).expect(404);

      const rows = (await ds.query(`SELECT deleted_at FROM projects WHERE id = $1`, [
        created.body.id,
      ])) as Array<{ deleted_at: string | null }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();
    });
  });

  describe('소유권 검사', () => {
    let aliceProjectId: string;

    beforeAll(async () => {
      const res = await http()
        .post('/api/v1/projects')
        .set(auth(aliceToken))
        .send({ name: 'alice-private' })
        .expect(201);
      aliceProjectId = res.body.id;
    });

    it('비멤버의 조회는 404다 (403이면 존재를 알려주게 된다)', async () => {
      const res = await http()
        .get(`/api/v1/projects/${aliceProjectId}`)
        .set(auth(bobToken))
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('비멤버는 수정할 수 없다', async () => {
      await http()
        .patch(`/api/v1/projects/${aliceProjectId}`)
        .set(auth(bobToken))
        .send({ name: 'hijacked' })
        .expect(404);

      const res = await http()
        .get(`/api/v1/projects/${aliceProjectId}`)
        .set(auth(aliceToken))
        .expect(200);
      expect(res.body.name).toBe('alice-private');
    });

    it('비멤버는 삭제할 수 없다', async () => {
      await http().delete(`/api/v1/projects/${aliceProjectId}`).set(auth(bobToken)).expect(404);

      await http().get(`/api/v1/projects/${aliceProjectId}`).set(auth(aliceToken)).expect(200);
    });

    it('목록에는 내가 속한 프로젝트만 나온다', async () => {
      const res = await http().get('/api/v1/projects').set(auth(bobToken)).expect(200);
      const ids = (res.body.items as Array<{ id: string }>).map((p) => p.id);
      expect(ids).not.toContain(aliceProjectId);
    });

    it('uuid가 아닌 경로 파라미터는 500이 아니라 404다', async () => {
      await http().get('/api/v1/projects/not-a-uuid').set(auth(aliceToken)).expect(404);
    });

    it('인증 없이는 접근할 수 없다', async () => {
      await http().get('/api/v1/projects').expect(401);
      await http().get(`/api/v1/projects/${aliceProjectId}`).expect(401);
    });
  });

  describe('커서 페이지네이션', () => {
    it('limit만큼 끊고 next_cursor로 이어진다', async () => {
      const carol = await createUser(`carol-${Date.now()}`);
      const { token } = await sessions.issue(carol.id);

      for (const name of ['p1', 'p2', 'p3']) {
        await http().post('/api/v1/projects').set(auth(token)).send({ name }).expect(201);
      }

      const first = await http().get('/api/v1/projects?limit=2').set(auth(token)).expect(200);
      expect(first.body.items).toHaveLength(2);
      expect(first.body.next_cursor).not.toBeNull();

      const second = await http()
        .get(`/api/v1/projects?limit=2&cursor=${encodeURIComponent(first.body.next_cursor)}`)
        .set(auth(token))
        .expect(200);
      expect(second.body.items).toHaveLength(1);
      expect(second.body.next_cursor).toBeNull();

      // 페이지 간 중복이 없어야 한다.
      const ids = [...first.body.items, ...second.body.items].map((p: { id: string }) => p.id);
      expect(new Set(ids).size).toBe(3);

      await ds.query(
        `DELETE FROM projects WHERE id IN (SELECT project_id FROM project_members WHERE user_id = $1)`,
        [carol.id],
      );
      await ds.getRepository(Session).delete({ user_id: carol.id });
      await ds.getRepository(User).delete({ id: carol.id });
    });

    it('limit이 최대치를 넘으면 400이다', async () => {
      await http().get('/api/v1/projects?limit=101').set(auth(aliceToken)).expect(400);
    });

    it('망가진 커서는 400 INVALID_CURSOR다', async () => {
      const res = await http()
        .get('/api/v1/projects?cursor=!!!broken!!!')
        .set(auth(aliceToken))
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_CURSOR');
    });
  });
  describe('GET /projects/:id/members', () => {
    /** 이 describe 안에서만 쓰는 프로젝트. 다른 테스트의 목록 개수에 끼어들지 않게 따로 만든다. */
    const ownProject = async (): Promise<string> => {
      const res = await http()
        .post('/api/v1/projects')
        .set(auth(aliceToken))
        .send({ name: `members-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })
        .expect(201);
      return res.body.id as string;
    };

    it('멤버 전원과 역할별 수를 준다 — 화면이 직접 세지 않게', async () => {
      const projectId = await ownProject();
      const res = await http()
        .get(`/api/v1/projects/${projectId}/members`)
        .set(auth(aliceToken))
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].github_login).toBe(alice.github_login);
      expect(res.body.items[0].role).toBe('owner');
      expect(res.body.counts).toEqual({ owner: 1 });
    });

    it('이메일은 실리지 않는다 — 목록을 보여 주려고 연락처를 나눠 줄 이유가 없다', async () => {
      const projectId = await ownProject();
      const res = await http()
        .get(`/api/v1/projects/${projectId}/members`)
        .set(auth(aliceToken))
        .expect(200);

      expect(res.body.items[0]).not.toHaveProperty('email');
    });

    it('비멤버는 남의 멤버 목록을 볼 수 없다', async () => {
      const projectId = await ownProject();
      await http().get(`/api/v1/projects/${projectId}/members`).set(auth(bobToken)).expect(404);
    });
  });
});
