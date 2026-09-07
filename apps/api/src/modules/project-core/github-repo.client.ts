import { Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { GITHUB_API_VERSION } from '../auth/github-oauth.client';
import type { RepoRef } from './repo-url';

export interface CreateWebhookParams extends RepoRef {
  accessToken: string;
  /** 웹훅을 받을 우리 엔드포인트 주소. */
  deliveryUrl: string;
  /** HMAC 서명 생성에 쓰일 시크릿 원문. */
  secret: string;
}

export interface DeleteWebhookParams extends RepoRef {
  accessToken: string;
  hookId: number;
}

/** GitHub 레포 웹훅 관리 계약. 자격증명 없이도 플로우를 검증할 수 있도록 인터페이스로 둔다. */
export interface GitHubRepoClient {
  createWebhook(params: CreateWebhookParams): Promise<{ id: number }>;
  deleteWebhook(params: DeleteWebhookParams): Promise<void>;
}

export const GITHUB_REPO_CLIENT = Symbol('GITHUB_REPO_CLIENT');

/** 구독할 이벤트. 설계서 Part 4 §7.1이 "커밋/PR 이벤트"로 한정했다. */
export const WEBHOOK_EVENTS = ['push', 'pull_request'] as const;

@Injectable()
export class HttpGitHubRepoClient implements GitHubRepoClient {
  private readonly logger = new Logger(HttpGitHubRepoClient.name);

  async createWebhook(params: CreateWebhookParams): Promise<{ id: number }> {
    const res = await fetch(
      `https://api.github.com/repos/${params.owner}/${params.repo}/hooks`,
      {
        method: 'POST',
        headers: this.headers(params.accessToken),
        body: JSON.stringify({
          name: 'web',
          active: true,
          events: [...WEBHOOK_EVENTS],
          config: {
            url: params.deliveryUrl,
            content_type: 'json',
            secret: params.secret,
            insecure_ssl: '0',
          },
        }),
      },
    );

    if (res.status !== 201) {
      throw await this.toApiException(res, '웹훅 등록에 실패했습니다.');
    }

    const body = (await res.json()) as { id?: number };
    if (typeof body.id !== 'number') {
      throw new ApiException(ErrorCode.INTERNAL, 'GitHub 응답에 웹훅 id가 없습니다.', 502);
    }

    return { id: body.id };
  }

  async deleteWebhook(params: DeleteWebhookParams): Promise<void> {
    const res = await fetch(
      `https://api.github.com/repos/${params.owner}/${params.repo}/hooks/${params.hookId}`,
      { method: 'DELETE', headers: this.headers(params.accessToken) },
    );

    // 이미 GitHub에서 지워진 웹훅이면 404가 온다. 연동 해제라는 목적은 달성된 상태라
    // 실패로 취급하지 않는다 — 그렇지 않으면 우리 쪽 레코드를 영영 정리할 수 없다.
    if (res.status === 204 || res.status === 404) return;

    throw await this.toApiException(res, '웹훅 삭제에 실패했습니다.');
  }

  private headers(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'Content-Type': 'application/json',
    };
  }

  private async toApiException(res: Response, message: string): Promise<ApiException> {
    // GitHub의 원문 오류는 토큰 범위 등 내부 정보를 담을 수 있어 로그에만 남긴다.
    const detail = await res.text().catch(() => '');
    this.logger.warn(`GitHub API ${res.status}: ${detail.slice(0, 500)}`);

    if (res.status === 401 || res.status === 403) {
      return ApiException.forbidden('GitHub 권한이 부족합니다. 다시 로그인해 주세요.');
    }
    if (res.status === 404) {
      return ApiException.notFound('레포지토리를 찾을 수 없거나 접근 권한이 없습니다.');
    }
    return new ApiException(ErrorCode.INTERNAL, message, 502);
  }
}
