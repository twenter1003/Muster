import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { GitHubTokenService } from '../auth/github-token.service';
import { GitIntegrationService } from './git-integration.service';
import { repoUrlOf } from './repo-url';

/** 레포 가져오기 화면(온보딩)이 보여 주는 한 행. */
interface GithubRepoView {
  full_name: string;
  private: boolean;
  default_branch: string;
  pushed_at: string | null;
  language: string | null;
  /** 이미 이 사용자의 어느 프로젝트에 연동돼 있으면 true — 화면이 체크박스를 미리 꺼 둔다. */
  already_imported: boolean;
}

/**
 * 프로젝트 하위가 아니라 최상위 `/github`인 이유: 대상이 특정 프로젝트가 아니라
 * "이 사용자가 GitHub에서 접근할 수 있는 레포 전체"라 ProjectMemberGuard가 검사할
 * `:id`가 없다. 전역 AuthGuard만으로 충분하다(로그인 여부만 확인).
 */
@Controller('github')
export class GithubController {
  constructor(
    private readonly githubTokens: GitHubTokenService,
    private readonly gitIntegrations: GitIntegrationService,
  ) {}

  @Get('repos')
  async listRepos(@CurrentUser() user: AuthenticatedUser): Promise<{ items: GithubRepoView[] }> {
    const [repos, imported] = await Promise.all([
      this.githubTokens.listRepos(user.id),
      this.gitIntegrations.importedRepoUrls(user.id),
    ]);

    return {
      items: repos.map((r) => ({
        full_name: r.full_name,
        private: r.private,
        default_branch: r.default_branch,
        pushed_at: r.pushed_at,
        language: r.language,
        already_imported: imported.has(repoUrlOf(r.full_name)),
      })),
    };
  }
}
