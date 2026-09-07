import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { Session, User } from '../src/database/entities';
import { SECRET_STORE, type SecretStore } from '../src/common/secrets/secret-store';
import { SessionService } from '../src/modules/auth/session.service';
import {
  GITHUB_REPO_CLIENT,
  type CreateWebhookParams,
  type DeleteWebhookParams,
  type GitHubRepoClient,
} from '../src/modules/project-core/github-repo.client';

/**
 * 레포 연동 등록/해제 검증. GitHub HTTP 호출만 fake로 갈아끼운다.
 * (실제 요청 형태는 github-repo.client.spec.ts가 별도로 검증한다.)
 */
class FakeRepoClient implements GitHubRepoClient {
  created: CreateWebhookParams[] = [];
  deleted: DeleteWebhookParams[] = [];
  nextId = 1000;
  failCreate: Error | null = null;

  async createWebhook(params: CreateWebhookParams): Promise<{ id: number }> {
    if (this.failCreate) throw this.failCreate;
    this.created.push(params);
    return { id: this.nextId++ };
  }

  async deleteWebhook(params: DeleteWebhookParams): Promise<void> {
    this.deleted.push(params);
  }
}

describe('Phase 3 — GitHub 레포 연동 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let secrets: SecretStore;
  let github: FakeRepoClient;
  let user: User;
  let token: string;
  let projectId: string;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  const newProject = async (name: string): Promise<string> => {
    const res = await http().post('/api/v1/projects').set(auth()).send({ name }).expect(201);
    return res.body.id;
  };

  beforeAll(async () => {
    github = new FakeRepoClient();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GITHUB_REPO_CLIENT)
      .useValue(github)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    ds = app.get<DataSource>(DATA_SOURCE);
    secrets = app.get<SecretStore>(SECRET_STORE);

    const repo = ds.getRepository(User);
    user = await repo.save(repo.create({ github_login: `git-user-${Date.now()}`, email: null }));
    // 연동에는 사용자의 GitHub 토큰이 필요하다. 로그인 콜백이 하는 일을 여기서 재현한다.
    const ref = await secrets.put(`github-token-${user.id}`, 'gho_user_token');
    await repo.update({ id: user.id }, { github_token_ref: ref });
    user = (await repo.findOneBy({ id: user.id }))!;

    token = (await app.get(SessionService).issue(user.id)).token;
    projectId = await newProject('git-integration-target');
  }, 30_000);

  afterAll(async () => {
    if (user?.github_token_ref) await secrets.delete(user.github_token_ref);
    await ds.query(
      `DELETE FROM projects WHERE id IN (SELECT project_id FROM project_members WHERE user_id = $1)`,
      [user.id],
    );
    await ds.getRepository(Session).delete({ user_id: user.id });
    await ds.getRepository(User).delete({ id: user.id });
    await app.close();
  });

  describe('등록', () => {
    it('연동을 만들고 웹훅을 자동 등록한다', async () => {
      const res = await http()
        .post(`/api/v1/projects/${projectId}/git-integration`)
        .set(auth())
        .send({ repo_url: 'https://github.com/octocat/hello-world' })
        .expect(201);

      expect(res.body).toMatchObject({ repo_url: 'https://github.com/octocat/hello-world' });
      expect(github.created).toHaveLength(1);
      expect(github.created[0]).toMatchObject({
        owner: 'octocat',
        repo: 'hello-world',
        accessToken: 'gho_user_token',
        deliveryUrl: 'http://localhost:8080/api/v1/webhooks/github',
      });
    });

    it('응답에 시크릿 참조를 노출하지 않는다', async () => {
      const res = await http()
        .get(`/api/v1/projects/${projectId}`)
        .set(auth())
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain('webhook_secret_ref');
    });

    it('웹훅 시크릿 원문은 DB가 아니라 시크릿 저장소에만 있다', async () => {
      const rows = (await ds.query(
        `SELECT webhook_secret_ref, webhook_id FROM git_integrations WHERE project_id = $1`,
        [projectId],
      )) as Array<{ webhook_secret_ref: string; webhook_id: string }>;

      expect(rows).toHaveLength(1);
      expect(rows[0].webhook_secret_ref).toMatch(/^file:\/\//);
      // GitHub에 보낸 시크릿 원문이 DB 어디에도 없어야 한다.
      const sentSecret = github.created[0].secret;
      expect(JSON.stringify(rows)).not.toContain(sentSecret);
      expect(await secrets.get(rows[0].webhook_secret_ref)).toBe(sentSecret);
    });

    it('웹훅 id를 보관한다 (없으면 나중에 지울 수 없다)', async () => {
      const rows = (await ds.query(
        `SELECT webhook_id FROM git_integrations WHERE project_id = $1`,
        [projectId],
      )) as Array<{ webhook_id: string }>;
      expect(Number(rows[0].webhook_id)).toBe(1000);
    });

    it('시크릿은 매번 새로 생성한다 (레포 간 재사용 없음)', async () => {
      const other = await newProject('another-repo');
      await http()
        .post(`/api/v1/projects/${other}/git-integration`)
        .set(auth())
        .send({ repo_url: 'https://github.com/octocat/second' })
        .expect(201);

      const [a, b] = github.created.map((c) => c.secret);
      expect(a).not.toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it('이미 연동돼 있으면 409다', async () => {
      const res = await http()
        .post(`/api/v1/projects/${projectId}/git-integration`)
        .set(auth())
        .send({ repo_url: 'https://github.com/octocat/hello-world' })
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('github.com이 아닌 주소는 400이다', async () => {
      const p = await newProject('bad-host');
      await http()
        .post(`/api/v1/projects/${p}/git-integration`)
        .set(auth())
        .send({ repo_url: 'https://gitlab.com/a/b' })
        .expect(400);
    });

    it('비멤버는 연동할 수 없다', async () => {
      const outsiderRepo = ds.getRepository(User);
      const outsider = await outsiderRepo.save(
        outsiderRepo.create({ github_login: `outsider-${Date.now()}`, email: null }),
      );
      const outsiderToken = (await app.get(SessionService).issue(outsider.id)).token;

      await http()
        .post(`/api/v1/projects/${projectId}/git-integration`)
        .set({ Authorization: `Bearer ${outsiderToken}` })
        .send({ repo_url: 'https://github.com/octocat/hello-world' })
        .expect(404);

      await ds.getRepository(Session).delete({ user_id: outsider.id });
      await outsiderRepo.delete({ id: outsider.id });
    });

    it('웹훅 등록이 실패하면 연동 레코드가 남지 않는다', async () => {
      const p = await newProject('webhook-fails');
      github.failCreate = new Error('GitHub 다운');

      await http()
        .post(`/api/v1/projects/${p}/git-integration`)
        .set(auth())
        .send({ repo_url: 'https://github.com/octocat/nope' })
        .expect(500);

      github.failCreate = null;

      const rows = (await ds.query(
        `SELECT id FROM git_integrations WHERE project_id = $1`,
        [p],
      )) as unknown[];
      // 웹훅이 없는데 연동만 남으면 이벤트가 영영 오지 않는 상태가 된다.
      expect(rows).toHaveLength(0);
    });
  });

  describe('해제', () => {
    it('GitHub 웹훅을 지우고 레코드와 시크릿을 정리한다', async () => {
      const p = await newProject('to-disconnect');
      await http()
        .post(`/api/v1/projects/${p}/git-integration`)
        .set(auth())
        .send({ repo_url: 'https://github.com/octocat/disconnect-me' })
        .expect(201);

      const before = (await ds.query(
        `SELECT webhook_secret_ref, webhook_id FROM git_integrations WHERE project_id = $1`,
        [p],
      )) as Array<{ webhook_secret_ref: string; webhook_id: string }>;

      await http().delete(`/api/v1/projects/${p}/git-integration`).set(auth()).expect(204);

      expect(github.deleted.at(-1)).toMatchObject({
        owner: 'octocat',
        repo: 'disconnect-me',
        hookId: Number(before[0].webhook_id),
      });

      const after = (await ds.query(`SELECT id FROM git_integrations WHERE project_id = $1`, [
        p,
      ])) as unknown[];
      expect(after).toHaveLength(0);
      expect(await secrets.get(before[0].webhook_secret_ref)).toBeNull();
    });

    it('연동이 없으면 404다', async () => {
      const p = await newProject('never-connected');
      await http().delete(`/api/v1/projects/${p}/git-integration`).set(auth()).expect(404);
    });
  });
});
