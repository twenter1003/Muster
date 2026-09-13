import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { Session, User } from '../src/database/entities';
import { SECRET_STORE, type SecretStore } from '../src/common/secrets/secret-store';
import { OAuthStateService } from '../src/modules/auth/oauth-state.service';
import {
  GITHUB_OAUTH_CLIENT,
  type GitHubOAuthClient,
  type GitHubProfile,
} from '../src/modules/auth/github-oauth.client';
import { parseTokenSet, type GitHubTokenSet } from '../src/modules/auth/github-token-set';

/**
 * OAuth 플로우를 GitHub 자격증명 없이 검증한다.
 * 실제 GitHub 호출만 fake로 갈아끼우고, 나머지 경로(state 검증, 사용자 upsert,
 * 토큰 보관, 세션 발급, 리다이렉트)는 전부 실제 코드를 탄다.
 */
class FakeGitHubClient implements GitHubOAuthClient {
  profile: GitHubProfile = { login: 'octocat', email: 'octo@example.com' };
  lastCode: string | null = null;
  lastRedirectUri: string | null = null;
  issuedToken = 'gho_fake_access_token';
  /** 만료가 켜진 OAuth 앱을 흉내 낼 때 채운다. */
  issuedRefreshToken: string | null = null;
  issuedExpiresAt: number | null = null;

  async exchangeCode(code: string, redirectUri: string): Promise<GitHubTokenSet> {
    this.lastCode = code;
    this.lastRedirectUri = redirectUri;
    if (code === 'bad-code') throw new Error('invalid code');
    return {
      accessToken: this.issuedToken,
      refreshToken: this.issuedRefreshToken,
      expiresAt: this.issuedExpiresAt,
    };
  }

  async refresh(): Promise<GitHubTokenSet> {
    throw new Error('이 테스트는 갱신 경로를 타지 않는다');
  }

  async fetchProfile(): Promise<GitHubProfile> {
    return this.profile;
  }
}

