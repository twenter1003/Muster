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
        events: ['push', 'pull_request'],
        config: {
          url: 'http://localhost:8080/api/v1/webhooks/github',
          content_type: 'json',
          secret: 'the-secret',
          insecure_ssl: '0',
        },
      });
    });

    it('구독 이벤트는 push와 pull_request뿐이다', () => {
      expect([...WEBHOOK_EVENTS]).toEqual(['push', 'pull_request']);
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
});
