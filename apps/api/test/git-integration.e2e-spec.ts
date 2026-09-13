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
  GITHUB_OAUTH_CLIENT,
  type GitHubOAuthClient,
  type GitHubProfile,
} from '../src/modules/auth/github-oauth.client';
import { serializeTokenSet, type GitHubTokenSet } from '../src/modules/auth/github-token-set';
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

/**
 * 토큰 갱신만 담당하는 fake. 만료가 켜진 OAuth 앱(GitHub 기본값)을 흉내 낸다.
 */
class FakeOAuthClient implements GitHubOAuthClient {
  refreshed: string[] = [];
  failRefresh = false;
  nextAccessToken = 'gho_refreshed_token';

  async exchangeCode(): Promise<GitHubTokenSet> {
    throw new Error('이 테스트는 로그인 콜백을 타지 않는다');
  }

  async refresh(refreshToken: string): Promise<GitHubTokenSet> {
    this.refreshed.push(refreshToken);
    if (this.failRefresh) throw new Error('bad_refresh_token');
    return {
      accessToken: this.nextAccessToken,
      refreshToken: 'ghr_rotated',
      expiresAt: Date.now() + 8 * 3600_000,
    };
  }

  async fetchProfile(): Promise<GitHubProfile> {
    throw new Error('이 테스트는 프로필 조회를 타지 않는다');
  }
}