describe('Phase 3 — GitHub OAuth 플로우 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let github: FakeGitHubClient;
  let state: OAuthStateService;
  let secrets: SecretStore;

  const http = () => request(app.getHttpServer());
  const login = `octocat-${Date.now()}`;

  beforeAll(async () => {
    github = new FakeGitHubClient();
    github.profile = { login, email: 'octo@example.com' };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GITHUB_OAUTH_CLIENT)
      .useValue(github)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    ds = app.get<DataSource>(DATA_SOURCE);
    state = app.get(OAuthStateService);
    secrets = app.get<SecretStore>(SECRET_STORE);
  }, 30_000);

  afterAll(async () => {
    const user = await ds.getRepository(User).findOneBy({ github_login: login });
    if (user) {
      if (user.github_token_ref) await secrets.delete(user.github_token_ref);
      await ds.getRepository(Session).delete({ user_id: user.id });
      await ds.getRepository(User).delete({ id: user.id });
    }
    await app.close();
  });

  describe('/auth/github/login', () => {
    it('인증 없이 접근 가능하고 GitHub로 302 리다이렉트한다', async () => {
      const res = await http().get('/api/v1/auth/github/login').expect(302);
      expect(res.headers.location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
    });

    it('요청 스코프는 read:user와 admin:repo_hook 둘뿐이다 (repo는 요청하지 않는다)', async () => {
      const res = await http().get('/api/v1/auth/github/login').expect(302);
      const scope = new URL(res.headers.location).searchParams.get('scope');
      expect(scope?.split(' ').sort()).toEqual(['admin:repo_hook', 'read:user']);
    });

    it('redirect_uri가 등록한 콜백 주소와 일치한다', async () => {
      const res = await http().get('/api/v1/auth/github/login').expect(302);
      expect(new URL(res.headers.location).searchParams.get('redirect_uri')).toBe(
        'http://localhost:8080/api/v1/auth/github/callback',
      );
    });

    it('매 요청마다 다른 state를 발급한다 (재사용 불가)', async () => {
      const a = await http().get('/api/v1/auth/github/login').expect(302);
      const b = await http().get('/api/v1/auth/github/login').expect(302);
      const s1 = new URL(a.headers.location).searchParams.get('state');
      const s2 = new URL(b.headers.location).searchParams.get('state');
      expect(s1).toBeTruthy();
      expect(s1).not.toBe(s2);
    });
  });

  describe('/auth/github/callback', () => {
    it('state가 없으면 401 — CSRF 방어가 실제로 막는다', async () => {
      const res = await http().get('/api/v1/auth/github/callback?code=abc').expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('위조된 state는 401이다', async () => {
      await http()
        .get('/api/v1/auth/github/callback?code=abc&state=forged.123.signature')
        .expect(401);
    });

    it('서명은 맞지만 변조된 state는 401이다', async () => {
      const valid = state.issue();
      const [nonce, issuedAt, sig] = valid.split('.');
      // nonce만 바꾸면 서명이 깨져야 한다.
      const tampered = `${nonce}X.${issuedAt}.${sig}`;
      await http()
        .get(`/api/v1/auth/github/callback?code=abc&state=${encodeURIComponent(tampered)}`)
        .expect(401);
    });

    it('code가 없으면 400이다', async () => {
      await http()
        .get(`/api/v1/auth/github/callback?state=${encodeURIComponent(state.issue())}`)
        .expect(400);
    });

    it('정상 콜백이면 세션을 HttpOnly 쿠키로 심고 프론트로 리다이렉트한다', async () => {
      const res = await http()
        .get(
          `/api/v1/auth/github/callback?code=good-code&state=${encodeURIComponent(state.issue())}`,
        )
        .expect(302);

      // @Res({ passthrough: true })와 @Redirect()가 함께 동작하는지가 이 단언의 핵심이다.
      // passthrough 없이 res를 잡으면 리다이렉트가 사라지고, 헤더를 직접 쓰지 않으면 쿠키가 없다.
      const setCookie = String(res.headers['set-cookie']);
      expect(setCookie).toMatch(/muster_session=[^;]+/);
      expect(setCookie).toContain('HttpOnly');
      // Lax면 OAuth 콜백(top-level 네비게이션)에서는 실리고 교차 사이트 요청에서는 빠진다.
      expect(setCookie).toContain('SameSite=Lax');

      const location = new URL(res.headers.location);
      expect(location.origin).toBe('http://localhost:5173');
      // 토큰이 URL에 전혀 남지 않아야 한다 — 쿼리스트링도 fragment도 비어 있어야 한다.
      expect(location.search).toBe('');
      expect(location.hash).toBe('');

      // 심어 준 쿠키가 실제로 인증에 쓰이는지 끝까지 확인한다.
      const cookie = setCookie.split(';')[0];
      const me = await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
      expect(me.body.github_login).toBe(login);
    });

    /**
     * GitHub은 authorize 때의 redirect_uri와 토큰 교환 때의 값이 다르면 교환을 거부한다.
     * 두 값이 따로 계산되면 자격증명을 채운 뒤에야 터지므로 여기서 루프를 닫는다.
     */
    it('토큰 교환에 authorize와 똑같은 redirect_uri를 보낸다', async () => {
      const authorize = await http().get('/api/v1/auth/github/login').expect(302);
      const sentToGitHub = new URL(authorize.headers.location).searchParams.get('redirect_uri');

      await http()
        .get(
          `/api/v1/auth/github/callback?code=good-code&state=${encodeURIComponent(state.issue())}`,
        )
        .expect(302);

      expect(github.lastRedirectUri).toBe(sentToGitHub);
      expect(github.lastRedirectUri).toBe('http://localhost:8080/api/v1/auth/github/callback');
    });

    it('USERS 레코드가 생성되고 GitHub 토큰 원문은 DB에 없다', async () => {
      const user = await ds.getRepository(User).findOneBy({ github_login: login });
      expect(user).not.toBeNull();
      expect(user?.github_token_ref).toMatch(/^file:\/\//);

      // 컬럼 어디에도 토큰 원문이 없어야 한다.
      const rows = (await ds.query(`SELECT * FROM users WHERE github_login = $1`, [
        login,
      ])) as Array<Record<string, unknown>>;
      expect(JSON.stringify(rows)).not.toContain(github.issuedToken);
    });

    it('토큰 원문은 시크릿 저장소에서만 꺼낼 수 있다', async () => {
      const user = await ds.getRepository(User).findOneBy({ github_login: login });
      const stored = parseTokenSet((await secrets.get(user!.github_token_ref!))!);
      expect(stored.accessToken).toBe(github.issuedToken);
    });

    it('같은 사용자가 다시 로그인해도 USERS가 중복 생성되지 않는다', async () => {
      await http()
        .get(
          `/api/v1/auth/github/callback?code=good-code&state=${encodeURIComponent(state.issue())}`,
        )
        .expect(302);

      const count = await ds.getRepository(User).countBy({ github_login: login });
      expect(count).toBe(1);
    });
  });

  describe('state 서비스', () => {
    it('발급한 state는 검증을 통과한다', () => {
      expect(state.verify(state.issue())).toBe(true);
    });

    it('빈 state는 거부한다', () => {
      expect(state.verify(undefined)).toBe(false);
      expect(state.verify('')).toBe(false);
    });

    it('형식이 다른 state는 거부한다', () => {
      expect(state.verify('a.b')).toBe(false);
      expect(state.verify('a.b.c.d')).toBe(false);
    });
  });
});
