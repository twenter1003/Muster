import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectMemberGuard } from './project-member.guard';
import { GitIntegrationService } from './git-integration.service';
import { GITHUB_REPO_CLIENT, HttpGitHubRepoClient } from './github-repo.client';

/**
 * ProjectCore — 프로젝트 CRUD, current_stage 관리.
 * 설계서 Part 1 §3.5 / Part 4 §3.
 *
 * GitHub 레포 연동은 GitHubRepoClient 인터페이스 뒤에 있어, 자격증명 없이도
 * 플로우 전체를 fake로 검증할 수 있다.
 */
@Module({
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ProjectMemberGuard,
    GitIntegrationService,
    { provide: GITHUB_REPO_CLIENT, useClass: HttpGitHubRepoClient },
  ],
  exports: [ProjectsService],
})
export class ProjectCoreModule {}