describe('Phase 3 — GitHub 레포 연동 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let secrets: SecretStore;
  let github: FakeRepoClient;
  let oauth: FakeOAuthClient;
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
    oauth = new FakeOAuthClient();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GITHUB_REPO_CLIENT)
      .useValue(github)
      .overrideProvider(GITHUB_OAUTH_CLIENT)
      .useValue(oauth)
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
      const res = await http().get(`/api/v1/projects/${projectId}`).set(auth()).expect(200);
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

      const rows = (await ds.query(`SELECT id FROM git_integrations WHERE project_id = $1`, [
        p,
      ])) as unknown[];
      // 웹훅이 없는데 연동만 남으면 이벤트가 영영 오지 않는 상태가 된다.
      expect(rows).toHaveLength(0);
    });
  });

  /**
   * GitHub OAuth 앱의 "Expire user access tokens"가 켜져 있으면 액세스 토큰은 8시간 뒤 죽는다.
   * 예전에는 그 설정을 꺼 두는 운영 우회에 기대고 있었고, 만료된 토큰을 그대로 써서
   * 연동이 서버 로그의 경고 한 줄만 남기고 조용히 실패했다.
   */
  describe('토큰 만료', () => {
    /** 사용자의 보관 토큰을 원하는 상태로 갈아끼운다. */
    const storeTokens = async (tokens: GitHubTokenSet) => {
      const ref = await secrets.put(`github-token-${user.id}`, serializeTokenSet(tokens));
      await ds.getRepository(User).update({ id: user.id }, { github_token_ref: ref });
      user = (await ds.getRepository(User).findOneBy({ id: user.id }))!;
    };

    afterEach(async () => {
      oauth.failRefresh = false;
      oauth.refreshed = [];
      await storeTokens({ accessToken: 'gho_user_token', refreshToken: null, expiresAt: null });
    });

    it('만료된 토큰은 갱신한 뒤 새 토큰으로 GitHub을 호출한다', async () => {
      await storeTokens({
        accessToken: 'gho_expired',
        refreshToken: 'ghr_valid',
        expiresAt: Date.now() - 1000,
      });

      const p = await newProject('expired-token');
      await http()
        .post(`/api/v1/projects/${p}/git-integration`)
        .set(auth())
        .send({ repo_url: 'https://github.com/octocat/refreshed' })
        .expect(201);

      expect(oauth.refreshed).toEqual(['ghr_valid']);
      // 만료된 토큰을 그대로 보냈다면 GitHub이 401을 줬을 것이다.
      expect(github.created.at(-1)?.accessToken).toBe('gho_refreshed_token');
    });

    it('갱신된 토큰은 다시 보관되어 다음 요청에서 또 갱신하지 않는다', async () => {
      await storeTokens({
        accessToken: 'gho_expired',
        refreshToken: 'ghr_valid',
        expiresAt: Date.now() - 1000,
      });

      const first = await newProject('refresh-once');
      await http()
        .post(`/api/v1/projects/${first}/git-integration`)
        .set(auth())
        .send({ repo_url: 'https://github.com/octocat/first' })
        .expect(201);

      const second = await newProject('refresh-not-twice');
      await http()
        .post(`/api/v1/projects/${second}/git-integration`)
        .set(auth())
        .send({ repo_url: 'https://github.com/octocat/second-repo' })
        .expect(201);

      expect(oauth.refreshed).toHaveLength(1);
      expect(github.created.at(-1)?.accessToken).toBe('gho_refreshed_token');
    });

    it('유효한 토큰이면 갱신을 시도하지 않는다', async () => {
      await storeTokens({
        accessToken: 'gho_still_valid',
        refreshToken: 'ghr_valid',
        expiresAt: Date.now() + 3600_000,
      });

      const p = await newProject('valid-token');
      await http()
        .post(`/api/v1/projects/${p}/git-integration`)
        .set(auth())
        .send({ repo_url: 'https://github.com/octocat/valid' })
        .expect(201);

      // 멀쩡한 토큰으로 갱신을 부르면 GitHub이 지금 쓰는 토큰을 무효화한다.
      expect(oauth.refreshed).toEqual([]);
      expect(github.created.at(-1)?.accessToken).toBe('gho_still_valid');
    });

    it('갱신이 실패하면 화면이 띄울 수 있는 재인증 오류를 준다', async () => {
      await storeTokens({
        accessToken: 'gho_expired',
        refreshToken: 'ghr_revoked',
        expiresAt: Date.now() - 1000,
      });
      oauth.failRefresh = true;

      const p = await newProject('reauth-needed');
      const createdBefore = github.created.length;
      const res = await http()
        .post(`/api/v1/projects/${p}/git-integration`)
        .set(auth())
        .send({ repo_url: 'https://github.com/octocat/nope' })
        .expect(403);

      expect(res.body.error.code).toBe('GITHUB_REAUTH_REQUIRED');
      expect(res.body.error.message).toContain('GitHub 재인증이 필요합니다');
      // 토큰을 못 얻었으면 GitHub에 아무것도 만들지 않아야 한다.
      expect(github.created).toHaveLength(createdBefore);
    });

    it('만료됐는데 refresh_token이 없으면 재인증을 요구한다', async () => {
      await storeTokens({
        accessToken: 'gho_expired',
        refreshToken: null,
        expiresAt: Date.now() - 1000,
      });

      const p = await newProject('no-refresh-token');
      const res = await http()
        .post(`/api/v1/projects/${p}/git-integration`)
        .set(auth())
        .send({ repo_url: 'https://github.com/octocat/nope2' })
        .expect(403);

      expect(res.body.error.code).toBe('GITHUB_REAUTH_REQUIRED');
      expect(oauth.refreshed).toEqual([]);
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

  /**
   * 설계서 Part 4 §3에 GET이 없어 추가했다. 목록·개요 화면이 "어느 레포에 붙어 있는가"를
   * 보여주려면 읽을 방법이 필요하다.
   */
  describe('조회', () => {
    it('연동이 없으면 404가 아니라 integration: null이다', async () => {
      const unlinked = await newProject('git-unlinked');

      const res = await http()
        .get(`/api/v1/projects/${unlinked}/git-integration`)
        .set(auth())
        .expect(200);

      // 본문이 비어 있으면 클라이언트의 res.json()이 터진다. null을 감싸는 이유다.
      expect(res.body).toEqual({ integration: null });
    });

    it('인증 없이는 401이다', async () => {
      const target = await newProject('git-unauth');
      await http().get(`/api/v1/projects/${target}/git-integration`).expect(401);
    });
  });
});
