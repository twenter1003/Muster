import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { DeploymentEvent, GitIntegration, ProjectMember } from '../../database/entities';
import { SECRET_STORE, type SecretStore } from '../../common/secrets/secret-store';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { GitHubTokenService } from '../auth/github-token.service';
import {
  GITHUB_REPO_CLIENT,
  type CommitSummary,
  type GitHubRepoClient,
} from './github-repo.client';
import { parseRepoUrl, repoUrlOf } from './repo-url';

@Injectable()
export class GitIntegrationService {
  private readonly logger = new Logger(GitIntegrationService.name);

  constructor(
    @InjectRepository(GitIntegration) private readonly integrations: Repository<GitIntegration>,
    @InjectRepository(DeploymentEvent)
    private readonly deploymentEvents: Repository<DeploymentEvent>,
    @Inject(GITHUB_REPO_CLIENT) private readonly github: GitHubRepoClient,
    private readonly githubTokens: GitHubTokenService,
    @Inject(SECRET_STORE) private readonly secrets: SecretStore,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 설계서 Part 4 §3 — 레포 연동 등록. 웹훅을 자동으로 걸고 시크릿은 저장소에 둔다.
   *
   * 순서가 중요하다: GitHub에 웹훅을 먼저 만들고 그 다음 DB에 쓴다. 반대로 하면
   * 웹훅 등록이 실패했는데 연동은 존재하는 상태가 남아, 이후 이벤트가 영영 오지 않는데도
   * 사용자에게는 연동된 것처럼 보인다.
   */
  async connect(projectId: string, userId: string, repoUrl: string): Promise<GitIntegration> {
    if (await this.integrations.countBy({ project_id: projectId })) {
      throw ApiException.conflict(
        ErrorCode.CONFLICT,
        '이미 연동된 레포지토리가 있습니다. 먼저 해제해 주세요.',
      );
    }

    const { owner, repo } = parseRepoUrl(repoUrl);
    const accessToken = await this.githubTokenOf(userId);

    // 웹훅 시크릿은 여기서 생성한다. 원문은 GitHub과 시크릿 저장소에만 존재한다.
    const secret = randomBytes(32).toString('hex');

    const hook = await this.github.createWebhook({
      owner,
      repo,
      accessToken,
      deliveryUrl: this.deliveryUrl(),
      secret,
    });

    // 웹훅이 만들어진 뒤에야 시크릿을 보관하고 레코드를 남긴다.
    const secretRef = await this.secrets.put(`webhook-secret-${projectId}`, secret);

    let saved: GitIntegration;
    try {
      saved = await this.integrations.save(
        this.integrations.create({
          project_id: projectId,
          repo_url: repoUrlOf(`${owner}/${repo}`),
          webhook_secret_ref: secretRef,
          webhook_id: String(hook.id),
        }),
      );
    } catch (error) {
      // DB 저장이 실패하면 방금 만든 웹훅이 GitHub에 고아로 남는다. 되돌린다.
      await this.github
        .deleteWebhook({ owner, repo, accessToken, hookId: hook.id })
        .catch((cleanupError: unknown) =>
          this.logger.error(`고아 웹훅 정리 실패 (hook ${hook.id}): ${String(cleanupError)}`),
        );
      await this.secrets.delete(secretRef).catch(() => undefined);
      throw error;
    }

    // 연동 성공 자체를 막으면 안 되는 부가 작업이다 — 실패해도 로그만 남기고 넘어간다.
    // 웹훅은 지금부터의 이벤트만 받으므로, 이게 없으면 "방금 가져온 프로젝트"의 배포·워크플로
    // 카드가 다음 push/Actions 실행 전까지 계속 비어 보인다.
    await this.backfillWorkflowHistory(projectId, owner, repo, accessToken).catch(
      (error: unknown) =>
        this.logger.warn(`워크플로 이력 백필 실패 (project ${projectId}): ${String(error)}`),
    );

    return saved;
  }

  /**
   * `listWorkflowRuns`가 웹훅과 같은 판정 규칙으로 골라낸 완료 실행들을 DEPLOYMENT_EVENTS에
   * 그대로 적재한다. 헬스 스냅샷은 여기서 다시 계산하지 않는다 — Ingest가 자기 트랜잭션
   * 안에서만 재계산하도록 되어 있고(Part 2 §8), 그 경계를 여기서 넘으면 "Ingest를 분리해도
   * 이 파일이 메시지 스키마"라는 전제가 깨진다. 다음 실제 웹훅이 오면 이 백필 행까지 포함해
   * 자연스럽게 계산된다.
   */
  private async backfillWorkflowHistory(
    projectId: string,
    owner: string,
    repo: string,
    accessToken: string,
  ): Promise<void> {
    const runs = await this.github.listWorkflowRuns({ owner, repo, accessToken });
    if (runs.length === 0) return;

    await this.deploymentEvents.insert(
      runs.map((r) => ({
        project_id: projectId,
        kind: 'workflow_run' as const,
        status: r.status,
        commit_sha: r.commit_sha,
        committed_at: r.committed_at ? new Date(r.committed_at) : null,
        occurred_at: new Date(r.occurred_at),
      })),
    );
  }

  /** 설계서 Part 4 §3 — 연동 해제. GitHub 웹훅과 시크릿도 함께 정리한다. */
  async disconnect(projectId: string, userId: string): Promise<void> {
    const integration = await this.integrations.findOneBy({ project_id: projectId });
    if (!integration) throw ApiException.notFound('연동된 레포지토리가 없습니다.');

    const { owner, repo } = parseRepoUrl(integration.repo_url);

    if (integration.webhook_id) {
      const accessToken = await this.githubTokenOf(userId);
      await this.github.deleteWebhook({
        owner,
        repo,
        accessToken,
        hookId: Number(integration.webhook_id),
      });
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(GitIntegration, { id: integration.id });
    });

    // 레코드가 사라진 뒤에 시크릿을 폐기한다. 순서가 반대면 시크릿만 없는 연동이 남는다.
    await this.secrets.delete(integration.webhook_secret_ref);
  }

