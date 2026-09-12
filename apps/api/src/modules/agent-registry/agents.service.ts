import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Agent, Project, ProjectMember } from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import {
  buildPage,
  keysetPage,
  type Page,
  type PageRequest,
  type ScopedPage,
} from '../../common/pagination/paginate';
import type { CreateAgentDto } from './dto/create-agent.dto';
import type { UpdateAgentDto } from './dto/update-agent.dto';

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

  /**
   * `GET /agents` — 프로젝트를 가로지르는 에이전트 목록. 사이드바의 AgentRegistry 화면이 쓴다.
   * 근거는 DocumentsService.listForMember 주석과 같다.
   */
  async listForMember(userId: string, page: PageRequest): Promise<ScopedPage<Agent>> {
    // 범위를 **먼저** 좁힌다. 멤버가 아닌 프로젝트의 에이전트가 섞이면 남의 프로젝트
    // 이름과 에이전트 구성이 드러난다.
    const names = await this.memberProjects(userId);
    const ids = [...names.keys()];

    // IN ()은 문법 오류다. 멤버인 프로젝트가 없으면 질의 자체를 하지 않는다.
    if (ids.length === 0) return { items: [], next_cursor: null, project_names: names };

    const qb = this.agents.createQueryBuilder('a').where('a.project_id IN (:...ids)', { ids });

    const result = await keysetPage(qb, 'created_at', page, (a) => a.created_at);
    return { ...result, project_names: names };
  }

  /**
   * 요청자가 멤버인, 살아 있는 프로젝트의 id→이름.
   * 같은 질의가 여러 서비스에 있는 이유는 ingest/member-scope.ts 주석 참조.
   */
  private async memberProjects(userId: string): Promise<Map<string, string>> {
    const rows = await this.members
      .createQueryBuilder('m')
      // soft delete된 프로젝트는 조인 조건에서 떨군다. 별도 WHERE로 두면 조건을 빠뜨렸을 때
      // 삭제된 프로젝트가 조용히 목록에 들어온다.
      .innerJoin(Project, 'p', 'p.id = m.project_id AND p.deleted_at IS NULL')
      .select('m.project_id', 'project_id')
      .addSelect('p.name', 'name')
      .where('m.user_id = :userId', { userId })
      .getRawMany<{ project_id: string; name: string }>();

    return new Map(rows.map((r) => [r.project_id, r.name]));
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

  async update(agentId: string, userId: string, dto: UpdateAgentDto): Promise<Agent> {
    const agent = await this.findAccessibleOrFail(agentId, userId);

    if (dto.name !== undefined) agent.name = dto.name;
    if (dto.config_md !== undefined) agent.config_md = dto.config_md;

    return this.agents.save(agent);
  }

  async remove(agentId: string, userId: string): Promise<void> {
    const agent = await this.findAccessibleOrFail(agentId, userId);
    // AGENT_RUNS는 FK의 ON DELETE CASCADE로 함께 지워진다.
    await this.agents.delete({ id: agent.id });
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
   * 에이전트 단위 접근 제어. DocumentsService와 같은 이유로 404를 준다 —
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
