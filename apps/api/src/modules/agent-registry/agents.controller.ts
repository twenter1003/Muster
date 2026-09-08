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
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Public } from '../../common/auth/public.decorator';
import { CursorPaginationQuery } from '../../common/pagination/pagination.dto';
import { toPageRequest, type Page } from '../../common/pagination/paginate';
import { ProjectMemberGuard } from '../project-core/project-member.guard';
import { AgentsService } from './agents.service';
import { AgentRunsService } from './agent-runs.service';
import { BudgetService, type BudgetUsage } from './budget.service';
import { ApiKeyGuard } from './api-key.guard';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { UpdateRunDto } from './dto/update-run.dto';
import { PutBudgetDto } from './dto/put-budget.dto';
import type { Agent, AgentRun } from '../../database/entities';

interface AgentView {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/** 목록에는 config_md를 싣지 않는다 — 마크다운 전문이라 목록 응답을 불필요하게 키운다. */
const toView = (a: Agent): AgentView => ({
  id: a.id,
  project_id: a.project_id,
  name: a.name,
  created_at: a.created_at.toISOString(),
  updated_at: a.updated_at.toISOString(),
});

interface RunView {
  id: string;
  agent_id: string;
  status: string;
  tokens_used: number;
  cost: string;
  started_at: string;
  ended_at: string | null;
}

const toRunView = (r: AgentRun): RunView => ({
  id: r.id,
  agent_id: r.agent_id,
  status: r.status,
  tokens_used: r.tokens_used,
  cost: r.cost,
  started_at: r.started_at.toISOString(),
  ended_at: r.ended_at?.toISOString() ?? null,
});

/** 설계서 Part 4 §6 — 프로젝트 하위 경로 (에이전트 목록/생성, 예산). */
@Controller('projects')
export class ProjectAgentsController {
  constructor(
    private readonly agents: AgentsService,
    private readonly budget: BudgetService,
  ) {}

  @Get(':id/agents')
  @UseGuards(ProjectMemberGuard)
  async list(
    @Param('id') projectId: string,
    @Query() query: CursorPaginationQuery,
  ): Promise<Page<AgentView>> {
    const page = await this.agents.listForProject(projectId, toPageRequest(query));
    return { items: page.items.map(toView), next_cursor: page.next_cursor };
  }

  @Post(':id/agents')
  @UseGuards(ProjectMemberGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Param('id') projectId: string, @Body() dto: CreateAgentDto): Promise<AgentView> {
    return toView(await this.agents.create(projectId, dto));
  }

  /** 예산은 프로젝트 단위다 (Part 1 §3.3 — 에이전트 단위가 아니다). */
  @Get(':id/budget')
  @UseGuards(ProjectMemberGuard)
  async getBudget(@Param('id') projectId: string): Promise<BudgetUsage> {
    return this.budget.get(projectId);
  }

  /**
   * PUT이므로 **전체 교체**다. 생략한 한도는 "안 건드림"이 아니라 "한도 없음"이 된다.
   * 예산은 필드가 셋뿐이고 클라이언트가 전체를 알고 있으므로, 동사와 의미를 맞추는 쪽이
   * 부분 갱신 규칙을 따로 외우는 것보다 낫다.
   */
  @Put(':id/budget')
  @UseGuards(ProjectMemberGuard)
  async putBudget(
    @Param('id') projectId: string,
    @Body() dto: PutBudgetDto,
  ): Promise<BudgetUsage> {
    return this.budget.put(projectId, dto);
  }
}

/** 설계서 Part 4 §6 — 에이전트 단위 경로. */
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agents: AgentsService,
    private readonly runs: AgentRunsService,
  ) {}

  @Get(':id')
  async detail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AgentView & { config_md: string }> {
    const agent = await this.agents.detail(id, user.id);
    return { ...toView(agent), config_md: agent.config_md };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAgentDto,
  ): Promise<AgentView & { config_md: string }> {
    const agent = await this.agents.update(id, user.id, dto);
    return { ...toView(agent), config_md: agent.config_md };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.agents.remove(id, user.id);
  }

  @Get(':id/runs')
  async listRuns(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPaginationQuery,
  ): Promise<Page<RunView>> {
    // 목록을 주기 전에 이 에이전트에 접근할 수 있는지부터 확인한다.
    await this.agents.detail(id, user.id);
    const page = await this.runs.listForAgent(id, toPageRequest(query));
    return { items: page.items.map(toRunView), next_cursor: page.next_cursor };
  }

  /**
   * 실행 시작 기록 — **에이전트가 호출한다**. 사람 세션이 없으므로 @Public()으로
   * 전역 AuthGuard를 비켜가고 ApiKeyGuard가 대신 인증한다.
   */
  @Post(':id/runs')
  @Public()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.CREATED)
  async startRun(@Param('id') id: string, @Req() req: Request): Promise<RunView> {
    // 키가 가리키는 프로젝트의 에이전트만 기록할 수 있다. 남의 에이전트에 실행을 끼워넣지 못한다.
    const agent = await this.agents.findInProjectOrFail(id, req.apiKeyProjectId!);
    return toRunView(await this.runs.start(agent.id));
  }
}

/** 설계서 Part 4 §6 — 실행 종료 기록. 사람이 대시보드에서 정정할 수도 있어 세션 인증이다. */
@Controller('agent-runs')
export class AgentRunsController {
  constructor(private readonly runs: AgentRunsService) {}

  @Patch(':id')
  async finish(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateRunDto,
  ): Promise<RunView> {
    return toRunView(await this.runs.finish(id, user.id, dto));
  }
}
