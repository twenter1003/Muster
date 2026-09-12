import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CursorPaginationQuery } from '../../common/pagination/pagination.dto';
import { toPageRequest, withProjectName, type Page } from '../../common/pagination/paginate';
import { ProjectMemberGuard } from '../../common/auth/project-member.guard';
import { EnvTemplatesService } from './env-templates.service';
import { EnvConfigsService } from './env-configs.service';
import { CreateEnvTemplateDto } from './dto/create-env-template.dto';
import { CreateEnvConfigDto } from './dto/create-env-config.dto';
import { ListAllEnvConfigsQuery } from './dto/list-all-env-configs.query';
import type {
  EnvConfigTransition,
  EnvTemplate,
  PolicyCheckResult,
  ProjectEnvConfig,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';

interface TemplateView {
  id: string;
  name: string;
  stack_preset: Record<string, unknown>;
  docker_preset: Record<string, unknown>;
  created_at: string;
}

const toTemplateView = (t: EnvTemplate): TemplateView => ({
  id: t.id,
  name: t.name,
  stack_preset: t.stack_preset,
  docker_preset: t.docker_preset,
  created_at: t.created_at.toISOString(),
});

interface ConfigView {
  id: string;
  project_id: string;
  template_id: string | null;
  build_status: string;
  stack_config: Record<string, unknown>;
  created_at: string;
}

/** 목록에는 docker_config를 싣지 않는다 — Dockerfile 전문이라 응답이 커진다. 상세에만 넣는다. */
const toConfigView = (c: ProjectEnvConfig): ConfigView => ({
  id: c.id,
  project_id: c.project_id,
  template_id: c.template_id,
  build_status: c.build_status,
  stack_config: c.stack_config,
  created_at: c.created_at.toISOString(),
});

interface PolicyCheckView {
  id: string;
  tool: string;
  verdict: string;
  risk_notes: string | null;
  checked_at: string;
}

const toCheckView = (r: PolicyCheckResult): PolicyCheckView => ({
  id: r.id,
  tool: r.tool,
  verdict: r.verdict,
  risk_notes: r.risk_notes,
  checked_at: r.checked_at.toISOString(),
});

/** 설계서 Part 4 §5.1 — 템플릿은 사용자 소유다. 프로젝트 하위가 아니다. */
@Controller('env-templates')
export class EnvTemplatesController {
  constructor(
    private readonly templates: EnvTemplatesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPaginationQuery,
  ): Promise<Page<TemplateView>> {
    const page = await this.templates.listForOwner(user.id, toPageRequest(query));
    return { items: page.items.map(toTemplateView), next_cursor: page.next_cursor };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEnvTemplateDto,
  ): Promise<TemplateView> {
    const template = await this.templates.create(user.id, dto);
    // 템플릿은 사용자 소유라 프로젝트가 없다 — project_id가 null인 기록의 대표적인 경우다.
    await this.audit.record({ user_id: user.id, action: 'template.create', project_id: null });
    return toTemplateView(template);
  }

  @Get(':id')
  async detail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TemplateView> {
    return toTemplateView(await this.templates.detail(id, user.id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.templates.remove(id, user.id);
    await this.audit.record({ user_id: user.id, action: 'template.delete', project_id: null });
  }
}

/** 설계서 Part 4 §5.2 — 프로젝트 환경 구성. */
@Controller('projects')
export class ProjectEnvConfigsController {
  constructor(private readonly configs: EnvConfigsService) {}

  @Get(':id/env-configs')
  @UseGuards(ProjectMemberGuard)
  async list(
    @Param('id') projectId: string,
    @Query() query: CursorPaginationQuery,
  ): Promise<Page<ConfigView>> {
    const page = await this.configs.listForProject(projectId, toPageRequest(query));
    return { items: page.items.map(toConfigView), next_cursor: page.next_cursor };
  }

  /** 생성과 동시에 Policy Gate가 돌아, 응답의 build_status는 이미 판정 결과다. */
  @Post(':id/env-configs')
  @UseGuards(ProjectMemberGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('id') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEnvConfigDto,
  ): Promise<ConfigView> {
    return toConfigView(await this.configs.create(projectId, user.id, dto));
  }
}

/** 응답에 실리는 전이 표현. */
interface TransitionView {
  id: string;
  from_status: string | null;
  to_status: string;
  /** 사람이 일으킨 전이면 그 계정, Policy Gate의 자동 판정이면 null. */
  actor: string | null;
  reason: string | null;
  created_at: string;
}

const toTransitionView = (t: EnvConfigTransition): TransitionView => ({
  id: t.id,
  from_status: t.from_status,
  to_status: t.to_status,
  actor: t.actor?.github_login ?? null,
  reason: t.reason,
  created_at: t.created_at.toISOString(),
});

@Controller('env-configs')
export class EnvConfigsController {
  constructor(private readonly configs: EnvConfigsService) {}

  /**
   * 프로젝트를 가로지르는 환경 구성 목록.
   * 인자 없는 라우트를 `@Get(':id')`보다 먼저 둔다(Nest는 선언 순으로 매칭한다).
   */
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAllEnvConfigsQuery,
  ): Promise<Page<ConfigView & { project_name: string }>> {
    const page = await this.configs.listForMember(user.id, toPageRequest(query), {
      build_status: query.build_status,
    });
    return {
      items: page.items.map((c) => withProjectName(toConfigView(c), page.project_names)),
      next_cursor: page.next_cursor,
    };
  }

  @Get(':id')
  async detail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConfigView & { docker_config: Record<string, unknown> }> {
    const config = await this.configs.detail(id, user.id);
    return { ...toConfigView(config), docker_config: config.docker_config };
  }

  @Get(':id/policy-checks')
  async policyChecks(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ items: PolicyCheckView[] }> {
    const results = await this.configs.policyChecks(id, user.id);
    return { items: results.map(toCheckView) };
  }

  /**
   * 상태 전이 이력(설계서 ERD에 없는 신설 테이블).
   *
   * actor는 github_login으로만 내보낸다 — 누가 승인했는지를 알면 되고, 이메일까지 실을
   * 이유가 없다. 기계 전이(Policy Gate)는 null이고, 화면이 그것을 "시스템"으로 읽는다.
   */
  @Get(':id/transitions')
  async transitions(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ items: TransitionView[] }> {
    const rows = await this.configs.transitions(id, user.id);
    return { items: rows.map(toTransitionView) };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConfigView> {
    return toConfigView(await this.configs.approve(id, user.id));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConfigView> {
    return toConfigView(await this.configs.reject(id, user.id));
  }

  @Post(':id/execute')
  @HttpCode(HttpStatus.ACCEPTED)
  async execute(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConfigView> {
    return toConfigView(await this.configs.execute(id, user.id));
  }
}
