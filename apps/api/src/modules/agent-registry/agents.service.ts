import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Agent, ProjectMember } from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import { buildPage, type Page, type PageRequest } from '../../common/pagination/paginate';
import type { CreateAgentDto } from './dto/create-agent.dto';

/** 설계서 Part 4 §6 — 에이전트 설정(md) 관리. */
@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(Agent) private readonly agents: Repository<Agent>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
  ) {}

  async listForProject(projectId: string, page: PageRequest): Promise<Page<Agent>> {
    const qb = this.agents
      .createQueryBuilder('a')
      .where('a.project_id = :projectId', { projectId })
      .orderBy('a.created_at', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .take(page.limit + 1);

    if (page.after) {
      qb.andWhere('(a.created_at, a.id) < (:ts, :id)', { ts: page.after.ts, id: page.after.id });
    }

    const rows = await qb.getMany();
    return buildPage(rows, page.limit, (a) => ({ ts: a.created_at.toISOString(), id: a.id }));
  }

  async create(projectId: string, dto: CreateAgentDto): Promise<Agent> {
    return this.agents.save(
      this.agents.create({
        project_id: projectId,
        name: dto.name,
        config_md: dto.config_md,
      }),
    );
  }

  async detail(agentId: string, userId: string): Promise<Agent> {
    return this.findAccessibleOrFail(agentId, userId);
  }

  /** API 키로 인증한 요청이 이 에이전트를 건드릴 수 있는지 — 같은 프로젝트여야 한다. */
  async findInProjectOrFail(agentId: string, projectId: string): Promise<Agent> {
    const agent = await this.agents.findOneBy({ id: agentId });
    if (!agent || agent.project_id !== projectId) {
      throw ApiException.notFound('에이전트를 찾을 수 없습니다.');
    }
    return agent;
  }

  /**
   * 에이전트 단위 접근 제어. 403이 아니라 404를 준다 —
   * 403은 "그 에이전트는 존재한다"를 알려준다.
   */
  async findAccessibleOrFail(agentId: string, userId: string): Promise<Agent> {
    const agent = await this.agents.findOneBy({ id: agentId });
    if (!agent) throw ApiException.notFound('에이전트를 찾을 수 없습니다.');

    const isMember = await this.members.countBy({
      project_id: agent.project_id,
      user_id: userId,
    });
    if (!isMember) throw ApiException.notFound('에이전트를 찾을 수 없습니다.');

    return agent;
  }
}
