import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { expiresAtFrom, type GitHubTokenSet } from './github-token-set';

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
  exchangeCode(code: string, redirectUri: string): Promise<GitHubTokenSet>;

  /**
   * refresh_token으로 새 토큰 한 벌을 받는다.
   *
   * 실패(폐기·만료된 refresh_token)는 되돌릴 수 없다 — 사용자가 GitHub에 다시
   * 로그인하는 것 외에는 방법이 없으므로 ApiException.githubReauthRequired를 던진다.
   */
  refresh(refreshToken: string): Promise<GitHubTokenSet>;

  /** 액세스 토큰으로 사용자 프로필을 읽는다. */
  fetchProfile(accessToken: string): Promise<GitHubProfile>;
}

export const GITHUB_OAUTH_CLIENT = Symbol('GITHUB_OAUTH_CLIENT');

/**
 * 요청할 스코프.
 * - read:user  — 로그인 시 프로필 조회
 * - admin:repo_hook — 웹훅 자동 등록 (설계서 Part 4 §3)
 * - repo — 환경 구성 빌드를 사용자 레포의 Actions에서 돌린다(workflow_dispatch)
 * - workflow — 그 빌드 워크플로 파일을 PR로 넣어 준다(EnvWorkflowInstaller). .github/workflows/
 *   아래 파일은 repo만으로는 쓸 수 없고 GitHub이 이 스코프를 따로 요구한다. 없으면 설치
 *   버튼이 403으로 죽고, 사용자는 문서를 보고 손으로 복사하는 수밖에 없다
 *
 * repo가 넓은 것은 알고 있다. 예전에는 "공개 레포 웹훅에 불필요하다"며 빼 두었는데,
 * 실행기(GitHubActionsExecutor)가 들어오면서 그 전제가 깨졌다: GitHub은
 * workflow_dispatch에 repo를 요구하고, 없으면 레포 권한이 아무리 충분해도 403이 난다.
 * 실제로 연동까지 마친 사용자가 실행에서만 403을 받고 원인을 찾지 못했다.
 *
 * 더 좁은 대안이 없다 — public_repo는 비공개 레포에서 못 쓰고, workflow는 워크플로
 * **파일 수정** 권한이지 실행 권한이 아니다. GitHub App으로 옮기면 actions:write만
 * 따로 받을 수 있지만, 그것은 인증 방식 자체를 바꾸는 일이라 여기서 할 수 없다.
 */
export const GITHUB_OAUTH_SCOPES = ['read:user', 'admin:repo_hook', 'repo', 'workflow'] as const;

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

  async exchangeCode(code: string, redirectUri: string): Promise<GitHubTokenSet> {
    return this.requestToken(
      {
        code,
        // authorize 때와 같은 값이어야 GitHub이 교환을 허용한다.
        redirect_uri: redirectUri,
      },
      () => ApiException.unauthenticated('GitHub 인가 코드가 유효하지 않습니다.'),
    );
  }

  async refresh(refreshToken: string): Promise<GitHubTokenSet> {
    return this.requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken }, () =>
      ApiException.githubReauthRequired(),
    );
  }

  /**
   * 토큰 엔드포인트 호출. 인가 코드 교환과 갱신이 같은 엔드포인트·같은 응답 형태를 쓰고,
   * 다른 것은 보내는 파라미터와 실패했을 때의 뜻뿐이다.
   */
  private async requestToken(
    params: Record<string, string>,
    onInvalid: () => ApiException,
  ): Promise<GitHubTokenSet> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: this.config.get<string>('GITHUB_OAUTH_CLIENT_ID'),
        client_secret: this.config.get<string>('GITHUB_OAUTH_CLIENT_SECRET'),
        ...params,
      }),
    });

    if (!res.ok) {
      throw new ApiException(ErrorCode.INTERNAL, 'GitHub 토큰 교환에 실패했습니다.', 502);
    }

    // GitHub은 잘못된 code에도 HTTP 200을 주고 본문에 error를 담는다.
    const body = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number | string;
      error?: string;
      error_description?: string;
    };

    if (!body.access_token) {
      // error_description은 사용자에게 노출하지 않고 로그에만 남긴다.
      this.logger.warn(
        `토큰 교환 실패: ${body.error ?? 'unknown'} — ${body.error_description ?? ''}`,
      );
      throw onInvalid();
    }

    // 만료가 꺼진 앱은 refresh_token·expires_in을 아예 보내지 않는다. 없는 것이 정상이다.
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: expiresAtFrom(body.expires_in),
    };
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
