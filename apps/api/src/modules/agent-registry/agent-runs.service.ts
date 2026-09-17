import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Agent, AgentRun, GitIntegration, ProjectMember } from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import { buildPage, type Page, type PageRequest } from '../../common/pagination/paginate';
import { normalizeGitRepoUrl } from '../project-core/repo-url';
import { BudgetService } from './budget.service';
import { ModelPricingService } from './model-pricing.service';
import type { CreateRunDto } from './dto/create-run.dto';
import type { RecordRunByRepoDto } from './dto/record-run-by-repo.dto';
import type { UpdateRunDto } from './dto/update-run.dto';

/** 실행 종료를 요청한 신원 — 사람(세션) 또는 에이전트(API 키) 중 하나. */
export type RunIdentity = { userId: string } | { apiKeyProjectId: string };

/** 설계서 Part 4 §6 — 실행 이력. 토큰/비용 집계의 원천. */
@Injectable()
export class AgentRunsService {
  constructor(
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    @InjectRepository(Agent) private readonly agents: Repository<Agent>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @InjectRepository(GitIntegration) private readonly gitIntegrations: Repository<GitIntegration>,
    private readonly budget: BudgetService,
    private readonly modelPricing: ModelPricingService,
  ) {}

  /**
   * 실행 시작 기록 또는 과거 세션 백필 생성.
   * dto가 없으면 status='running', tokens_used=0, started_at=현재시각으로 시작된다.
   */
  async start(agentId: string, dto?: CreateRunDto): Promise<AgentRun> {
    const status = dto?.status ?? 'running';
    const startedAt = dto?.started_at ? new Date(dto.started_at) : new Date();
    let endedAt: Date | null = null;
    if (dto?.ended_at) {
      endedAt = new Date(dto.ended_at);
    } else if (status !== 'running') {
      endedAt = new Date();
    }

    const agent = await this.agents.findOneBy({ id: agentId });
    const projectId = agent?.project_id;
    const before = projectId && status !== 'running' ? await this.budget.sumUsage(projectId) : null;

    const tokensUsed = dto?.tokens_used ?? 0;
    let cost = dto?.cost;
    if ((!cost || Number(cost) === 0) && tokensUsed > 0) {
      cost = this.modelPricing.calculateCost({
        tokens: tokensUsed,
        agentName: agent?.name,
        model: dto?.model,
      });
    } else if (!cost) {
      cost = '0';
    }

    const run = await this.runs.save(
      this.runs.create({
        agent_id: agentId,
        status,
        tokens_used: tokensUsed,
        cost,
        started_at: startedAt,
        ended_at: endedAt,
      }),
    );

    if (projectId && before) {
      await this.budget.recalculateAndAlert(projectId, before);
    }

    return run;
  }

  /**
   * Git repository URL 기반 에이전트 실행 기록 자동 라우팅.
   *
   * 1. 요청에 사용된 API 키의 소유 프로젝트(keyProjectId)로부터 해당 프로젝트의 owner user를 찾는다.
   * 2. dto.repo_url을 정규화한다 (HTTPS/SSH → https://github.com/<owner>/<repo>).
   * 3. 해당 사용자가 속한 프로젝트들 중 GitIntegration.repo_url이 일치하는 타겟 프로젝트를 찾는다.
   * 4. 타겟 프로젝트 내에서 agent_name(예: 'antigravity', 'claude-code') 에이전트를 조회하고, 없으면 자동 생성한다.
   * 5. AgentRun을 생성/저장하고 예산 알림을 점검한다.
   */
  async recordByRepo(keyProjectId: string, dto: RecordRunByRepoDto): Promise<AgentRun> {
    const members = await this.members.find({
      where: { project_id: keyProjectId },
      order: { role: 'ASC' },
    });
    if (members.length === 0) {
      throw ApiException.notFound('프로젝트 소유자를 찾을 수 없습니다.');
    }
    const userId = members[0].user_id;

    const normalizedUrl = normalizeGitRepoUrl(dto.repo_url);

    const integration = await this.gitIntegrations
      .createQueryBuilder('gi')
      .innerJoin('project_members', 'pm', 'pm.project_id = gi.project_id')
      .where('pm.user_id = :userId', { userId })
      .andWhere('LOWER(gi.repo_url) = LOWER(:repoUrl)', { repoUrl: normalizedUrl })
      .getOne();

    if (!integration) {
      throw ApiException.notFound(
        `Muster에 연동되지 않은 레포지토리입니다: ${normalizedUrl}. Muster 대시보드에서 레포지토리를 먼저 Import 해주세요.`,
      );
    }

    const targetProjectId = integration.project_id;

    let agent = await this.agents.findOneBy({
      project_id: targetProjectId,
      name: dto.agent_name,
    });

    if (!agent) {
      agent = await this.agents.save(
        this.agents.create({
          project_id: targetProjectId,
          name: dto.agent_name,
          config_md: `# ${dto.agent_name} 에이전트\n\nMuster 자동 라우팅에 의해 자동 등록된 에이전트입니다.`,
        }),
      );
    }

    return this.start(agent.id, {
      status: dto.status ?? 'succeeded',
      tokens_used: dto.tokens_used,
      model: dto.model,
      cost: dto.cost,
      started_at: dto.started_at,
      ended_at: dto.ended_at,
    });
  }

