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
import { ApiKeysService, type ApiKeyView } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ProjectMemberGuard } from '../../common/auth/project-member.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import type { GitIntegration, Project } from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';

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
    private readonly apiKeys: ApiKeysService,
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

  /** 설계서 Part 4 §3 — 발급된 API 키 목록. 원문은 재조회 불가라 label/생성일만 나온다. */
  @Get(':id/api-keys')
  @UseGuards(ProjectMemberGuard)
  listApiKeys(
    @Param('id') id: string,
    @Query() query: CursorPaginationQuery,
  ): Promise<Page<ApiKeyView>> {
    return this.apiKeys.listByProject(id, toPageRequest(query));
  }

  /** 설계서 Part 4 §3 — API 키 발급. 원문은 이 응답에서만 노출된다. */
  @Post(':id/api-keys')
  @UseGuards(ProjectMemberGuard)
  @HttpCode(HttpStatus.CREATED)
  createApiKey(
    @Param('id') id: string,
    @Body() dto: CreateApiKeyDto,
  ): Promise<ApiKeyView & { key: string }> {
    return this.apiKeys.issue(id, dto.label);
  }
}

/**
 * API 키 폐기. `/projects/:id` 하위가 아니라 최상위 경로라 ProjectMemberGuard를 쓸 수 없어
 * (가드가 :id를 프로젝트로 읽는다) 여기서 직접 소유 프로젝트를 확인한다.
 */
@Controller('api-keys')
export class ApiKeysController {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly projects: ProjectsService,
  ) {}

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const projectId = await this.apiKeys.projectIdOf(id);
    // 남의 키의 존재 여부를 알려주지 않기 위해 없는 것과 같은 응답을 낸다.
    if (!projectId || !(await this.projects.isMember(projectId, user.id))) {
      throw ApiException.notFound('API 키를 찾을 수 없습니다.');
    }
    await this.apiKeys.revoke(id);
  }
}
