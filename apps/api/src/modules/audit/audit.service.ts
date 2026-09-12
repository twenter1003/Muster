import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { AuditLog } from '../../database/entities';
import type { AuditAction } from '../../database/entities/enums';
import { keysetPage, type Page, type PageRequest } from '../../common/pagination/paginate';

export interface AuditEntry {
  user_id: string;
  action: AuditAction;
  /** 프로젝트 스코프가 아닌 행위(로그인/로그아웃, 템플릿 CRUD)는 null이다. */
  project_id?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}

  /**
   * 설계서 Part 4 §8 — 감사 기록 한 줄.
   *
   * **기록 실패를 본 작업의 실패로 만들지 않는다 (manager를 받지 않은 경우).**
   * 근거: 이 API의 감사 로그는 규제 대응이 아니라 "누가 무엇을 했는가"를 되짚기 위한
   * 추적 수단이다. 여기서 예외를 던지면, 프로젝트는 이미 만들어졌는데 응답은 500이 되어
   * 사용자가 같은 작업을 다시 시도하고 중복을 만든다 — 감사 목적을 위해 본 기능의
   * 정확성을 깎는 거래다. 대신 실패를 error 레벨로 크게 남겨, 유실이 조용히 지나가지
   * 않게 한다.
   *
   * **manager를 넘기면 이야기가 달라진다.** 호출부가 이미 트랜잭션 안이고 같은 매니저를
   * 준 것은 "본 작업과 기록을 원자적으로 묶겠다"는 명시적 선택이다. 이때는 삼키지 않는다 —
   * 삼켜도 어차피 같은 트랜잭션이라 뒤이은 쿼리가 aborted transaction으로 터지고,
   * 그때의 오류는 원인을 못 가리킨다. 실패하면 본 작업과 함께 롤백되는 편이 정직하다.
   * (HealthService.recompute와 같은 매개변수 순서를 따른다.)
   */
  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const row = {
      user_id: entry.user_id,
      action: entry.action,
      project_id: entry.project_id ?? null,
    };

    if (manager) {
      await manager.save(manager.create(AuditLog, row));
      return;
    }

    try {
      await this.logs.save(this.logs.create(row));
    } catch (error) {
      this.logger.error(
        `감사 기록 실패 (user=${row.user_id}, action=${row.action}, project=${row.project_id}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** 설계서 Part 4 §8 — 프로젝트 스코프 이력. 접근 제어는 ProjectMemberGuard가 한다. */
  listForProject(projectId: string, page: PageRequest): Promise<Page<AuditLog>> {
    const qb = this.logs
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.project', 'p')
      .where('a.project_id = :projectId', { projectId });

    return keysetPage(qb, 'created_at', page, (a) => a.created_at);
  }

  /**
   * 설계서 Part 4 §8 — 내 전체 이력.
   *
   * project_id가 null인 기록도 포함된다. 로그인/로그아웃과 템플릿 CRUD는 프로젝트에
   * 속하지 않는데, 이 조회에서 빠지면 "내 계정에 무슨 일이 있었나"를 볼 방법이 사라진다.
   * (필터를 user_id 하나로만 거는 것이 그 구현이다.)
   */
  listForUser(userId: string, page: PageRequest): Promise<Page<AuditLog>> {
    const qb = this.logs
      .createQueryBuilder('a')
      // 프로젝트 이름을 같은 쿼리로 가져온다. action + created_at만으로는 화면이
      // "무엇에 대한 기록인지"를 못 보여주고, 행마다 프로젝트를 다시 읽으면 N+1이 된다.
      // 삭제되어 project_id가 SET NULL된 기록도 남아야 하므로 left join이다.
      .leftJoinAndSelect('a.project', 'p')
      .where('a.user_id = :userId', { userId });

    return keysetPage(qb, 'created_at', page, (a) => a.created_at);
  }
}
