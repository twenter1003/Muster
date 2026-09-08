import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Agent, AgentRun, ProjectMember } from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import { buildPage, type Page, type PageRequest } from '../../common/pagination/paginate';
import { BudgetService } from './budget.service';
import type { UpdateRunDto } from './dto/update-run.dto';

/** 설계서 Part 4 §6 — 실행 이력. 토큰/비용 집계의 원천. */
@Injectable()
export class AgentRunsService {
  constructor(
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    @InjectRepository(Agent) private readonly agents: Repository<Agent>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    private readonly budget: BudgetService,
  ) {}

  /**
   * 실행 시작 기록. 에이전트가 `X-API-Key`로 호출하므로 소유 프로젝트는 가드가 확정해 넘긴다.
   * 시작 시점에는 토큰·비용이 0이고 종료 시각도 없다.
   */
  async start(agentId: string): Promise<AgentRun> {
    return this.runs.save(
      this.runs.create({
        agent_id: agentId,
        status: 'running',
        tokens_used: 0,
        cost: '0',
        started_at: new Date(),
        ended_at: null,
      }),
    );
  }

  /**
   * 실행 종료 기록 (설계서 Part 4 §6).
   *
   * 사용량 재계산은 저장 **후**에, 그리고 저장 **전** 합계를 넘겨서 한다.
   * 임계치를 넘어서는 순간을 알아내려면 이 실행이 반영되기 전후를 비교해야 한다.
   */
  async finish(runId: string, userId: string, dto: UpdateRunDto): Promise<AgentRun> {
    const run = await this.findAccessibleOrFail(runId, userId);
    const projectId = await this.projectIdOfRun(run);

    const before = await this.budget.sumUsage(projectId);

    if (dto.status !== undefined) run.status = dto.status;
    if (dto.tokens_used !== undefined) run.tokens_used = dto.tokens_used;
    if (dto.cost !== undefined) run.cost = dto.cost;

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
}
