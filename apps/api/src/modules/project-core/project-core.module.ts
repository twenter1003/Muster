import { Module } from '@nestjs/common';
import { ApiKeysController, InvitesController, ProjectsController } from './projects.controller';
import { GithubController } from './github.controller';
import { ProjectsService } from './projects.service';
import { GitIntegrationService } from './git-integration.service';
import { ApiKeysService } from './api-keys.service';
import { InvitesService } from './invites.service';
import { ProjectImportService } from './project-import.service';
import { GITHUB_REPO_CLIENT, HttpGitHubRepoClient } from './github-repo.client';

/**
 * ProjectCore — 프로젝트 CRUD, current_stage 관리.
 * 설계서 Part 1 §3.5 / Part 4 §3.
 *
 * GitHub 레포 연동은 GitHubRepoClient 인터페이스 뒤에 있어, 자격증명 없이도
 * 플로우 전체를 fake로 검증할 수 있다.
 */
@Module({
  controllers: [ProjectsController, ApiKeysController, InvitesController, GithubController],
  providers: [
    ProjectsService,
    GitIntegrationService,
    ApiKeysService,
    InvitesService,
    ProjectImportService,
    { provide: GITHUB_REPO_CLIENT, useClass: HttpGitHubRepoClient },
  ],
  // GitIntegrationService도 export한다 — project-goals가 repoDocs()/recentCommits()를
  // 재사용해 GitHubRepoClient 배선을 중복하지 않는다.
  exports: [ProjectsService, ApiKeysService, GitIntegrationService],
})
export class ProjectCoreModule {}
