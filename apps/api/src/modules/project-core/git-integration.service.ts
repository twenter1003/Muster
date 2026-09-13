import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { GitIntegration } from '../../database/entities';
import { SECRET_STORE, type SecretStore } from '../../common/secrets/secret-store';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { GitHubTokenService } from '../auth/github-token.service';
import { GITHUB_REPO_CLIENT, type GitHubRepoClient } from './github-repo.client';
import { parseRepoUrl } from './repo-url';

@Injectable()
export class GitIntegrationService {
  private readonly logger = new Logger(GitIntegrationService.name);

  constructor(
    @InjectRepository(GitIntegration) private readonly integrations: Repository<GitIntegration>,
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

    try {
      return await this.integrations.save(
        this.integrations.create({
          project_id: projectId,
          repo_url: `https://github.com/${owner}/${repo}`,
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
