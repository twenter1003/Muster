import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, IsNull, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import {
  Agent,
  AgentRun,
  DeploymentEvent,
  GitIntegration,
  HealthSnapshot,
  LogEntry,
  Project,
  ProjectMember,
  ProjectStageHistory,
} from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import { buildPage, type Page, type PageRequest } from '../../common/pagination/paginate';
import { DomainEvent, type ProjectStageChangedEvent } from '../../common/events/domain-events';
import { AuditService } from '../audit/audit.service';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import type { ProjectSummaryView } from './dto/project-summary-view';

export { type ProjectSummaryView };

/** 타임존 문자열 검증 및 fallback (기본값 Asia/Seoul) */
function sanitizeTimeZone(tz?: string): string {
  if (!tz) return 'Asia/Seoul';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return 'Asia/Seoul';
  }
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @InjectRepository(GitIntegration) private readonly gitIntegrations: Repository<GitIntegration>,
    @InjectRepository(HealthSnapshot) private readonly healthSnapshots: Repository<HealthSnapshot>,
    @InjectRepository(DeploymentEvent)
    private readonly deploymentEvents: Repository<DeploymentEvent>,
    @InjectRepository(LogEntry) private readonly logEntries: Repository<LogEntry>,
    @InjectRepository(AgentRun) private readonly agentRuns: Repository<AgentRun>,
    @InjectRepository(Agent) private readonly agents: Repository<Agent>,
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
  ) {}

  /**
   * 설계서 Part 4 §3 — 내가 속한 프로젝트 목록.
   * 커서 페이지네이션은 (created_at, id) 키셋 방식이다.
   */
  async listForUser(userId: string, page: PageRequest): Promise<Page<Project>> {
    const qb = this.projects
      .createQueryBuilder('p')
      .innerJoin(ProjectMember, 'm', 'm.project_id = p.id AND m.user_id = :userId', { userId })
      .orderBy('p.created_at', 'DESC')
      .addOrderBy('p.id', 'DESC')
      // 다음 페이지 유무를 별도 count 없이 판정하기 위해 하나 더 가져온다.
      .take(page.limit + 1);

    if (page.after) {
      // 정렬 키가 같은 행이 있어도 순서가 흔들리지 않도록 (created_at, id) 튜플로 비교한다.
      qb.andWhere('(p.created_at, p.id) < (:ts, :id)', {
        ts: page.after.ts,
        id: page.after.id,
      });
    }

    const rows = await qb.getMany();
    return buildPage(rows, page.limit, (p) => ({ ts: p.created_at.toISOString(), id: p.id }));
  }

  /**
   * 프로젝트 목록 요약 조회 (N+1 API 요청 최적화).
   * 단일 요청으로 프로젝트 페이지와 함께 git_integrations, health_snapshots,
   * deployment_events, log_entries, active_agents, tokens 데이터를 일괄 취합하여 반환한다.
   */
  async listSummariesForUser(
    userId: string,
    page: PageRequest,
    tz?: string,
  ): Promise<Page<ProjectSummaryView>> {
    const projectPage = await this.listForUser(userId, page);
    if (projectPage.items.length === 0) {
      return { items: [], next_cursor: projectPage.next_cursor };
    }

    const projectIds = projectPage.items.map((p) => p.id);
    const targetTz = sanitizeTimeZone(tz);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: targetTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayStr = formatter.format(new Date());
    const currentMonth = todayStr.slice(0, 7);

    const [gitIntegrations, healthRows, deployRows, logRows, activeAgentRows, tokenRows] =
      await Promise.all([
        // 1. git_integrations: 프로젝트별 repo_url (없으면 null)
        this.gitIntegrations
          .createQueryBuilder('g')
          .select('g.project_id', 'project_id')
          .addSelect('g.repo_url', 'repo_url')
          .where('g.project_id IN (:...projectIds)', { projectIds })
          .getRawMany<{ project_id: string; repo_url: string }>(),

        // 2. health_snapshots: 프로젝트별 최신 1개 composite_score (없으면 null)
        this.healthSnapshots
          .createQueryBuilder('h')
          .select('DISTINCT ON (h.project_id) h.project_id', 'project_id')
          .addSelect('h.composite_score', 'composite_score')
          .where('h.project_id IN (:...projectIds)', { projectIds })
          .orderBy('h.project_id')
          .addOrderBy('h.measured_at', 'DESC')
          .getRawMany<{ project_id: string; composite_score: string }>(),

        // 3. deployment_events: 프로젝트별 최신 1개 kind = 'deployment'의 status (없으면 null)
        this.deploymentEvents
          .createQueryBuilder('e')
          .select('DISTINCT ON (e.project_id) e.project_id', 'project_id')
          .addSelect('e.status', 'status')
          .where('e.project_id IN (:...projectIds)', { projectIds })
          .andWhere('e.kind = :kind', { kind: 'deployment' })
          .orderBy('e.project_id')
          .addOrderBy('e.occurred_at', 'DESC')
          .getRawMany<{ project_id: string; status: string }>(),

        // 4. log_entries: 프로젝트별 최신 1개 message (없으면 null)
        this.logEntries
          .createQueryBuilder('l')
          .select('DISTINCT ON (l.project_id) l.project_id', 'project_id')
          .addSelect('l.message', 'message')
          .where('l.project_id IN (:...projectIds)', { projectIds })
          .orderBy('l.project_id')
          .addOrderBy('l.created_at', 'DESC')
          .getRawMany<{ project_id: string; message: string }>(),

        // 5. agent_runs & agents: 현재 실행 중인 에이전트(status = 'running')의 agent_name 목록
        this.agents
          .createQueryBuilder('a')
          .innerJoin(AgentRun, 'r', 'r.agent_id = a.id AND r.status = :status', {
            status: 'running',
          })
          .select('a.project_id', 'project_id')
          .addSelect('a.name', 'agent_name')
          .where('a.project_id IN (:...projectIds)', { projectIds })
          .orderBy('a.name', 'ASC')
          .getRawMany<{ project_id: string; agent_name: string }>(),

        // 6. agent_runs: 당일/당월/총 토큰 사용량 및 비용을 프로젝트별로 집계
        this.agentRuns
          .createQueryBuilder('r')
          .innerJoin(Agent, 'a', 'a.id = r.agent_id')
          .select('a.project_id', 'project_id')
          .addSelect(
            `COALESCE(SUM(CASE WHEN to_char(COALESCE(r.ended_at, r.started_at) AT TIME ZONE :tz, 'YYYY-MM-DD') = :todayStr THEN r.tokens_used ELSE 0 END), 0)`,
            'today_tokens',
          )
          .addSelect(
            `COALESCE(SUM(CASE WHEN to_char(COALESCE(r.ended_at, r.started_at) AT TIME ZONE :tz, 'YYYY-MM-DD') = :todayStr THEN r.cost ELSE 0 END), 0)`,
            'today_cost',
          )
          .addSelect(
            `COALESCE(SUM(CASE WHEN to_char(COALESCE(r.ended_at, r.started_at) AT TIME ZONE :tz, 'YYYY-MM') = :currentMonth THEN r.tokens_used ELSE 0 END), 0)`,
            'month_tokens',
          )
          .addSelect(
            `COALESCE(SUM(CASE WHEN to_char(COALESCE(r.ended_at, r.started_at) AT TIME ZONE :tz, 'YYYY-MM') = :currentMonth THEN r.cost ELSE 0 END), 0)`,
            'month_cost',
          )
          .addSelect('COALESCE(SUM(r.tokens_used), 0)', 'total_tokens')
          .addSelect('COALESCE(SUM(r.cost), 0)', 'total_cost')
          .where('a.project_id IN (:...projectIds)', { projectIds })
          .groupBy('a.project_id')
          .setParameters({ tz: targetTz, todayStr, currentMonth })
          .getRawMany<{
            project_id: string;
            today_tokens: string;
            today_cost: string;
            month_tokens: string;
            month_cost: string;
            total_tokens: string;
            total_cost: string;
          }>(),
      ]);

    const repoMap = new Map<string, string>();
    for (const r of gitIntegrations) repoMap.set(r.project_id, r.repo_url);

    const healthMap = new Map<string, number | null>();
    for (const r of healthRows) {
      const score = Number(r.composite_score);
      healthMap.set(r.project_id, Number.isFinite(score) ? score : null);
    }

    const deployMap = new Map<string, string>();
    for (const r of deployRows) deployMap.set(r.project_id, r.status);

    const logMap = new Map<string, string>();
    for (const r of logRows) logMap.set(r.project_id, r.message);

    const activeAgentsMap = new Map<string, Set<string>>();
    for (const r of activeAgentRows) {
      let set = activeAgentsMap.get(r.project_id);
      if (!set) {
        set = new Set<string>();
        activeAgentsMap.set(r.project_id, set);
      }
      set.add(r.agent_name);
    }

    const tokenMap = new Map<string, (typeof tokenRows)[number]>();
    for (const r of tokenRows) tokenMap.set(r.project_id, r);

    const items: ProjectSummaryView[] = projectPage.items.map((p) => {
      const token = tokenMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        current_stage: p.current_stage,
        created_at:
          p.created_at instanceof Date
            ? p.created_at.toISOString()
            : new Date(p.created_at).toISOString(),
        updated_at:
          p.updated_at instanceof Date
            ? p.updated_at.toISOString()
            : new Date(p.updated_at).toISOString(),
        repo_url: repoMap.get(p.id) ?? null,
        health_score: healthMap.get(p.id) ?? null,
        latest_deploy_status: deployMap.get(p.id) ?? null,
        latest_log_message: logMap.get(p.id) ?? null,
        active_agents: Array.from(activeAgentsMap.get(p.id) ?? []).sort(),
        tokens: {
          today: String(token?.today_tokens ?? '0'),
          month: String(token?.month_tokens ?? '0'),
          total: String(token?.total_tokens ?? '0'),
          today_cost: String(token?.today_cost ?? '0'),
          month_cost: String(token?.month_cost ?? '0'),
          total_cost: String(token?.total_cost ?? '0'),
        },
      };
    });

    return { items, next_cursor: projectPage.next_cursor };
  }

  /**
   * 생성 시 요청자를 owner로 등록한다 (설계서 Part 4 §3).
   * 멤버십 없이 프로젝트만 남으면 아무도 접근할 수 없는 고아가 되므로 한 트랜잭션으로 묶는다.
   */
  async create(userId: string, dto: CreateProjectDto): Promise<Project> {
    return this.dataSource.transaction(async (manager) => {
      const project = await manager.save(manager.create(Project, { name: dto.name }));

      await manager.save(
        manager.create(ProjectMember, {
          project_id: project.id,
          user_id: userId,
          role: 'owner',
        }),
      );

      // 최초 단계도 이력에 남겨야 타임라인이 생성 시점부터 이어진다.
      await manager.save(
        manager.create(ProjectStageHistory, {
          project_id: project.id,
          stage: project.current_stage,
        }),
      );

      // 이미 트랜잭션 안이라 같은 매니저를 넘긴다 — 프로젝트·멤버십·감사 기록이 한 덩어리다.
      await this.audit.record(
        { user_id: userId, action: 'project.create', project_id: project.id },
        manager,
      );

      return project;
    });
  }

  /** soft delete라 @DeleteDateColumn 덕분에 삭제된 프로젝트는 자동으로 제외된다. */
  async findOneOrFail(projectId: string): Promise<Project> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project) throw ApiException.notFound('프로젝트를 찾을 수 없습니다.');
    return project;
  }

  /**
   * userId를 받는 이유는 감사 기록뿐이다 — 갱신 자체에는 쓰이지 않는다.
   * 컨트롤러에서 따로 기록하지 않고 여기로 내린 것은, 이미 열려 있는 트랜잭션에
   * 같은 매니저로 넣기 위해서다.
   */
  async update(projectId: string, userId: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOneOrFail(projectId);
    const stageChanged =
      dto.current_stage !== undefined && dto.current_stage !== project.current_stage;

    const saved = await this.dataSource.transaction(async (manager) => {
      if (dto.name !== undefined) project.name = dto.name;
      if (dto.current_stage !== undefined) project.current_stage = dto.current_stage;

      const saved = await manager.save(project);

      // current_stage는 현재 상태만 담고, 전환 이력은 별도 테이블이 담당한다
      // (설계서 Part 1 §3.4 타임라인 시각화의 전제).
      if (stageChanged) {
        await manager.save(
          manager.create(ProjectStageHistory, {
            project_id: saved.id,
            stage: saved.current_stage,
          }),
        );
      }

      await this.audit.record(
        { user_id: userId, action: 'project.update', project_id: saved.id },
        manager,
      );

      return saved;
    });

    // 커밋 뒤에 발행한다 (Part 4 §7.3의 SSE `stage_change`). 트랜잭션 안에서 발행하면
    // 롤백된 전환이 화면에만 남는다. 이력 자체는 위에서 current_stage와 원자적으로
    // 기록되므로, 발행이 실패해도 타임라인에는 구멍이 나지 않는다.
    if (stageChanged) {
      this.events.emit(DomainEvent.PROJECT_STAGE_CHANGED, {
        project_id: saved.id,
        stage: saved.current_stage,
        entered_at: new Date().toISOString(),
      } satisfies ProjectStageChangedEvent);
    }

    return saved;
  }

  /**
   * 설계서 Part 4 §3 — soft delete. 감사 로그 보존을 위해 물리 삭제하지 않는다.
   * GCS 문서 파일은 30일 경과 후 별도 정리한다(해당 배치는 아직 없음).
   */
  async softDelete(projectId: string, userId: string): Promise<void> {
    await this.findOneOrFail(projectId);
    await this.projects.softDelete(projectId);
    await this.audit.record({ user_id: userId, action: 'project.delete', project_id: projectId });
  }

  /** 설계서 Part 4 §1 — 프로젝트 하위 리소스는 요청자가 PROJECT_MEMBERS인지 검사한다. */
  async isMember(projectId: string, userId: string): Promise<boolean> {
    const count = await this.members.countBy({ project_id: projectId, user_id: userId });
    return count > 0;
  }

  /**
   * owner가 아니면 404를 던진다.
   *
   * 가드(ProjectOwnerGuard)를 쓸 수 없는 경로를 위한 것이다 — 경로 파라미터가 프로젝트 id가
   * 아닐 때(예: 초대 id로 폐기할 때). 권한 부족을 403이 아니라 404로 만드는 이유는 가드와
   * 같다: 응답이 갈리면 그 차이가 곧 "그 프로젝트가 존재한다"는 정보다.
   */
  async assertOwner(projectId: string, userId: string): Promise<void> {
    const [exists, owner] = await Promise.all([
      this.projects.countBy({ id: projectId, deleted_at: IsNull() }),
      this.members.countBy({ project_id: projectId, user_id: userId, role: 'owner' }),
    ]);

    if (!exists || !owner) throw ApiException.notFound('프로젝트를 찾을 수 없습니다.');
  }

  /** soft delete되지 않은 프로젝트인지 확인한다. */
  async exists(projectId: string): Promise<boolean> {
    const count = await this.projects.countBy({ id: projectId, deleted_at: IsNull() });
    return count > 0;
  }
}
