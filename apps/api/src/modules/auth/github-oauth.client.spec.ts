import { ConfigService } from '@nestjs/config';
import { GITHUB_API_VERSION, HttpGitHubOAuthClient } from './github-oauth.client';
import { ApiException } from '../../common/errors/api.exception';

/**
 * 실제 HTTP 클라이언트가 GitHub 문서의 계약대로 요청을 만드는지 검증한다.
 *
 * fake 어댑터로 플로우만 검증하면 "테스트는 통과하는데 자격증명을 넣으면 실패한다"는
 * 상황이 생긴다. 여기서는 fetch를 가로채 실제로 나가는 요청을 뜯어본다.
 * 근거: docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
 */
describe('HttpGitHubOAuthClient (실제 요청 형태)', () => {
  const config = {
    get: (key: string) =>
      ({ GITHUB_OAUTH_CLIENT_ID: 'cid', GITHUB_OAUTH_CLIENT_SECRET: 'csecret' })[key],
  } as unknown as ConfigService;

  const client = new HttpGitHubOAuthClient(config);
  const REDIRECT = 'http://localhost:8080/api/v1/auth/github/callback';

  let fetchMock: jest.Mock;

  const respond = (body: unknown, init: { status?: number; ok?: boolean } = {}) =>
    ({
      ok: init.ok ?? (init.status ?? 200) < 400,
      status: init.status ?? 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as Response;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(client['logger'], 'warn').mockImplementation(() => undefined);
  });

  describe('exchangeCode', () => {
    it('문서에 명시된 엔드포인트로 POST한다', async () => {
      fetchMock.mockResolvedValue(respond({ access_token: 'gho_x' }));
      await client.exchangeCode('the-code', REDIRECT);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://github.com/login/oauth/access_token');
      expect(init.method).toBe('POST');
    });

    it('Accept: application/json을 보낸다 (없으면 GitHub이 form 인코딩으로 응답한다)', async () => {
      fetchMock.mockResolvedValue(respond({ access_token: 'gho_x' }));
      await client.exchangeCode('the-code', REDIRECT);

      expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('application/json');
    });

    it('client_id/client_secret/code/redirect_uri를 모두 보낸다', async () => {
      fetchMock.mockResolvedValue(respond({ access_token: 'gho_x' }));
      await client.exchangeCode('the-code', REDIRECT);

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        client_id: 'cid',
        client_secret: 'csecret',
        code: 'the-code',
        redirect_uri: REDIRECT,
      });
    });

    it('응답의 access_token을 그대로 돌려준다', async () => {
      fetchMock.mockResolvedValue(respond({ access_token: 'gho_real', token_type: 'bearer' }));
      expect(await client.exchangeCode('c', REDIRECT)).toMatchObject({ accessToken: 'gho_real' });
    });

    it('만료가 꺼진 앱 응답은 만료 없는 토큰이 된다', async () => {
      fetchMock.mockResolvedValue(respond({ access_token: 'gho_real', token_type: 'bearer' }));
      expect(await client.exchangeCode('c', REDIRECT)).toEqual({
        accessToken: 'gho_real',
        refreshToken: null,
        expiresAt: null,
      });
    });

    it('만료가 켜진 앱의 refresh_token과 expires_in을 함께 보관한다', async () => {
      const before = Date.now();
      fetchMock.mockResolvedValue(
        respond({ access_token: 'gho_real', refresh_token: 'ghr_1', expires_in: 28800 }),
      );

      const tokens = await client.exchangeCode('c', REDIRECT);
      expect(tokens.refreshToken).toBe('ghr_1');
      // expires_in은 상대값(초)이다. 절대 시각으로 바꿔 두지 않으면 저장한 뒤 뜻이 없어진다.
      expect(tokens.expiresAt).toBeGreaterThanOrEqual(before + 28800 * 1000);
    });

    it('GitHub이 HTTP 200에 error를 담아 보내도 실패로 처리한다', async () => {
      // GitHub은 잘못된 code에도 200을 준다. status만 보면 통과시켜 버린다.
      fetchMock.mockResolvedValue(
        respond({ error: 'bad_verification_code', error_description: 'The code is incorrect.' }),
      );

      await expect(client.exchangeCode('bad', REDIRECT)).rejects.toThrow(ApiException);
    });

    it('error_description을 사용자 응답에 노출하지 않는다', async () => {
      fetchMock.mockResolvedValue(
        respond({ error: 'bad_verification_code', error_description: '내부 상세 정보' }),
      );

      try {
        await client.exchangeCode('bad', REDIRECT);
        throw new Error('던졌어야 합니다');
      } catch (e) {
        expect(JSON.stringify((e as ApiException).getResponse())).not.toContain('내부 상세 정보');
      }
    });

    it('5xx면 502로 변환한다', async () => {
      fetchMock.mockResolvedValue(respond({}, { status: 500 }));
      await expect(client.exchangeCode('c', REDIRECT)).rejects.toMatchObject({ status: 502 });
    });
  });

  describe('refresh', () => {
    it('grant_type=refresh_token으로 같은 토큰 엔드포인트에 POST한다', async () => {
      fetchMock.mockResolvedValue(respond({ access_token: 'gho_new' }));
      await client.refresh('ghr_1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://github.com/login/oauth/access_token');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({
        client_id: 'cid',
        client_secret: 'csecret',
        grant_type: 'refresh_token',
        refresh_token: 'ghr_1',
      });
    });

    it('새 토큰 한 벌을 돌려준다', async () => {
      fetchMock.mockResolvedValue(
        respond({ access_token: 'gho_new', refresh_token: 'ghr_new', expires_in: 28800 }),
      );

      const tokens = await client.refresh('ghr_1');
      expect(tokens.accessToken).toBe('gho_new');
      // GitHub은 갱신 때 refresh_token도 새로 준다. 흘리면 다음 갱신이 반드시 실패한다.
      expect(tokens.refreshToken).toBe('ghr_new');
      expect(tokens.expiresAt).not.toBeNull();
    });

    it('폐기된 refresh_token이면 재인증 오류를 낸다', async () => {
      // GitHub은 여기서도 HTTP 200에 error를 담아 보낸다.
      fetchMock.mockResolvedValue(
        respond({ error: 'bad_refresh_token', error_description: 'The refresh token is invalid.' }),
      );

      await expect(client.refresh('ghr_dead')).rejects.toMatchObject({
        status: 403,
        response: { error: { code: 'GITHUB_REAUTH_REQUIRED' } },
      });
    });
  });

  describe('fetchProfile', () => {
    it('Bearer 토큰과 API 버전 헤더를 붙여 /user를 호출한다', async () => {
      fetchMock.mockResolvedValue(respond({ login: 'octocat', email: null }));
      await client.fetchProfile('gho_tok');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.github.com/user');
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer gho_tok',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      });
    });

    it('이메일이 비공개면 null로 정규화한다', async () => {
      fetchMock.mockResolvedValue(respond({ login: 'octocat' }));
      expect(await client.fetchProfile('t')).toEqual({ login: 'octocat', email: null });
    });

    it('login이 없는 응답은 502로 막는다', async () => {
      fetchMock.mockResolvedValue(respond({ email: 'a@b.c' }));
      await expect(client.fetchProfile('t')).rejects.toMatchObject({ status: 502 });
    });
  });
});
