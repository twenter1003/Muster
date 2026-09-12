import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Agent, LogEntry, ProjectMember } from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import {
  keysetPage,
  type Page,
  type PageRequest,
  type ScopedPage,
} from '../../common/pagination/paginate';
import { DomainEvent, type LogAppendedEvent } from '../../common/events/domain-events';
import { memberProjects } from './member-scope';
import type { AppendLogDto } from './dto/append-log.dto';

@Injectable()
export class LogsService {
  constructor(
    @InjectRepository(LogEntry) private readonly logs: Repository<LogEntry>,
    @InjectRepository(Agent) private readonly agents: Repository<Agent>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    private readonly events: EventEmitter2,
  ) {}

  /** 설계서 Part 4 §7.2 — 로그 적재. 적재 후 SSE `log` 이벤트를 발행한다. */
  async append(projectId: string, dto: AppendLogDto): Promise<LogEntry> {
    if (dto.agent_id) await this.assertAgentInProject(projectId, dto.agent_id);

    const entry = await this.logs.save(
      this.logs.create({
        project_id: projectId,
        agent_id: dto.agent_id ?? null,
        level: dto.level,
        message: dto.message,
      }),
    );

    this.events.emit(DomainEvent.LOG_APPENDED, {
      project_id: entry.project_id,
      log_entry_id: entry.id,
      level: entry.level,
      message: entry.message,
      created_at: entry.created_at.toISOString(),
    } satisfies LogAppendedEvent);

    return entry;
  }

  /** 설계서 Part 4 §7.2 — 최신순 + 레벨 필터. 인덱스가 두 접근 패턴에 맞춰져 있다. */
  async list(
    projectId: string,
    level: string | undefined,
    page: PageRequest,
  ): Promise<Page<LogEntry>> {
    const qb = this.logs.createQueryBuilder('l').where('l.project_id = :projectId', { projectId });

    if (level) qb.andWhere('l.level = :level', { level });

    return keysetPage(qb, 'created_at', page, (l) => l.created_at);
  }

  /**
   * `GET /logs` — 프로젝트를 가로지르는 로그 목록.
   *
   * 로그 화면은 프로젝트 하나가 아니라 내가 가진 전부를 최신순으로 본다. 이 엔드포인트가
   * 없으면 그 화면은 프로젝트마다 목록을 따로 받아 클라이언트에서 병합해야 하는데,
   * 그러면 키셋 커서가 프로젝트별로 쪼개져 페이지네이션 자체가 성립하지 않는다.
   */
  async listForMember(
    userId: string,
    level: string | undefined,
    page: PageRequest,
  ): Promise<ScopedPage<LogEntry>> {
    // 범위를 **먼저** 좁힌다. 멤버가 아닌 프로젝트의 로그가 한 줄이라도 섞이면 남의
    // 프로젝트 이름과 로그 본문이 그대로 새어 나간다.
    const names = await memberProjects(this.members, userId);
    const ids = [...names.keys()];

    // IN ()은 문법 오류다. 멤버인 프로젝트가 없으면 질의 자체를 하지 않는다.
    if (ids.length === 0) return { items: [], next_cursor: null, project_names: names };

    const qb = this.logs.createQueryBuilder('l').where('l.project_id IN (:...ids)', { ids });

    if (level) qb.andWhere('l.level = :level', { level });

    const result = await keysetPage(qb, 'created_at', page, (l) => l.created_at);
    return { ...result, project_names: names };
  }

  /**
   * API 키는 프로젝트 스코프다. agent_id를 그대로 믿으면 A 프로젝트의 키로 B 프로젝트
   * 에이전트에 로그를 달 수 있고, 그러면 남의 실행 이력이 오염된다.
   */
  private async assertAgentInProject(projectId: string, agentId: string): Promise<void> {
    const count = await this.agents.countBy({ id: agentId, project_id: projectId });
    if (count === 0) {
      throw ApiException.notFound('에이전트를 찾을 수 없습니다.');
    }
  }
}
