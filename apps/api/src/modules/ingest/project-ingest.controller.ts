import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyGuard } from '../../common/auth/api-key.guard';
import { ProjectMemberGuard } from '../../common/auth/project-member.guard';
import { Public } from '../../common/auth/public.decorator';
import { ApiException } from '../../common/errors/api.exception';
import { CursorPaginationQuery } from '../../common/pagination/pagination.dto';
import { toPageRequest, type Page } from '../../common/pagination/paginate';
import type {
  DeploymentEvent,
  HealthSnapshot,
  LogEntry,
  ProjectStageHistory,
} from '../../database/entities';
import { AppendLogDto } from './dto/append-log.dto';
import { LogQuery } from './dto/log-query.dto';
import { LogsService } from './logs.service';
import { HealthService } from './health.service';
import { TimelineService } from './timeline.service';

export interface LogView {
  id: string;
  project_id: string;
  agent_id: string | null;
  level: string;
  message: string;
  created_at: string;
}

interface DeploymentEventView {
  id: string;
  project_id: string;
  kind: string;
  status: string;
  commit_sha: string;
  committed_at: string | null;
  occurred_at: string;
}

export interface HealthSnapshotView {
  id: string;
  project_id: string;
  deploy_freq_score: number | null;
  lead_time_score: number | null;
  change_fail_score: number | null;
  mttr_score: number | null;
  composite_score: string;
  measured_at: string;
}

interface StageHistoryView {
  id: string;
  project_id: string;
  stage: string;
  entered_at: string;
}

export const toLogView = (l: LogEntry): LogView => ({
  id: l.id,
  project_id: l.project_id,
  agent_id: l.agent_id,
  level: l.level,
  message: l.message,
  created_at: l.created_at.toISOString(),
});

const toDeploymentView = (d: DeploymentEvent): DeploymentEventView => ({
  id: d.id,
  project_id: d.project_id,
  kind: d.kind,
  status: d.status,
  commit_sha: d.commit_sha,
  committed_at: d.committed_at?.toISOString() ?? null,
  occurred_at: d.occurred_at.toISOString(),
});

export const toHealthView = (h: HealthSnapshot): HealthSnapshotView => ({
  id: h.id,
  project_id: h.project_id,
  deploy_freq_score: h.deploy_freq_score,
  lead_time_score: h.lead_time_score,
  change_fail_score: h.change_fail_score,
  mttr_score: h.mttr_score,
  composite_score: h.composite_score,
  measured_at: h.measured_at.toISOString(),
});

const toStageView = (s: ProjectStageHistory): StageHistoryView => ({
  id: s.id,
  project_id: s.project_id,
  stage: s.stage,
  entered_at: s.entered_at.toISOString(),
});

/** 설계서 Part 4 §7.2 — 프로젝트 하위 로그·이벤트 조회. */
@Controller('projects')
export class ProjectIngestController {
  constructor(
    private readonly logs: LogsService,
    private readonly health: HealthService,
    private readonly timeline: TimelineService,
  ) {}

  /**
   * 로그 적재. 사람이 아니라 외부 에이전트가 호출하므로 세션이 아니라 `X-API-Key`로 인증한다
   * (Part 4 §1). @Public()으로 전역 AuthGuard를 비켜가고 ApiKeyGuard가 대신 막는다.
   */
  @Public()
  @Post(':id/logs')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.CREATED)
  async append(
    @Req() req: Request,
    @Param('id') projectId: string,
    @Body() dto: AppendLogDto,
  ): Promise<LogView> {
    // ApiKeyGuard는 "이 키가 유효한가"만 답한다. 경로의 프로젝트와 맞는지는 여기서 본다 —
    // 확인하지 않으면 A 프로젝트 키로 B 프로젝트에 로그를 밀어넣을 수 있다.
    if (req.apiKeyProjectId !== projectId) {
      // 남의 프로젝트가 존재하는지 알려주지 않는다 (ProjectMemberGuard와 같은 이유).
      throw ApiException.notFound('프로젝트를 찾을 수 없습니다.');
    }

    return toLogView(await this.logs.append(projectId, dto));
  }

  @Get(':id/logs')
  @UseGuards(ProjectMemberGuard)
  async listLogs(@Param('id') projectId: string, @Query() query: LogQuery): Promise<Page<LogView>> {
    const page = await this.logs.list(projectId, query.level, toPageRequest(query));
    return { items: page.items.map(toLogView), next_cursor: page.next_cursor };
  }

  @Get(':id/deployment-events')
  @UseGuards(ProjectMemberGuard)
  async listDeployments(
    @Param('id') projectId: string,
    @Query() query: CursorPaginationQuery,
  ): Promise<Page<DeploymentEventView>> {
    const page = await this.timeline.listDeployments(projectId, toPageRequest(query));
    return { items: page.items.map(toDeploymentView), next_cursor: page.next_cursor };
  }

  @Get(':id/health-snapshots')
  @UseGuards(ProjectMemberGuard)
  async listHealth(
    @Param('id') projectId: string,
    @Query() query: CursorPaginationQuery,
  ): Promise<Page<HealthSnapshotView>> {
    const page = await this.health.list(projectId, toPageRequest(query));
    return { items: page.items.map(toHealthView), next_cursor: page.next_cursor };
  }

  @Get(':id/stage-history')
  @UseGuards(ProjectMemberGuard)
  async listStages(
    @Param('id') projectId: string,
    @Query() query: CursorPaginationQuery,
  ): Promise<Page<StageHistoryView>> {
    const page = await this.timeline.listStages(projectId, toPageRequest(query));
    return { items: page.items.map(toStageView), next_cursor: page.next_cursor };
  }
}
