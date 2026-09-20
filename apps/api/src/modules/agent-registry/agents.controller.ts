import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Public } from '../../common/auth/public.decorator';
import { CursorPaginationQuery } from '../../common/pagination/pagination.dto';
import { toPageRequest, type Page } from '../../common/pagination/paginate';
import { ProjectMemberGuard } from '../../common/auth/project-member.guard';
import { AgentsService } from './agents.service';
import { AgentRunsService } from './agent-runs.service';
import { BudgetService, type BudgetUsage } from './budget.service';
import { UsageTimeseriesService, type UsageBreakdown } from './usage-timeseries.service';
import { TokenWasteReportService, type WasteReportJsonPayload } from './token-waste-report.service';
import { ApiKeyOrSessionGuard } from '../../common/auth/api-key-or-session.guard';
import { ApiKeyGuard } from '../../common/auth/api-key.guard';
import { CreateAgentDto } from './dto/create-agent.dto';
import { CreateRunDto } from './dto/create-run.dto';
import { HeartbeatRunDto } from './dto/heartbeat-run.dto';
import { RecordRunByRepoDto } from './dto/record-run-by-repo.dto';
import { UpdateRunDto } from './dto/update-run.dto';

import { PutBudgetDto } from './dto/put-budget.dto';
import type { Agent, AgentRun } from '../../database/entities';
import { AuditService } from '../audit/audit.service';

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
    private readonly usageTimeseries: UsageTimeseriesService,
    private readonly wasteReport: TokenWasteReportService,
    private readonly audit: AuditService,
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
  async create(
    @Param('id') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAgentDto,
  ): Promise<AgentView> {
    const agent = await this.agents.create(projectId, dto);
    await this.audit.record({ user_id: user.id, action: 'agent.create', project_id: projectId });
    return toView(agent);
  }

  /**
   * 프로젝트 목록·상세 화면의 "토큰 사용량" 카드 — 설계서에 없다. 누적치만 주는 예산
   * 조회와 달리 "오늘"·"최근 며칠"을 따로 봐야 하는 화면이 둘 생겨서 나눴다.
   *
   * 화면이 쓰는 토큰 지표는 전부 이 응답 하나로 나간다 — 소모 속도(burn rate)도 여기
   * 들어 있다(UsageTimeseriesService.dailyUsage가 calculateBurnRate를 같이 부른다).
   * 같은 값을 따로 주던 `GET :id/burn-rate`는 그래서 지웠다.
   */
  @Get(':id/token-usage')
  @UseGuards(ProjectMemberGuard)
  async getTokenUsage(
    @Param('id') projectId: string,
    @Query('granularity') granularity?: 'hour' | 'day' | 'month',
    @Query('agent_name') agentName?: string,
    @Query('tz') tz?: string,
  ): Promise<UsageBreakdown> {
    return this.usageTimeseries.dailyUsage(projectId, agentName, tz, granularity);
  }

  /**
   * 세션별 토큰/비용 낭비 이력 및 캐싱 절감 ROI 시뮬레이션 CSV 리포트 스트리밍 다운로드.
   */
  @Get(':id/waste-report.csv')
  @UseGuards(ProjectMemberGuard)
  async getWasteReportCsv(
    @Param('id') projectId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const csv = await this.wasteReport.generateWasteReportCsv(projectId);
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="muster-waste-report-${projectId}-${dateStr}.csv"`,
    );
    return csv;
  }

  /**
   * 세션별 토큰/비용 낭비 이력 및 캐싱 절감 ROI 시뮬레이션 JSON 리포트 다운로드.
   */
  @Get(':id/waste-report.json')
  @UseGuards(ProjectMemberGuard)
  async getWasteReportJson(
    @Param('id') projectId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WasteReportJsonPayload> {
    const json = await this.wasteReport.generateWasteReportJson(projectId);
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="muster-waste-report-${projectId}-${dateStr}.json"`,
    );
    return json;
  }

  /**
   * 읽기 짝(`GET :id/budget`)은 호출자가 없어 지웠다. 이 PUT을 남긴 이유는 이것이
   * project_budgets 행을 만드는 유일한 경로이기 때문이다 — 지우면 BudgetService의
   * 임계 알림(budget_alert)이 한도를 영영 못 읽어 사실상 죽는다.
   *
   * PUT이므로 **전체 교체**다. 생략한 한도는 "안 건드림"이 아니라 "한도 없음"이 된다.
   * 예산은 필드가 셋뿐이고 클라이언트가 전체를 알고 있으므로, 동사와 의미를 맞추는 쪽이
   * 부분 갱신 규칙을 따로 외우는 것보다 낫다.
   */
  @Put(':id/budget')
  @UseGuards(ProjectMemberGuard)
  async putBudget(
    @Param('id') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PutBudgetDto,
  ): Promise<BudgetUsage> {
    const usage = await this.budget.put(projectId, dto);
    await this.audit.record({ user_id: user.id, action: 'budget.update', project_id: projectId });
    return usage;
  }
}

