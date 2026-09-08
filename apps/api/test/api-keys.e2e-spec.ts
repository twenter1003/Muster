import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { Session, User } from '../src/database/entities';
import { SessionService } from '../src/modules/auth/session.service';

/**
 * 설계서 Part 4 §3 — 프로젝트 스코프 API 키.
 * 외부 에이전트가 로그·실행이력을 밀어넣을 때 사용자 세션 대신 쓰는 자격증명이다.
 */
describe('Phase 4 — PROJECT_API_KEYS (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let user: User;
  let token: string;
  let projectId: string;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    ds = app.get<DataSource>(DATA_SOURCE);
    const repo = ds.getRepository(User);
    user = await repo.save(repo.create({ github_login: `key-user-${Date.now()}`, email: null }));
    token = (await app.get(SessionService).issue(user.id)).token;

    const res = await http()
      .post('/api/v1/projects')
      .set(auth())
      .send({ name: 'api-key-host' })
      .expect(201);
    projectId = res.body.id;
  }, 30_000);

  afterAll(async () => {
    await ds.query(
      `DELETE FROM projects WHERE id IN (SELECT project_id FROM project_members WHERE user_id = $1)`,
      [user.id],
    );
    await ds.getRepository(Session).delete({ user_id: user.id });
    await ds.getRepository(User).delete({ id: user.id });
    await app.close();
  });

  it('발급하면 원문 키를 응답에 딱 한 번 준다', async () => {
    const res = await http()
      .post(`/api/v1/projects/${projectId}/api-keys`)
      .set(auth())
      .send({ label: 'ci-runner' })
      .expect(201);

    expect(res.body.key).toEqual(expect.any(String));
    expect(res.body.key.length).toBeGreaterThan(20);
    expect(res.body.label).toBe('ci-runner');
  });

  it('원문 키는 DB에 없고 해시만 남는다', async () => {
    const res = await http()
      .post(`/api/v1/projects/${projectId}/api-keys`)
      .set(auth())
      .send({ label: 'hash-probe' })
      .expect(201);

    const rows = (await ds.query(`SELECT * FROM project_api_keys WHERE id = $1`, [
      res.body.id,
    ])) as Array<Record<string, unknown>>;
    expect(JSON.stringify(rows)).not.toContain(res.body.key);
    expect(rows[0].key_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('목록에는 원문 키가 나오지 않는다', async () => {
    const res = await http().get(`/api/v1/projects/${projectId}/api-keys`).set(auth()).expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item.key).toBeUndefined();
      expect(item.key_hash).toBeUndefined();
      expect(item).toHaveProperty('label');
    }
  });

  it('폐기하면 revoked_at이 기록된다', async () => {
    const created = await http()
      .post(`/api/v1/projects/${projectId}/api-keys`)
      .set(auth())
      .send({ label: 'to-revoke' })
      .expect(201);

    await http().delete(`/api/v1/api-keys/${created.body.id}`).set(auth()).expect(204);

    const rows = (await ds.query(`SELECT revoked_at FROM project_api_keys WHERE id = $1`, [
      created.body.id,
    ])) as Array<{ revoked_at: string | null }>;
    expect(rows[0].revoked_at).not.toBeNull();
  });

  it('비멤버는 키를 발급할 수 없다', async () => {
    const repo = ds.getRepository(User);
    const outsider = await repo.save(
      repo.create({ github_login: `outsider-${Date.now()}`, email: null }),
    );
    const outsiderToken = (await app.get(SessionService).issue(outsider.id)).token;

    await http()
      .post(`/api/v1/projects/${projectId}/api-keys`)
      .set({ Authorization: `Bearer ${outsiderToken}` })
      .send({ label: 'nope' })
      .expect(404);

    await ds.getRepository(Session).delete({ user_id: outsider.id });
    await repo.delete({ id: outsider.id });
  });

  it('비멤버는 남의 키를 폐기할 수 없다', async () => {
    const created = await http()
      .post(`/api/v1/projects/${projectId}/api-keys`)
      .set(auth())
      .send({ label: 'protected' })
      .expect(201);

    const repo = ds.getRepository(User);
    const outsider = await repo.save(
      repo.create({ github_login: `outsider2-${Date.now()}`, email: null }),
    );
    const outsiderToken = (await app.get(SessionService).issue(outsider.id)).token;

    await http()
      .delete(`/api/v1/api-keys/${created.body.id}`)
      .set({ Authorization: `Bearer ${outsiderToken}` })
      .expect(404);

    await ds.getRepository(Session).delete({ user_id: outsider.id });
    await repo.delete({ id: outsider.id });
  });
});
