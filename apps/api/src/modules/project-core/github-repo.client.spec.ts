import { GITHUB_API_VERSION } from '../auth/github-oauth.client';
import { HttpGitHubRepoClient, WEBHOOK_EVENTS } from './github-repo.client';

/**
 * 실제 웹훅 등록/삭제 요청이 GitHub 문서의 계약과 일치하는지 검증한다.
 * 근거: docs.github.com/en/rest/repos/webhooks
 *   - 생성: POST /repos/{owner}/{repo}/hooks → 201
 *   - 삭제: DELETE /repos/{owner}/{repo}/hooks/{hook_id} → 204
 */
describe('HttpGitHubRepoClient (실제 요청 형태)', () => {
  const client = new HttpGitHubRepoClient();
  let fetchMock: jest.Mock;

  const respond = (status: number, body: unknown = {}) =>
    ({
      status,
      ok: status < 400,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as Response;

  const params = {
    owner: 'octocat',
    repo: 'hello-world',
    accessToken: 'gho_tok',
    deliveryUrl: 'http://localhost:8080/api/v1/webhooks/github',
    secret: 'the-secret',
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(client['logger'], 'warn').mockImplementation(() => undefined);
  });

  describe('createWebhook', () => {
    it('문서에 명시된 경로로 POST한다', async () => {
      fetchMock.mockResolvedValue(respond(201, { id: 12345 }));
      await client.createWebhook(params);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.github.com/repos/octocat/hello-world/hooks');
      expect(init.method).toBe('POST');
    });

    it('필수 헤더를 모두 보낸다', async () => {
      fetchMock.mockResolvedValue(respond(201, { id: 1 }));
      await client.createWebhook(params);

      expect(fetchMock.mock.calls[0][1].headers).toEqual({
        Authorization: 'Bearer gho_tok',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'Content-Type': 'application/json',
      });
    });

    it('본문이 문서의 스키마와 정확히 일치한다', async () => {
      fetchMock.mockResolvedValue(respond(201, { id: 1 }));
      await client.createWebhook(params);

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        name: 'web',
        active: true,
        events: ['push', 'pull_request', 'workflow_run'],
        config: {
          url: 'http://localhost:8080/api/v1/webhooks/github',
          content_type: 'json',
          secret: 'the-secret',
          insecure_ssl: '0',
        },
      });
    });

    it('구독 이벤트는 push·pull_request·workflow_run 셋이다', () => {
      // workflow_run은 환경 구성 실행 결과가 돌아오는 유일한 경로다(Part 4 §5.2).
      // 빠지면 실행한 구성이 running에 영영 머문다.
      expect([...WEBHOOK_EVENTS]).toEqual(['push', 'pull_request', 'workflow_run']);
    });

    it('insecure_ssl은 문자열 "0"이다 (TLS 검증을 끄지 않는다)', async () => {
      fetchMock.mockResolvedValue(respond(201, { id: 1 }));
      await client.createWebhook(params);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.config.insecure_ssl).toBe('0');
    });

    it('201이 아니면 실패로 본다 (200도 성공이 아니다)', async () => {
      fetchMock.mockResolvedValue(respond(200, { id: 1 }));
      await expect(client.createWebhook(params)).rejects.toMatchObject({ status: 502 });
    });

    it('id가 없는 201 응답은 502로 막는다', async () => {
      fetchMock.mockResolvedValue(respond(201, {}));
      await expect(client.createWebhook(params)).rejects.toMatchObject({ status: 502 });
    });

    it('403이면 권한 부족으로 안내한다', async () => {
      fetchMock.mockResolvedValue(respond(403, { message: 'Resource not accessible' }));
      await expect(client.createWebhook(params)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('404면 레포를 찾을 수 없다고 안내한다', async () => {
      fetchMock.mockResolvedValue(respond(404, { message: 'Not Found' }));
      await expect(client.createWebhook(params)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('422는 장애가 아니라 요청 거부이므로 400으로 돌려준다', async () => {
      fetchMock.mockResolvedValue(
        respond(422, {
          message: 'Validation Failed',
          errors: [{ resource: 'Hook', field: 'url', message: "url isn't reachable (localhost)" }],
        }),
      );

      await expect(client.createWebhook(params)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        status: 400,
      });
    });

    it('422 메시지는 호출자가 무엇을 고쳐야 하는지 알려준다', async () => {
      fetchMock.mockResolvedValue(respond(422, { message: 'Validation Failed' }));

      try {
        await client.createWebhook(params);
        throw new Error('던졌어야 합니다');
      } catch (e) {
        const body = JSON.stringify((e as { getResponse(): unknown }).getResponse());
        expect(body).toContain('공개 인터넷');
      }
    });

    it('GitHub의 원문 오류 메시지를 사용자에게 노출하지 않는다', async () => {
      fetchMock.mockResolvedValue(respond(422, { message: '내부 상세 정보' }));

      try {
        await client.createWebhook(params);
        throw new Error('던졌어야 합니다');
      } catch (e) {
        expect(JSON.stringify((e as { getResponse(): unknown }).getResponse())).not.toContain(
          '내부 상세 정보',
        );
      }
    });
  });

  describe('deleteWebhook', () => {
    const del = { owner: 'octocat', repo: 'hello-world', accessToken: 'gho_tok', hookId: 999 };

    it('문서에 명시된 경로로 DELETE한다', async () => {
      fetchMock.mockResolvedValue(respond(204));
      await client.deleteWebhook(del);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.github.com/repos/octocat/hello-world/hooks/999');
      expect(init.method).toBe('DELETE');
    });

    it('204면 성공이다', async () => {
      fetchMock.mockResolvedValue(respond(204));
      await expect(client.deleteWebhook(del)).resolves.toBeUndefined();
    });

    it('이미 지워진 웹훅(404)도 성공으로 본다 — 목적은 달성된 상태다', async () => {
      fetchMock.mockResolvedValue(respond(404, { message: 'Not Found' }));
      await expect(client.deleteWebhook(del)).resolves.toBeUndefined();
    });

    it('401이면 실패로 올린다', async () => {
      fetchMock.mockResolvedValue(respond(401, { message: 'Bad credentials' }));
      await expect(client.deleteWebhook(del)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('listCommits', () => {
    const listParams = { owner: 'octocat', repo: 'hello-world', accessToken: 'gho_tok' };

    it('문서에 명시된 경로로 GET한다 (기본 5개)', async () => {
      fetchMock.mockResolvedValue(respond(200, []));
      await client.listCommits(listParams);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.github.com/repos/octocat/hello-world/commits?per_page=5');
      expect(init.method).toBeUndefined(); // GET은 method를 생략해도 된다
    });

    it('limit을 넘기면 per_page에 반영한다', async () => {
      fetchMock.mockResolvedValue(respond(200, []));
      await client.listCommits({ ...listParams, limit: 10 });

      expect(fetchMock.mock.calls[0][0]).toContain('per_page=10');
    });

    it('메시지 첫 줄만 남기고 필요한 필드만 뽑는다', async () => {
      fetchMock.mockResolvedValue(
        respond(200, [
          {
            sha: 'a3f91c2',
            html_url: 'https://github.com/octocat/hello-world/commit/a3f91c2',
            commit: {
              message: 'fix: 결제 모듈 타임아웃 처리\n\n상세 설명 본문',
              author: { date: '2026-09-13T10:00:00Z' },
            },
          },
        ]),
      );

      expect(await client.listCommits(listParams)).toEqual([
        {
          sha: 'a3f91c2',
          message: 'fix: 결제 모듈 타임아웃 처리',
          authored_at: '2026-09-13T10:00:00Z',
          url: 'https://github.com/octocat/hello-world/commit/a3f91c2',
        },
      ]);
    });

    it('커밋이 없는 빈 레포(409)는 빈 배열이다', async () => {
      fetchMock.mockResolvedValue(respond(409, { message: 'Git Repository is empty.' }));
      expect(await client.listCommits(listParams)).toEqual([]);
    });

    it('그 외 실패는 502로 변환한다', async () => {
      fetchMock.mockResolvedValue(respond(500, {}));
      await expect(client.listCommits(listParams)).rejects.toMatchObject({ status: 502 });
    });
  });

  describe('listWorkflowRuns', () => {
    const listParams = { owner: 'octocat', repo: 'hello-world', accessToken: 'gho_tok' };

    it('완료된 실행만 요청한다 (기본 20개)', async () => {
      fetchMock.mockResolvedValue(respond(200, { workflow_runs: [] }));
      await client.listWorkflowRuns(listParams);

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://api.github.com/repos/octocat/hello-world/actions/runs?per_page=20&status=completed',
      );
    });

    it('limit을 넘기면 per_page에 반영한다', async () => {
      fetchMock.mockResolvedValue(respond(200, { workflow_runs: [] }));
      await client.listWorkflowRuns({ ...listParams, limit: 5 });

      expect(fetchMock.mock.calls[0][0]).toContain('per_page=5');
    });

    it('success/failure만 남기고 나머지 결론은 버린다', async () => {
      fetchMock.mockResolvedValue(
        respond(200, {
          workflow_runs: [
            { conclusion: 'success', head_sha: 'a1', updated_at: '2026-09-10T00:00:00Z' },
            { conclusion: 'timed_out', head_sha: 'a2', updated_at: '2026-09-10T00:00:00Z' },
            { conclusion: 'cancelled', head_sha: 'a3', updated_at: '2026-09-10T00:00:00Z' },
            { conclusion: 'skipped', head_sha: 'a4', updated_at: '2026-09-10T00:00:00Z' },
          ],
        }),
      );

      const rows = await client.listWorkflowRuns(listParams);
      expect(rows.map((r) => [r.commit_sha, r.status])).toEqual([
        ['a1', 'success'],
        // timed_out은 failure로 합쳐진다 — 웹훅 인터프리터와 같은 규칙이다.
        ['a2', 'failure'],
      ]);
    });

    it('커밋 시각이 종료 시각보다 늦으면 버린다(지어내지 않는다)', async () => {
      fetchMock.mockResolvedValue(
        respond(200, {
          workflow_runs: [
            {
              conclusion: 'success',
              head_sha: 'a1',
              updated_at: '2026-09-10T00:00:00Z',
              head_commit: { timestamp: '2026-09-11T00:00:00Z' },
            },
          ],
        }),
      );

      const [row] = await client.listWorkflowRuns(listParams);
      expect(row.committed_at).toBeNull();
    });

    it('5xx면 502로 변환한다', async () => {
      fetchMock.mockResolvedValue(respond(500, {}));
      await expect(client.listWorkflowRuns(listParams)).rejects.toMatchObject({ status: 502 });
    });
  });

  describe('deleteRepo', () => {
    const del = { owner: 'octocat', repo: 'hello-world', accessToken: 'gho_tok' };

    it('문서에 명시된 경로로 DELETE한다', async () => {
      fetchMock.mockResolvedValue(respond(204));
      await client.deleteRepo(del);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.github.com/repos/octocat/hello-world');
      expect(init.method).toBe('DELETE');
    });

    it('204면 성공이다', async () => {
      fetchMock.mockResolvedValue(respond(204));
      await expect(client.deleteRepo(del)).resolves.toBeUndefined();
    });

    it('이미 지워진 레포(404)도 성공으로 본다', async () => {
      fetchMock.mockResolvedValue(respond(404, { message: 'Not Found' }));
      await expect(client.deleteRepo(del)).resolves.toBeUndefined();
    });

    it('403이면 delete_repo 권한을 언급하는 메시지로 막는다', async () => {
      fetchMock.mockResolvedValue(respond(403, { message: 'Resource not accessible' }));

      try {
        await client.deleteRepo(del);
        throw new Error('던졌어야 합니다');
      } catch (e) {
        expect((e as { code: string }).code).toBe('FORBIDDEN');
        const body = JSON.stringify((e as { getResponse(): unknown }).getResponse());
        expect(body).toContain('delete_repo');
      }
    });
  });

  describe('listDocs', () => {
    const listParams = { owner: 'octocat', repo: 'hello-world', accessToken: 'gho_tok' };

    const contentFile = (path: string, text: string) => ({
      path,
      content: Buffer.from(text, 'utf-8').toString('base64'),
      encoding: 'base64',
    });

    it('README 전용 엔드포인트를 먼저 부른다', async () => {
      fetchMock.mockResolvedValueOnce(respond(200, contentFile('README.md', '# 제목')));
      fetchMock.mockResolvedValueOnce(respond(404));

      await client.listDocs(listParams);

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.github.com/repos/octocat/hello-world/readme',
      );
    });

    it('README와 docs/ 없으면 빈 배열이다', async () => {
      fetchMock.mockResolvedValueOnce(respond(404));
      fetchMock.mockResolvedValueOnce(respond(404));

      await expect(client.listDocs(listParams)).resolves.toEqual([]);
    });

    it('base64 content를 utf-8 텍스트로 디코드한다', async () => {
      fetchMock.mockResolvedValueOnce(respond(200, contentFile('README.md', '# 제목입니다')));
      fetchMock.mockResolvedValueOnce(respond(404));

      const [doc] = await client.listDocs(listParams);
      expect(doc).toEqual({ path: 'README.md', content: '# 제목입니다' });
    });

    it('docs/ 폴더에서 .md 파일만 추가로 읽는다 (디렉터리·비-md는 건너뛴다)', async () => {
      fetchMock.mockResolvedValueOnce(respond(404)); // README 없음
      fetchMock.mockResolvedValueOnce(
        respond(200, [
          { type: 'file', name: 'architecture.md', path: 'docs/architecture.md' },
          { type: 'dir', name: 'assets', path: 'docs/assets' },
          { type: 'file', name: 'diagram.png', path: 'docs/diagram.png' },
        ]),
      );
      fetchMock.mockResolvedValueOnce(
        respond(200, contentFile('docs/architecture.md', '설계 문서')),
      );

      const docs = await client.listDocs(listParams);
      expect(docs).toEqual([{ path: 'docs/architecture.md', content: '설계 문서' }]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('docs/ 목록 조회가 404면 README만 남는다', async () => {
      fetchMock.mockResolvedValueOnce(respond(200, contentFile('README.md', '내용')));
      fetchMock.mockResolvedValueOnce(respond(404));

      const docs = await client.listDocs(listParams);
      expect(docs).toEqual([{ path: 'README.md', content: '내용' }]);
    });

    it('파일 하나가 20KB를 넘으면 잘라낸다', async () => {
      const huge = 'a'.repeat(25_000);
      fetchMock.mockResolvedValueOnce(respond(200, contentFile('README.md', huge)));
      fetchMock.mockResolvedValueOnce(respond(404));

      const [doc] = await client.listDocs(listParams);
      expect(doc.content.length).toBe(20_000);
    });

    it('합계가 60KB를 넘기면 그 이후 파일은 버린다', async () => {
      fetchMock.mockResolvedValueOnce(respond(200, contentFile('README.md', 'a'.repeat(20_000))));
      fetchMock.mockResolvedValueOnce(
        respond(200, [
          { type: 'file', name: 'a.md', path: 'docs/a.md' },
          { type: 'file', name: 'b.md', path: 'docs/b.md' },
          { type: 'file', name: 'c.md', path: 'docs/c.md' },
        ]),
      );
      fetchMock.mockResolvedValueOnce(respond(200, contentFile('docs/a.md', 'a'.repeat(20_000))));
      fetchMock.mockResolvedValueOnce(respond(200, contentFile('docs/b.md', 'a'.repeat(20_000))));
      fetchMock.mockResolvedValueOnce(respond(200, contentFile('docs/c.md', 'a'.repeat(20_000))));

      const docs = await client.listDocs(listParams);
      // README + a.md + b.md = 60KB 정확히. c.md를 더하면 넘으므로 버린다.
      expect(docs.map((d) => d.path)).toEqual(['README.md', 'docs/a.md', 'docs/b.md']);
    });
  });
});
