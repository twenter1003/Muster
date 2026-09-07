import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectMemberGuard } from './project-member.guard';

/**
 * ProjectCore — 프로젝트 CRUD, current_stage 관리.
 * 설계서 Part 1 §3.5 / Part 4 §3.
 *
 * GitHub 레포 연동(git-integration)은 OAuth 자격증명이 들어온 뒤 추가한다.
 */
@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectMemberGuard],
  exports: [ProjectsService],
})
export class ProjectCoreModule {}
