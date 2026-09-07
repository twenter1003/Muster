import { Injectable } from '@nestjs/common';
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
  /** 인가 코드를 액세스 토큰으로 교환한다. */
  exchangeCode(code: string): Promise<string>;

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

@Injectable()
export class HttpGitHubOAuthClient implements GitHubOAuthClient {
  constructor(private readonly config: ConfigService) {}

  async exchangeCode(code: string): Promise<string> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: this.config.get<string>('GITHUB_OAUTH_CLIENT_ID'),
        client_secret: this.config.get<string>('GITHUB_OAUTH_CLIENT_SECRET'),
        code,
      }),
    });

    if (!res.ok) {
      throw new ApiException(ErrorCode.INTERNAL, 'GitHub 토큰 교환에 실패했습니다.', 502);
    }

    // GitHub는 잘못된 code에도 200을 주고 본문에 error를 담는다.
    const body = (await res.json()) as { access_token?: string; error?: string };
    if (!body.access_token) {
      throw ApiException.unauthenticated('GitHub 인가 코드가 유효하지 않습니다.');
    }

    return body.access_token;
  }

  async fetchProfile(accessToken: string): Promise<GitHubProfile> {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
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