  async findByProject(projectId: string): Promise<GitIntegration | null> {
    return this.integrations.findOneBy({ project_id: projectId });
  }

  /**
   * 사용자가 멤버인 프로젝트가 이미 연동해 둔 repo_url 집합.
   * 레포 가져오기 화면이 "이미 가져온 레포"를 걸러 체크박스를 미리 꺼 두는 데 쓴다.
   */
  async importedRepoUrls(userId: string): Promise<Set<string>> {
    const rows = await this.integrations
      .createQueryBuilder('gi')
      .innerJoin(ProjectMember, 'pm', 'pm.project_id = gi.project_id AND pm.user_id = :userId', {
        userId,
      })
      .select('gi.repo_url', 'repo_url')
      .getRawMany<{ repo_url: string }>();

    return new Set(rows.map((r) => r.repo_url));
  }

  /**
   * 프로젝트 상세 화면의 "최근 커밋" 카드. 연동이 없으면 빈 배열이다 —
   * 이 화면은 연동이 있다는 것을 전제하지 않는다(README 필터 화면과 다른 점).
   */
  async recentCommits(projectId: string, userId: string): Promise<CommitSummary[]> {
    const integration = await this.findByProject(projectId);
    if (!integration) return [];

    const { owner, repo } = parseRepoUrl(integration.repo_url);
    const accessToken = await this.githubTokenOf(userId);
    return this.github.listCommits({ owner, repo, accessToken });
  }

  /**
   * 사용자의 GitHub 액세스 토큰. 만료됐으면 GitHubTokenService가 먼저 갱신한다.
   *
   * 갱신도 불가능하면 GITHUB_REAUTH_REQUIRED가 올라오고, 화면은 그 코드를 보고
   * "GitHub 재인증이 필요합니다"를 띄운다 — 예전처럼 서버 로그에만 경고를 남기면
   * 사용자는 연동이 왜 안 되는지 영영 알 수 없다.
   */
  private async githubTokenOf(userId: string): Promise<string> {
    return this.githubTokens.accessTokenFor(userId);
  }

  /** GitHub이 이벤트를 배달할 우리 엔드포인트 (설계서 Part 4 §7.1). */
  private deliveryUrl(): string {
    const base = (this.config.get<string>('API_BASE_URL') ?? '').replace(/\/$/, '');
    return `${base}/api/v1/webhooks/github`;
  }
}
