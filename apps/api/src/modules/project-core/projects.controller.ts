import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CursorPaginationQuery } from '../../common/pagination/pagination.dto';
import { toPageRequest, type Page } from '../../common/pagination/paginate';
import { ProjectsService } from './projects.service';
import { GitIntegrationService } from './git-integration.service';
import { CreateGitIntegrationDto } from './dto/create-git-integration.dto';
import { ProjectMemberGuard } from './project-member.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import type { GitIntegration, Project } from '../../database/entities';

/**
 * 응답에 실리는 연동 표현.
 * webhook_secret_ref는 내보내지 않는다 — 시크릿 자체는 아니지만 저장소 내부 구조를 드러낸다.
 */
interface GitIntegrationView {
  id: string;
  repo_url: string;
  connected_at: string;
}

const toGitView = (g: GitIntegration): GitIntegrationView => ({
  id: g.id,
  repo_url: g.repo_url,
  connected_at: g.connected_at.toISOString(),
});

/** 응답에 실리는 프로젝트 표현. deleted_at 같은 내부 컬럼은 내보내지 않는다. */
interface ProjectView {
  id: string;
  name: string;
  current_stage: string;
  created_at: string;
  updated_at: string;
}

const toView = (p: Project): ProjectView => ({
  id: p.id,
  name: p.name,
  current_stage: p.current_stage,
  created_at: p.created_at.toISOString(),
  updated_at: p.updated_at.toISOString(),
});

/** 설계서 Part 4 §3 — ProjectCore. */
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly gitIntegrations: GitIntegrationService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPaginationQuery,
  ): Promise<Page<ProjectView>> {
    const page = await this.projects.listForUser(user.id, toPageRequest(query));
    return { items: page.items.map(toView), next_cursor: page.next_cursor };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectView> {
    return toView(await this.projects.create(user.id, dto));
  }

  @Get(':id')
  @UseGuards(ProjectMemberGuard)
  async detail(@Param('id') id: string): Promise<ProjectView> {
    return toView(await this.projects.findOneOrFail(id));
  }

  @Patch(':id')
  @UseGuards(ProjectMemberGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto): Promise<ProjectView> {
    return toView(await this.projects.update(id, dto));
  }

  @Delete(':id')
  @UseGuards(ProjectMemberGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.projects.softDelete(id);
  }

  /** 설계서 Part 4 §3 — GitHub 레포 연동 등록 (웹훅 자동 등록 포함). */
  @Post(':id/git-integration')
  @UseGuards(ProjectMemberGuard)
  @HttpCode(HttpStatus.CREATED)
  async connectGit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGitIntegrationDto,
  ): Promise<GitIntegrationView> {
    return toGitView(await this.gitIntegrations.connect(id, user.id, dto.repo_url));
  }

  /** 설계서 Part 4 §3 — 연동 해제. GitHub 웹훅과 시크릿도 정리한다. */
  @Delete(':id/git-integration')
  @UseGuards(ProjectMemberGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnectGit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.gitIntegrations.disconnect(id, user.id);
  }
}
