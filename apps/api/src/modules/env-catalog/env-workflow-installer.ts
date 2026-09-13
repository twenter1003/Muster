import { Injectable, Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { GitIntegration } from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { GITHUB_API_VERSION } from '../auth/github-oauth.client';
import { GitHubTokenService } from '../auth/github-token.service';
import { parseRepoUrl } from '../project-core/repo-url';
import { ENV_WORKFLOW_CONTENT, ENV_WORKFLOW_PATH } from './env-workflow-template';

/** 우리가 만드는 브랜치 이름. 고정이라 두 번 눌러도 브랜치가 늘지 않는다. */
export const INSTALL_BRANCH = 'muster/env-build-workflow';

export interface InstallResult {
  /** 이미 기본 브랜치에 있으면 PR을 열지 않는다. */
  already_installed: boolean;
  /** 새로 열었거나 이미 열려 있던 PR. 이미 설치돼 있으면 null. */
  pull_request_url: string | null;
}

/**
 * 실행용 워크플로 파일을 사용자 레포에 **PR로** 넣는다.
 *
 * 왜 PR인가: 이 파일이 없으면 실행이 404로 죽는데, 그때 화면이 할 수 있는 말이 "문서를 보고
 * 손으로 복사하라"뿐이었다. 그건 온보딩이 아니다. 그렇다고 남의 기본 브랜치에 말없이 커밋할
 * 수는 없다 — 연동이 허락한 것은 "이 레포와 일한다"이지 "이 레포를 고친다"가 아니다.
 * PR은 그 사이다: 우리가 준비하고, 무엇이 들어가는지 본 사람이 머지한다.
 *
 * 두 번 눌러도 안전하다. 브랜치 이름이 고정이라 이미 있으면 그 위에 덮어쓰고, 열린 PR이
 * 있으면 그것을 돌려준다. 기본 브랜치에 이미 파일이 있으면 아무것도 하지 않는다.
 */
@Injectable()
export class EnvWorkflowInstaller {
  private readonly logger = new Logger(EnvWorkflowInstaller.name);

  constructor(
    @InjectRepository(GitIntegration) private readonly integrations: Repository<GitIntegration>,
    private readonly tokens: GitHubTokenService,
  ) {}

  async install(projectId: string, userId: string): Promise<InstallResult> {
    const integration = await this.integrations.findOneBy({ project_id: projectId });
    if (!integration) {
      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        '워크플로를 넣으려면 먼저 프로젝트에 GitHub 레포를 연동해야 합니다.',
        400,
      );
    }

    const { owner, repo } = parseRepoUrl(integration.repo_url);
    const token = await this.tokens.accessTokenFor(userId);

    const base = await this.defaultBranch(owner, repo, token);

    // 기본 브랜치에 이미 있으면 끝이다. 여기서 멈추지 않으면 아무것도 바꾸지 않는 PR이 열린다.
    if (await this.fileExists(owner, repo, token, base)) {
      return { already_installed: true, pull_request_url: null };
    }

    await this.ensureBranch(owner, repo, token, base);
    await this.putFile(owner, repo, token);
    return {
      already_installed: false,
      pull_request_url: await this.openPr(owner, repo, token, base),
    };
  }

  private async defaultBranch(owner: string, repo: string, token: string): Promise<string> {
    const res = await this.call('GET', `/repos/${owner}/${repo}`, token);
    if (!res.ok) throw await this.failure(res, owner, repo);

    const branch = ((await res.json()) as { default_branch?: unknown }).default_branch;
    if (typeof branch !== 'string' || branch === '') {
      throw new ApiException(ErrorCode.INTERNAL, '레포의 기본 브랜치를 확인할 수 없습니다.', 502);
    }
    return branch;
  }

  private async fileExists(
    owner: string,
    repo: string,
    token: string,
    ref: string,
  ): Promise<boolean> {
    const res = await this.call(
      'GET',
      `/repos/${owner}/${repo}/contents/${ENV_WORKFLOW_PATH}?ref=${encodeURIComponent(ref)}`,
      token,
    );
    if (res.status === 404) return false;
    if (!res.ok) throw await this.failure(res, owner, repo);
    return true;
  }

  /** 브랜치를 기본 브랜치 끝에서 만든다. 이미 있으면(422) 그대로 쓴다. */
  private async ensureBranch(
    owner: string,
    repo: string,
    token: string,
    base: string,
  ): Promise<void> {
    const head = await this.call(
      'GET',
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(base)}`,
      token,
    );
    if (!head.ok) throw await this.failure(head, owner, repo);
    const sha = ((await head.json()) as { object?: { sha?: string } }).object?.sha;
    if (typeof sha !== 'string') {
      throw new ApiException(ErrorCode.INTERNAL, '기본 브랜치의 커밋을 읽지 못했습니다.', 502);
    }

    const created = await this.call('POST', `/repos/${owner}/${repo}/git/refs`, token, {
      ref: `refs/heads/${INSTALL_BRANCH}`,
      sha,
    });
    // 422는 "이미 있다"다. 앞선 설치 시도가 남긴 브랜치이므로 실패로 볼 이유가 없다.
    if (!created.ok && created.status !== 422) throw await this.failure(created, owner, repo);
  }

  /** 파일을 쓴다. 브랜치에 이미 있으면 그 blob sha를 실어야 갱신이 된다. */
  private async putFile(owner: string, repo: string, token: string): Promise<void> {
    const existing = await this.call(
      'GET',
      `/repos/${owner}/${repo}/contents/${ENV_WORKFLOW_PATH}?ref=${encodeURIComponent(INSTALL_BRANCH)}`,
      token,
    );
    const sha =
      existing.status === 200 ? ((await existing.json()) as { sha?: string }).sha : undefined;

    const res = await this.call(
      'PUT',
      `/repos/${owner}/${repo}/contents/${ENV_WORKFLOW_PATH}`,
      token,
      {
        message: 'ci: Muster 환경 구성 빌드 워크플로를 추가한다',
        content: Buffer.from(ENV_WORKFLOW_CONTENT, 'utf8').toString('base64'),
        branch: INSTALL_BRANCH,
        ...(sha !== undefined ? { sha } : {}),
      },
    );
    if (!res.ok) throw await this.failure(res, owner, repo);
  }

  /** PR을 연다. 같은 브랜치의 PR이 이미 있으면(422) 그것을 찾아 돌려준다. */
  private async openPr(owner: string, repo: string, token: string, base: string): Promise<string> {
    const res = await this.call('POST', `/repos/${owner}/${repo}/pulls`, token, {
      title: 'Muster 환경 구성 빌드 워크플로 추가',
      head: INSTALL_BRANCH,
      base,
      body:
        'Muster가 환경 구성을 이 레포의 Actions에서 빌드하려면 이 워크플로가 필요합니다.\n\n' +
        '- `workflow_dispatch`로만 돌고, Muster가 실행할 때만 트리거됩니다.\n' +
        '- 레포 내용을 읽기만 합니다(`permissions: contents: read`).\n' +
        '- 이미지를 어디에도 올리지 않습니다(`push: false`) — 빌드가 되는지만 확인합니다.\n\n' +
        '`run-name`의 형식은 Muster가 결과를 대조하는 단서이므로 바꾸지 마세요.\n' +
        '빌드에는 레포 루트에 `Dockerfile`이 있어야 합니다.',
    });

    if (res.ok) {
      const url = ((await res.json()) as { html_url?: string }).html_url;
      if (typeof url === 'string') return url;
      throw new ApiException(ErrorCode.INTERNAL, 'PR은 열렸지만 주소를 읽지 못했습니다.', 502);
    }
    if (res.status !== 422) throw await this.failure(res, owner, repo);

    // 422의 가장 흔한 원인은 "이 브랜치의 PR이 이미 열려 있다"다. 새로 열 수 없으니 찾아 준다.
    const open = await this.call(
      'GET',
      `/repos/${owner}/${repo}/pulls?head=${owner}:${INSTALL_BRANCH}&state=open`,
      token,
    );
    if (open.ok) {
      const [first] = (await open.json()) as { html_url?: string }[];
      if (typeof first?.html_url === 'string') return first.html_url;
    }
    throw new ApiException(
      ErrorCode.VALIDATION_FAILED,
      `${owner}/${repo}에 PR을 열지 못했습니다. ${INSTALL_BRANCH} 브랜치를 확인해 주세요.`,
      400,
    );
  }

  private call(method: string, path: string, token: string, body?: unknown): Promise<Response> {
    return fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  private async failure(res: Response, owner: string, repo: string): Promise<ApiException> {
    const detail = await res.text().catch(() => '');
    this.logger.warn(`워크플로 설치 실패 ${owner}/${repo} (HTTP ${res.status}) ${detail}`);

    if (res.status === 403 || res.status === 404) {
      /*
       * 워크플로 파일을 쓰려면 repo만으로는 안 되고 workflow 스코프가 따로 필요하다.
       * 그 스코프는 나중에 추가됐으므로 옛 토큰으로는 반드시 여기서 막힌다 — 사용자가
       * 고칠 곳은 레포 설정이 아니라 로그인이다. 404가 섞이는 이유는 GitHub이 권한 없는
       * 비공개 레포를 없는 것처럼 답하기 때문이다.
       */
      const scopes = res.headers.get('x-oauth-scopes') ?? '';
      const missing = scopes.length > 0 && !scopes.split(',').some((s) => s.trim() === 'workflow');

      return missing
        ? new ApiException(
            ErrorCode.GITHUB_REAUTH_REQUIRED,
            'GitHub 재인증이 필요합니다. 로그아웃 후 다시 로그인해 주세요 — 이 계정의 토큰에는 워크플로 파일을 쓸 권한(workflow)이 없습니다.',
            403,
          )
        : new ApiException(
            ErrorCode.FORBIDDEN,
            `${owner}/${repo}에 쓸 권한이 없습니다. 레포 권한을 확인해 주세요.`,
            403,
          );
    }

    if (res.status === 401) {
      return new ApiException(
        ErrorCode.GITHUB_REAUTH_REQUIRED,
        'GitHub 재인증이 필요합니다. 로그아웃 후 다시 로그인해 주세요 — GitHub이 저장된 토큰을 거부했습니다.',
        403,
      );
    }
    if (res.status === 409) {
      // 커밋이 하나도 없는 레포다. 기본 브랜치가 없으니 브랜치를 딸 곳도 없다.
      return new ApiException(
        ErrorCode.VALIDATION_FAILED,
        `${owner}/${repo}가 비어 있습니다. 파일을 하나라도 커밋한 뒤 다시 시도해 주세요.`,
        400,
      );
    }
    return new ApiException(
      ErrorCode.INTERNAL,
      // 상태 코드를 남기는 이유는 executor 쪽 주석과 같다.
      `워크플로 설치 요청이 실패했습니다 (GitHub 응답 ${res.status}).`,
      502,
    );
  }
}
