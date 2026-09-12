import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { SessionService } from '../src/modules/auth/session.service';
import { AuditLog, Session, User } from '../src/database/entities';

/**
 * 설계서 Part 4 §8 — 감사 로그.
 *
 * 기록은 "실제 엔드포인트를 호출했을 때 남는가"로만 검증한다. AuditService를 직접 부르면
 * 연결이 끊겨 있어도 통과하는데, 이 기능에서 실제로 깨지는 지점이 바로 연결이다.
 */
describe('Phase 6 — Audit (e2e)', () => {
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
    alice = await createUser(`audit-alice-${stamp}`);
    bob = await createUser(`audit-bob-${stamp}`);
    aliceToken = (await sessions.issue(alice.id)).token;
    bobToken = (await sessions.issue(bob.id)).token;
  }, 30_000);

  afterAll(async () => {
    for (const user of [alice, bob]) {
      if (!user) continue;
      // 감사 기록은 user FK가 CASCADE라 사용자와 함께 사라진다. 프로젝트는 soft delete라
      // 물리 삭제가 필요하다(다른 e2e와 같은 정리 방식).
      await ds.query(
        `DELETE FROM projects WHERE id IN (SELECT project_id FROM project_members WHERE user_id = $1)`,
        [user.id],
      );
      await ds.getRepository(Session).delete({ user_id: user.id });
      await ds.getRepository(User).delete({ id: user.id });
    }
    await app.close();
  });

  it('프로젝트를 만들면 project.create가 실제로 남는다', async () => {
    const projectId = await createProject(aliceToken, `audit-create-${Date.now()}`);

    const rows = await ds.getRepository(AuditLog).find({
      where: { user_id: alice.id, project_id: projectId },
    });

    expect(rows.map((r) => r.action)).toContain('project.create');
  });

  it('프로젝트 스코프 조회는 그 프로젝트의 기록만 준다', async () => {
    const a = await createProject(aliceToken, `audit-scope-a-${Date.now()}`);
    const b = await createProject(aliceToken, `audit-scope-b-${Date.now()}`);

    await http()
      .patch(`/api/v1/projects/${a}`)
      .set(auth(aliceToken))
      .send({ name: 'renamed' })
      .expect(200);

    const res = await http()
      .get(`/api/v1/projects/${a}/audit-logs`)
      .set(auth(aliceToken))
      .expect(200);

    const actions = res.body.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(expect.arrayContaining(['project.create', 'project.update']));
    for (const item of res.body.items) {
      expect(item.project_id).toBe(a);
      // 화면이 "무엇에 대한 기록인지"를 보여줄 수 있어야 한다.
      expect(item.project_name).toBe('renamed');
    }
    expect(res.body.items.some((i: { project_id: string }) => i.project_id === b)).toBe(false);
  });

  it('전체 이력에는 project_id가 null인 기록도 포함된다 (템플릿 생성)', async () => {
    await http()
      .post('/api/v1/env-templates')
      .set(auth(aliceToken))
      .send({ name: `audit-tpl-${Date.now()}`, stack_preset: { language: 'node' } })
      .expect(201);

    const res = await http().get('/api/v1/audit-logs').set(auth(aliceToken)).expect(200);

    const nullScoped = res.body.items.filter(
      (i: { project_id: string | null }) => i.project_id === null,
    );
    expect(nullScoped.map((i: { action: string }) => i.action)).toContain('template.create');
    expect(nullScoped.every((i: { project_name: string | null }) => i.project_name === null)).toBe(
      true,
    );
  });

  it('남의 감사 기록은 보이지 않는다', async () => {
    const aliceProject = await createProject(aliceToken, `audit-private-${Date.now()}`);
    await createProject(bobToken, `audit-bob-own-${Date.now()}`);

    // 전체 조회는 항상 요청자 자신의 것만이다.
    const mine = await http().get('/api/v1/audit-logs').set(auth(bobToken)).expect(200);
    expect(mine.body.items.some((i: { project_id: string }) => i.project_id === aliceProject)).toBe(
      false,
    );

    // 프로젝트 스코프는 비멤버에게 404다 (ProjectMemberGuard).
    await http().get(`/api/v1/projects/${aliceProject}/audit-logs`).set(auth(bobToken)).expect(404);
  });

  it('커서 페이지네이션이 중복·누락 없이 이어진다', async () => {
    const projectId = await createProject(aliceToken, `audit-page-${Date.now()}`);

    // 같은 created_at을 가진 행이 생기기 쉬운 조건이라, (created_at, id) 키셋이
    // 실제로 필요한 상황을 그대로 만든다.
    for (let i = 0; i < 5; i += 1) {
      await http()
        .patch(`/api/v1/projects/${projectId}`)
        .set(auth(aliceToken))
        .send({ name: `paged-${i}` })
        .expect(200);
    }

    const collected: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const url = `/api/v1/projects/${projectId}/audit-logs?limit=2${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      }`;
      const res: request.Response = await http().get(url).set(auth(aliceToken)).expect(200);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      collected.push(...res.body.items.map((i: { id: string }) => i.id));
      cursor = res.body.next_cursor;
      if (!cursor) break;
    }

    // project.create 1 + project.update 5.
    expect(collected).toHaveLength(6);
    expect(new Set(collected).size).toBe(6);
    expect(cursor).toBeNull();
  });
});