/**
 * 설계서 Part 4 §6 — 에이전트 단위 경로.
 *
 * 남은 것은 실행 시작 기록 하나다. 조회·수정·삭제(`GET /agents`, `GET/PATCH/DELETE
 * /agents/:id`, `GET /agents/:id/runs`)는 AgentRegistryPage가 PR #76에서 삭제되면서
 * 호출자를 잃어 같이 지웠다. 에이전트를 만들고 목록을 보는 것은 프로젝트 하위 경로
 * (`GET/POST /projects/:id/agents`)에 남아 있고, 훅과 muster-connect가 그쪽을 쓴다.
 */
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agents: AgentsService,
    private readonly runs: AgentRunsService,
  ) {}

  /**
   * 실행 시작 기록 — **에이전트 또는 사람**이 호출한다.
   *
   * 전에는 ApiKeyGuard만 달려 있어 브라우저에서는 무슨 수를 써도 401이었다. 그래서 개요
   * 화면의 "에이전트 실행" 버튼이 비활성으로 남아 있었다. 실행 **종료** 기록은 이미 세션
   * 인증인데(사람이 대시보드에서 정정할 수 있어야 하므로) 시작만 막혀 있던 비대칭이라
   * 두 신원을 다 받는다. 자세한 근거는 ApiKeyOrSessionGuard 주석.
   *
   * @Public()은 그대로다 — 전역 AuthGuard는 세션만 알기 때문에, 키로 오는 에이전트 요청을
   * 그대로 두면 가드에 닿기도 전에 401이 된다. 인증은 이 라우트의 가드가 책임진다.
   */
  @Post(':id/runs')
  @Public()
  @UseGuards(ApiKeyOrSessionGuard)
  @HttpCode(HttpStatus.CREATED)
  async startRun(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto?: CreateRunDto,
  ): Promise<RunView> {
    // 어느 신원으로 왔든 **그 신원이 닿을 수 있는 에이전트**로만 좁힌다. 키는 자기
    // 프로젝트로, 사람은 자기가 멤버인 프로젝트로. 남의 에이전트에 실행을 끼워넣지 못한다.
    const agent =
      req.apiKeyProjectId !== undefined
        ? await this.agents.findInProjectOrFail(id, req.apiKeyProjectId)
        : await this.agents.detail(id, req.user!.id);

    return toRunView(await this.runs.start(agent.id, dto));
  }
}

/**
 * 설계서 Part 4 §6 — 실행 종료 기록. startRun과 같은 이유로 **에이전트 또는 사람**을 받는다
 * (agent-runs.service.ts finish() 주석 참조) — 사람은 대시보드에서 정정할 수 있고, 에이전트는
 * 자기가 시작한 실행을 실제 토큰/비용으로 끝맺을 수 있어야 한다.
 */
@Controller('agent-runs')
export class AgentRunsController {
  constructor(private readonly runs: AgentRunsService) {}

  @Patch(':id')
  @Public()
  @UseGuards(ApiKeyOrSessionGuard)
  async finish(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: UpdateRunDto,
  ): Promise<RunView> {
    const identity =
      req.apiKeyProjectId !== undefined
        ? { apiKeyProjectId: req.apiKeyProjectId }
        : { userId: req.user!.id };
    return toRunView(await this.runs.finish(id, identity, dto));
  }

  /**
   * 세션 진행 중 실시간 중간 토큰(Heartbeat) 스트리밍 갱신 (10초 주기).
   * status='running' 상태를 유지한 채 중간 토큰 수치와 비용을 갱신하고 SSE로 브로드캐스트한다.
   */
  @Patch(':id/heartbeat')
  @Public()
  @UseGuards(ApiKeyOrSessionGuard)
  async heartbeat(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: HeartbeatRunDto,
  ): Promise<RunView> {
    const identity =
      req.apiKeyProjectId !== undefined
        ? { apiKeyProjectId: req.apiKeyProjectId }
        : { userId: req.user!.id };
    return toRunView(await this.runs.heartbeat(id, identity, dto));
  }

  /**
   * Git repository URL 기반 에이전트 실행 기록 자동 라우팅.
   * 외부 에이전트 훅(Stop, SessionEnd 등)이 X-API-Key 헤더와 repo_url을 보내면,
   * 해당 유저의 프로젝트 중 일치하는 레포를 찾아 에이전트 실행을 적재한다.
   */
  @Post('by-repo')
  @Public()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.CREATED)
  async recordByRepo(@Req() req: Request, @Body() dto: RecordRunByRepoDto): Promise<RunView> {
    const run = await this.runs.recordByRepo(req.apiKeyProjectId!, dto);
    return toRunView(run);
  }
}

/**
 * 1줄 원격 연동 스크립트 서빙 (GET /api/v1/connect.mjs).
 * 클라이언트에 Muster 프로젝트 폴더가 없어도 `curl -fsSL ... | node -`로
 * 즉시 전역 연동 스크립트를 다운로드하여 실행할 수 있도록 한다.
 *
 * 후보 경로는 실제로 cwd가 갈리는 두 실행 모드만 남긴다 — 예전에는 8개를 순서대로
 * 추측하다 실패하면 `apps/web/public/connect.mjs`(캐시 토큰 분리 이전의 죽은 사본,
 * 삭제함)로 조용히 폴백했다. 추측하다 옛 사본으로 새는 구조 자체가 신규 유저 전원에게
 * 낡은 훅이 나갈 수 있는 위험이었다.
 * - 프로덕션: `WORKDIR /app` + `COPY scripts ./scripts`(apps/api/Dockerfile) → cwd가 `/app`.
 * - 로컬 개발/테스트(jest, `pnpm --filter @muster/api ...`): pnpm이 cwd를 `apps/api`로
 *   맞추므로 저장소 루트는 두 단계 위.
 * 둘 다 없으면 배포·실행 구조가 깨진 것이니 추측을 늘리지 않고 바로 드러낸다.
 */
@Controller('connect.mjs')
export class ConnectScriptController {
  private static readonly CANDIDATE_PATHS = [
    join(process.cwd(), 'scripts', 'muster-connect.mjs'),
    join(process.cwd(), '..', '..', 'scripts', 'muster-connect.mjs'),
  ];

  @Get()
  @Public()
  @Header('Content-Type', 'text/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  getScript(): string {
    const path = ConnectScriptController.CANDIDATE_PATHS.find((p) => existsSync(p));
    if (!path) {
      return '// muster-connect script unavailable\n';
    }
    return readFileSync(path, 'utf8');
  }
}
