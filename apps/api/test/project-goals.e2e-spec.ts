import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { Session, User } from '../src/database/entities';
import { SECRET_STORE, type SecretStore } from '../src/common/secrets/secret-store';
import { SessionService } from '../src/modules/auth/session.service';
import { GEMINI_CLIENT } from '../src/common/llm/gemini-client';
import { FakeGeminiClient } from '../src/common/llm/fake-gemini-client';
import {
  GITHUB_REPO_CLIENT,
  type CommitSummary,
  type DeleteRepoParams,
  type DeleteWebhookParams,
  type GitHubRepoClient,
  type ListCommitsParams,
  type ListDocsParams,
  type ListWorkflowRunsParams,
  type RepoDoc,
  type WorkflowRunSummary,
} from '../src/modules/project-core/github-repo.client';

/**
 * GitHub 호출은 `FakeRepoClient`로 갈아끼운다(정확한 요청 형태는 git-integration
 * e2e가 이미 검증한다). 이 fake는 그 파일의 것과 거의 같지만 `listDocs`/`listCommits`에
 * 테스트별로 값을 채울 수 있게 한다.
 */
class FakeRepoClient implements GitHubRepoClient {
  nextId = 1000;
  docs: RepoDoc[] = [];
  commits: CommitSummary[] = [];

  async createWebhook(): Promise<{ id: number }> {
    return { id: this.nextId++ };
  }
  async deleteWebhook(_: DeleteWebhookParams): Promise<void> {}
  async listCommits(_: ListCommitsParams): Promise<CommitSummary[]> {
    return this.commits;
  }
  async listWorkflowRuns(_: ListWorkflowRunsParams): Promise<WorkflowRunSummary[]> {
    return [];
  }
  async deleteRepo(_: DeleteRepoParams): Promise<void> {}
  async listDocs(_: ListDocsParams): Promise<RepoDoc[]> {
    return this.docs;
  }
}

