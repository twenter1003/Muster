import { Injectable, Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { GitIntegration } from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { GITHUB_API_VERSION } from '../auth/github-oauth.client';
import { GitHubTokenService } from '../auth/github-token.service';
import { parseRepoUrl } from '../project-core/repo-url';
import type { EnvConfigExecutor, StartExecutionParams } from './env-config-executor';

/**
 * 사용자 레포에 있어야 하는 워크플로 파일.
 *
 * 기본 브랜치에 직접 커밋하지는 않는다 — 연동이 허락한 것은 "이 레포와 일한다"이지
 * "이 레포를 고친다"가 아니다. 대신 EnvWorkflowInstaller가 PR을 열어 주고, 무엇이
 * 들어가는지 본 사람이 머지한다. 손으로 넣고 싶으면 files/templates에 같은 파일이 있다.
 */
export const WORKFLOW_FILE = 'muster-env-build.yml';

/**
 * 환경 구성을 **사용자 레포의 GitHub Actions**에서 빌드한다.
 *
 * 왜 여기인가: 우리가 이미 그 레포와 연동돼 있고(토큰·웹훅·서명 검증 경로가 다 있다),
 * 빌드 결과가 웹훅으로 되돌아오는 길도 이미 깔려 있다. 새 인프라(Cloud Build + Pub/Sub,
 * 또는 실행 전용 워커)를 세우지 않고 실행을 붙일 수 있는 유일한 경로였다.
 *
 * 도커 빌드를 우리 컨테이너에서 직접 하지 않는 이유는 명확하다. Cloud Run에는 도커
 * 데몬이 없고, 요청 타임아웃은 60초이며, 파일시스템은 메모리다.
 */
@Injectable()
export class GitHubActionsExecutor implements EnvConfigExecutor {
  private readonly logger = new Logger(GitHubActionsExecutor.name);

  constructor(
    @InjectRepository(GitIntegration) private readonly integrations: Repository<GitIntegration>,
    private readonly tokens: GitHubTokenService,
  ) {}

  async start(params: StartExecutionParams): Promise<void> {
    const integration = await this.integrations.findOneBy({ project_id: params.projectId });
    if (!integration) {
      // 실행할 곳이 없다는 뜻이라 사용자가 고칠 수 있는 문제다. 500으로 뭉개지 않는다.
      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        '실행하려면 먼저 프로젝트에 GitHub 레포를 연동해야 합니다.',
        400,
      );
    }

    const { owner, repo } = parseRepoUrl(integration.repo_url);
    const accessToken = await this.tokens.accessTokenFor(params.userId);
    const ref = await this.defaultBranch(owner, repo, accessToken);

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
          'Content-Type': 'application/json',
        },
        // dispatches는 ref가 필수다. 연동이 레포 단위라 브랜치를 따로 받지 않으므로
        // 레포에 물어본 기본 브랜치를 쓴다. 'main'으로 넘겨짚지 않는 이유는, 기본이
        // master나 develop인 레포에서 조용히 422가 나기 때문이다.
        body: JSON.stringify({ ref, inputs: { env_config_id: params.envConfigId } }),
      },
    );

    /*
     * 2xx면 성공이다. 204만 보다가 크게 데였다 — GitHub이 200에 workflow_run_id를 담아
     * 돌려주기 시작했는데, 그것을 실패로 읽어 **이미 돌고 있는 실행을 failed로 뒤집었다.**
     * 화면에는 실패로 남고 워크플로는 계속 도는, 최악의 어긋남이었다.
     *
     * 특정 코드 하나에 성공을 거는 것 자체가 잘못이었다. 성공의 정의는 2xx다.
     */
    if (res.ok) return;

    // 무엇을 고쳐야 하는지가 상태 코드마다 다르다. 하나로 뭉치면 사용자가 워크플로 파일이
    // 없는 것인지 권한이 없는 것인지 알 수 없다.
    throw await this.failure(res, owner, repo);
  }

  /** 레포의 기본 브랜치. 못 읽으면 실행을 시작할 수 없다 — ref 없이는 dispatch가 불가능하다. */
  private async defaultBranch(owner: string, repo: string, accessToken: string): Promise<string> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
    });
    if (!res.ok) throw await this.failure(res, owner, repo);

    const branch = ((await res.json()) as { default_branch?: unknown }).default_branch;
    if (typeof branch !== 'string' || branch === '') {
      throw new ApiException(ErrorCode.INTERNAL, '레포의 기본 브랜치를 확인할 수 없습니다.', 502);
    }
    return branch;
  }

  private async failure(res: Response, owner: string, repo: string): Promise<ApiException> {
    const detail = await res.text().catch(() => '');
    this.logger.warn(`워크플로 실행 요청 실패 ${owner}/${repo} (HTTP ${res.status}) ${detail}`);

    if (res.status === 404) {
      return new ApiException(
        ErrorCode.VALIDATION_FAILED,
        `${owner}/${repo}에 ${WORKFLOW_FILE} 워크플로가 없습니다. 환경 구성 탭의 「워크플로 설치」로 넣어 주세요.`,
        400,
      );
    }
    if (res.status === 403) {
      /**
       * 재로그인을 먼저 안내하는 이유: 실행에 필요한 repo 스코프는 나중에 추가됐고,
       * 그 전에 로그인한 토큰에는 없다. 그런 토큰으로는 레포 권한이 완벽해도 403이
       * 나는데, 사용자가 볼 수 있는 곳에는 단서가 없어 레포 설정만 계속 뒤지게 된다.
       * 스코프는 응답 헤더로 확인할 수 있으므로 원인이 그것일 때만 짚어 준다.
       */
      const scopes = res.headers.get('x-oauth-scopes') ?? '';
      const missingRepoScope =
        scopes.length > 0 && !scopes.split(',').some((s) => s.trim() === 'repo');

      return missingRepoScope
        ? new ApiException(
            ErrorCode.GITHUB_REAUTH_REQUIRED,
            'GitHub 재인증이 필요합니다. 로그아웃 후 다시 로그인해 주세요 — 이 계정의 토큰에는 Actions 실행 권한(repo)이 없습니다.',
            403,
          )
        : new ApiException(
            ErrorCode.FORBIDDEN,
            `${owner}/${repo}의 Actions를 실행할 권한이 없습니다. 레포 권한과 Actions 활성화 여부를 확인해 주세요.`,
            403,
          );
    }
    if (res.status === 422) {
      // 브랜치가 없거나 워크플로가 workflow_dispatch를 선언하지 않은 경우다.
      return new ApiException(
        ErrorCode.VALIDATION_FAILED,
        `${owner}/${repo}의 워크플로를 실행할 수 없습니다. 기본 브랜치에 workflow_dispatch 트리거가 있는지 확인해 주세요.`,
        400,
      );
    }
    if (res.status === 401) {
      // GitHub이 토큰 자체를 거부했다. 갱신으로 될 일이 아니라 다시 받아야 한다.
      return new ApiException(
        ErrorCode.GITHUB_REAUTH_REQUIRED,
        'GitHub 재인증이 필요합니다. 로그아웃 후 다시 로그인해 주세요 — GitHub이 저장된 토큰을 거부했습니다.',
        403,
      );
    }
    return new ApiException(
      ErrorCode.INTERNAL,
      // 상태 코드를 메시지에 남긴다. 이게 없으면 예상 밖 실패마다 사용자가 서버 로그를
      // 떠다 주어야만 원인을 좁힐 수 있다 — 실제로 그렇게 한 번 막혔다.
      `GitHub Actions 실행 요청이 실패했습니다 (GitHub 응답 ${res.status}).`,
      502,
    );
  }
}
