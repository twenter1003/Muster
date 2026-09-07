import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';

export interface GitHubProfile {
  login: string;
  email: string | null;
}

/**
 * GitHub OAuth 호출 계약.
 *
 * 인터페이스로 분리한 이유: 자격증명 없이도 콜백 플로우 전체를 fake로 검증할 수 있어야 하고,
 * 나중에 실제 자격증명이 들어와도 호출부가 바뀌지 않아야 하기 때문이다.
 */
export interface GitHubOAuthClient {
  /**
   * 인가 코드를 액세스 토큰으로 교환한다.
   *
   * redirectUri를 인자로 받는 이유: GitHub은 authorize 때 보낸 redirect_uri와
   * 교환 때 보낸 값이 일치하는지 검증한다. 두 곳에서 각자 계산하면 어긋날 수 있어
   * 호출자가 같은 값을 넘기도록 계약에 박아 둔다.
   */
  exchangeCode(code: string, redirectUri: string): Promise<string>;

  /** 액세스 토큰으로 사용자 프로필을 읽는다. */
  fetchProfile(accessToken: string): Promise<GitHubProfile>;
}

export const GITHUB_OAUTH_CLIENT = Symbol('GITHUB_OAUTH_CLIENT');

/**
 * 요청할 스코프.
 * - read:user  — 로그인 시 프로필 조회
 * - admin:repo_hook — 웹훅 자동 등록 (설계서 Part 4 §3)
 *
 * repo(코드 읽기)는 요청하지 않는다. 공개 레포 웹훅에는 불필요하고,
 * 필요 이상의 권한을 받아 두면 토큰 유출 시 피해가 커진다.
 */
export const GITHUB_OAUTH_SCOPES = ['read:user', 'admin:repo_hook'] as const;

/**
 * GitHub REST API 버전. 헤더를 생략하면 GitHub이 2022-11-28로 처리하는데,
 * 그 버전은 2028-03-10까지만 지원된다. 지원되지 않는 값을 보내면 410을 받으므로
 * 버전을 올릴 때는 반드시 지원 목록을 확인해야 한다.
 */
export const GITHUB_API_VERSION = '2026-03-10';

@Injectable()
export class HttpGitHubOAuthClient implements GitHubOAuthClient {
  constructor(private readonly config: ConfigService) {}

  private readonly logger = new Logger(HttpGitHubOAuthClient.name);

  async exchangeCode(code: string, redirectUri: string): Promise<string> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: this.config.get<string>('GITHUB_OAUTH_CLIENT_ID'),
        client_secret: this.config.get<string>('GITHUB_OAUTH_CLIENT_SECRET'),
        code,
        // authorize 때와 같은 값이어야 GitHub이 교환을 허용한다.
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      throw new ApiException(ErrorCode.INTERNAL, 'GitHub 토큰 교환에 실패했습니다.', 502);
    }

    // GitHub은 잘못된 code에도 HTTP 200을 주고 본문에 error를 담는다.
    const body = (await res.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!body.access_token) {
      // error_description은 사용자에게 노출하지 않고 로그에만 남긴다.
      this.logger.warn(`토큰 교환 실패: ${body.error ?? 'unknown'} — ${body.error_description ?? ''}`);
      throw ApiException.unauthenticated('GitHub 인가 코드가 유효하지 않습니다.');
    }

    return body.access_token;
  }

  async fetchProfile(accessToken: string): Promise<GitHubProfile> {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
    });

    if (!res.ok) {
      throw new ApiException(ErrorCode.INTERNAL, 'GitHub 프로필 조회에 실패했습니다.', 502);
    }

    const body = (await res.json()) as { login?: string; email?: string | null };
    if (!body.login) {
      throw new ApiException(ErrorCode.INTERNAL, 'GitHub 응답에 login이 없습니다.', 502);
    }

    return { login: body.login, email: body.email ?? null };
  }
}