  /**
   * 실행 종료 기록 (설계서 Part 4 §6).
   *
   * **에이전트 또는 사람**이 호출한다 — startRun과 같은 이유(agents.controller.ts 주석
   * 참조)에 더해, 시작만 키로 열려 있으면 외부 에이전트가 실행을 시작할 수는 있어도 실제
   * 토큰/비용을 채워 끝맺을 수는 없다. 그러면 토큰 사용량 카드는 사람이 대시보드에서
   * 일일이 정정하지 않는 한 영원히 0으로 남는다 — 자진신고 기능이 자진신고할 방법이
   * 없는 상태였다.
   *
   * 사용량 재계산은 저장 **후**에, 그리고 저장 **전** 합계를 넘겨서 한다.
   * 임계치를 넘어서는 순간을 알아내려면 이 실행이 반영되기 전후를 비교해야 한다.
   */
  async finish(runId: string, identity: RunIdentity, dto: UpdateRunDto): Promise<AgentRun> {
    const run =
      'apiKeyProjectId' in identity
        ? await this.findAccessibleByKeyOrFail(runId, identity.apiKeyProjectId)
        : await this.findAccessibleOrFail(runId, identity.userId);
    const projectId = await this.projectIdOfRun(run);

    const before = await this.budget.sumUsage(projectId);

    if (dto.status !== undefined) run.status = dto.status;
    if (dto.tokens_used !== undefined) run.tokens_used = dto.tokens_used;
    if (dto.cost !== undefined) {
      run.cost = dto.cost;
    } else if ((!run.cost || Number(run.cost) === 0) && run.tokens_used > 0) {
      const agent = await this.agents.findOneBy({ id: run.agent_id });
      run.cost = this.modelPricing.calculateCost({
        tokens: run.tokens_used,
        agentName: agent?.name,
        model: dto.model,
      });
    }

    // running이 아닌 상태로 옮겼는데 종료 시각이 없으면 "끝났지만 언제인지 모르는" 행이 남는다.
    if (run.status !== 'running' && !run.ended_at) run.ended_at = new Date();

    const saved = await this.runs.save(run);
    await this.budget.recalculateAndAlert(projectId, before);

    return saved;
  }

  async listForAgent(agentId: string, page: PageRequest): Promise<Page<AgentRun>> {
    const qb = this.runs
      .createQueryBuilder('r')
      .where('r.agent_id = :agentId', { agentId })
      .orderBy('r.started_at', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .take(page.limit + 1);

    if (page.after) {
      qb.andWhere('(r.started_at, r.id) < (:ts, :id)', { ts: page.after.ts, id: page.after.id });
    }

    const rows = await qb.getMany();
    return buildPage(rows, page.limit, (r) => ({ ts: r.started_at.toISOString(), id: r.id }));
  }

  private async projectIdOfRun(run: AgentRun): Promise<string> {
    const agent = await this.agents.findOneBy({ id: run.agent_id });
    if (!agent) throw ApiException.notFound('에이전트를 찾을 수 없습니다.');
    return agent.project_id;
  }

  /** 실행 → 에이전트 → 프로젝트 → 멤버십. 비멤버에게는 404다. */
  private async findAccessibleOrFail(runId: string, userId: string): Promise<AgentRun> {
    const run = await this.runs.findOneBy({ id: runId });
    if (!run) throw ApiException.notFound('실행 이력을 찾을 수 없습니다.');

    const agent = await this.agents.findOneBy({ id: run.agent_id });
    if (!agent) throw ApiException.notFound('실행 이력을 찾을 수 없습니다.');

    const isMember = await this.members.countBy({
      project_id: agent.project_id,
      user_id: userId,
    });
    if (!isMember) throw ApiException.notFound('실행 이력을 찾을 수 없습니다.');

    return run;
  }

  /** API 키로 인증한 요청이 이 실행을 건드릴 수 있는지 — 키의 소유 프로젝트와 같아야 한다. */
  private async findAccessibleByKeyOrFail(
    runId: string,
    apiKeyProjectId: string,
  ): Promise<AgentRun> {
    const run = await this.runs.findOneBy({ id: runId });
    if (!run) throw ApiException.notFound('실행 이력을 찾을 수 없습니다.');

    const agent = await this.agents.findOneBy({ id: run.agent_id });
    if (!agent || agent.project_id !== apiKeyProjectId) {
      throw ApiException.notFound('실행 이력을 찾을 수 없습니다.');
    }

    return run;
  }
}
