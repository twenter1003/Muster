import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Agent, LogEntry } from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import { keysetPage, type Page, type PageRequest } from '../../common/pagination/paginate';
import { DomainEvent, type LogAppendedEvent } from '../../common/events/domain-events';
import type { AppendLogDto } from './dto/append-log.dto';

@Injectable()
export class LogsService {
  constructor(
    @InjectRepository(LogEntry) private readonly logs: Repository<LogEntry>,
    @InjectRepository(Agent) private readonly agents: Repository<Agent>,
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