describe('목표/요구사항 + 진행률 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let secrets: SecretStore;
  let github: FakeRepoClient;
  let gemini: FakeGeminiClient;
  let user: User;
  let token: string;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  const newProject = async (name: string): Promise<string> => {
    const res = await http().post('/api/v1/projects').set(auth()).send({ name }).expect(201);
    return res.body.id;
  };

  const connectRepo = async (projectId: string, repoUrl: string) => {
    await http()
      .post(`/api/v1/projects/${projectId}/git-integration`)
      .set(auth())
      .send({ repo_url: repoUrl })
      .expect(201);
  };

  beforeAll(async () => {
    github = new FakeRepoClient();
    gemini = new FakeGeminiClient();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GITHUB_REPO_CLIENT)
      .useValue(github)
      .overrideProvider(GEMINI_CLIENT)
      .useValue(gemini)
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
    user = await repo.save(repo.create({ github_login: `goals-user-${Date.now()}`, email: null }));
    const ref = await secrets.put(`github-token-${user.id}`, 'gho_user_token');
    await repo.update({ id: user.id }, { github_token_ref: ref });
    user = (await repo.findOneBy({ id: user.id }))!;

    token = (await app.get(SessionService).issue(user.id)).token;
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

  describe('GET /projects/:id/goals', () => {
    it('확정된 목표가 없으면 content_md가 null이다', async () => {
      const p = await newProject('goals-empty');
      const res = await http().get(`/api/v1/projects/${p}/goals`).set(auth()).expect(200);
      expect(res.body).toEqual({ content_md: null, updated_at: null });
    });
  });

  describe('POST /projects/:id/goals/draft', () => {
    it('레포 연동이 없으면 404다', async () => {
      const p = await newProject('goals-no-repo');
      await http().post(`/api/v1/projects/${p}/goals/draft`).set(auth()).expect(404);
    });

    it('레포 문서를 모아 Gemini에 넘기고, 저장하지 않은 채 초안을 돌려준다', async () => {
      const p = await newProject('goals-draft');
      await connectRepo(p, 'https://github.com/octocat/draft-target');
      github.docs = [{ path: 'README.md', content: '# 프로젝트 설명' }];
      gemini.responses = ['## 목표\nGemini가 만든 초안'];

      const res = await http().post(`/api/v1/projects/${p}/goals/draft`).set(auth()).expect(201);

      expect(res.body).toEqual({
        content_md: '## 목표\nGemini가 만든 초안',
        source_paths: ['README.md'],
      });
      expect(gemini.calls[0].prompt).toContain('README.md');

      // 저장되지 않았어야 한다.
      const after = await http().get(`/api/v1/projects/${p}/goals`).set(auth()).expect(200);
      expect(after.body.content_md).toBeNull();
    });
  });

  describe('PATCH /projects/:id/goals', () => {
    it('저장하면 이후 조회에 반영된다', async () => {
      const p = await newProject('goals-save');
      await http()
        .patch(`/api/v1/projects/${p}/goals`)
        .set(auth())
        .send({ content_md: '# 확정된 목표' })
        .expect(200);

      const res = await http().get(`/api/v1/projects/${p}/goals`).set(auth()).expect(200);
      expect(res.body.content_md).toBe('# 확정된 목표');
      expect(res.body.updated_at).not.toBeNull();
    });

    it('빈 문자열은 400이다', async () => {
      const p = await newProject('goals-empty-body');
      await http()
        .patch(`/api/v1/projects/${p}/goals`)
        .set(auth())
        .send({ content_md: '' })
        .expect(400);
    });
  });

  describe('progress', () => {
    it('아직 분석하지 않았으면 null이다', async () => {
      const p = await newProject('progress-empty');
      const res = await http().get(`/api/v1/projects/${p}/progress`).set(auth()).expect(200);
      expect(res.body).toEqual({ progress: null });
    });

    it('확정된 목표가 없으면 분석은 409다', async () => {
      const p = await newProject('progress-no-goals');
      const res = await http()
        .post(`/api/v1/projects/${p}/progress/analyze`)
        .set(auth())
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('목표를 확정한 뒤 분석하면 스냅샷이 쌓이고 다음 조회에 최신 값이 보인다', async () => {
      const p = await newProject('progress-analyze');
      await connectRepo(p, 'https://github.com/octocat/progress-target');
      await http()
        .patch(`/api/v1/projects/${p}/goals`)
        .set(auth())
        .send({ content_md: '## 목표\n로그인 기능 구현' })
        .expect(200);

      github.commits = [{ sha: 'abcdef1234', message: '로그인 구현', authored_at: null, url: '' }];
      gemini.responses = [
        JSON.stringify({
          percent: 60,
          summary: '로그인은 끝났고 회원가입이 남았다.',
          remaining_items: [{ title: '회원가입', description: '커밋에 없음' }],
        }),
      ];

      const res = await http()
        .post(`/api/v1/projects/${p}/progress/analyze`)
        .set(auth())
        .expect(201);

      expect(res.body).toMatchObject({
        percent: 60,
        summary: '로그인은 끝났고 회원가입이 남았다.',
        remaining_items: [{ title: '회원가입', description: '커밋에 없음' }],
        based_on_commit_sha: 'abcdef1234',
      });

      const after = await http().get(`/api/v1/projects/${p}/progress`).set(auth()).expect(200);
      expect(after.body.progress.percent).toBe(60);
    });
  });

  describe('비멤버', () => {
    it('비멤버는 목표를 볼 수 없다', async () => {
      const p = await newProject('goals-outsider');
      const outsiderRepo = ds.getRepository(User);
      const outsider = await outsiderRepo.save(
        outsiderRepo.create({ github_login: `goals-outsider-${Date.now()}`, email: null }),
      );
      const outsiderToken = (await app.get(SessionService).issue(outsider.id)).token;

      await http()
        .get(`/api/v1/projects/${p}/goals`)
        .set({ Authorization: `Bearer ${outsiderToken}` })
        .expect(404);

      await ds.getRepository(Session).delete({ user_id: outsider.id });
      await outsiderRepo.delete({ id: outsider.id });
    });
  });
});
