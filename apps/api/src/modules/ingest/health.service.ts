import { Injectable } from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { DeploymentEvent, HealthSnapshot, ProjectMember } from '../../database/entities';
import {
  keysetPage,
  type Page,
  type PageRequest,
  type ScopedPage,
} from '../../common/pagination/paginate';
import { scoreDora, WINDOW_DAYS, type ScoredEvent } from './dora';
import { memberProjects } from './member-scope';

const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class HealthService {
  constructor(
    @InjectRepository(HealthSnapshot) private readonly snapshots: Repository<HealthSnapshot>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
  ) {}

  /**
   * 설계서 Part 2 §6.4 — DEPLOYMENT_EVENTS를 집계해 스냅샷 한 건을 남긴다.
   *
   * EntityManager를 받는 이유: 배포 이벤트를 적재한 **그 트랜잭션 안에서** 불린다.
   * 방금 넣은 이벤트가 보여야 하고, 이벤트만 남고 스냅샷이 빠지는 상태도 생기면 안 된다.
   *
   * 4개 지표가 모두 null이면(관측 창 안에 이벤트가 없음) 스냅샷을 만들지 않는다 — 설계서가
   * 정한 규칙이고, composite_score가 NOT NULL이라 만들 수도 없다.
   */
  async recompute(
    manager: EntityManager,
    projectId: string,
    now = new Date(),
  ): Promise<HealthSnapshot | null> {
    const events = await manager
      .createQueryBuilder(DeploymentEvent, 'e')
      .select(['e.status', 'e.committed_at', 'e.occurred_at'])
      .where('e.project_id = :projectId', { projectId })
      .andWhere('e.occurred_at > :since', { since: new Date(now.getTime() - WINDOW_DAYS * DAY) })
      .orderBy('e.occurred_at', 'ASC')
      .getMany();

    const scores = scoreDora(events as ScoredEvent[], now);
    if (scores.composite_score === null) return null;

    return manager.save(
      manager.create(HealthSnapshot, {
        project_id: projectId,
        deploy_freq_score: scores.deploy_freq_score,
        lead_time_score: scores.lead_time_score,
        change_fail_score: scores.change_fail_score,
        mttr_score: scores.mttr_score,
        // numeric 컬럼은 문자열로 오간다. 부동소수점으로 되돌리면 정밀도를 잃는다.
        composite_score: scores.composite_score.toFixed(2),
      }),
    );
  }

  /** 설계서 Part 4 §7.2 — 헬스 스코어 시계열. */
  async list(projectId: string, page: PageRequest): Promise<Page<HealthSnapshot>> {
    const qb = this.snapshots
      .createQueryBuilder('h')
      .where('h.project_id = :projectId', { projectId });

    return keysetPage(qb, 'measured_at', page, (h) => h.measured_at);
  }

  /**
   * `GET /health-snapshots` — 프로젝트를 가로지르는 헬스 스냅샷.
   *
   * 대시보드는 프로젝트별 시계열이 아니라 "최근에 어디가 나빠졌나"를 한 화면에서 본다.
   * 필터가 없는 이유: 스냅샷에는 골라 낼 만한 범주형 컬럼이 없다(점수는 연속값이다).
   * 임계치 필터가 필요해지면 그때 얹는 편이 싸다.
   */
  async listForMember(userId: string, page: PageRequest): Promise<ScopedPage<HealthSnapshot>> {
    // 범위를 **먼저** 좁힌다. 멤버가 아닌 프로젝트의 스냅샷이 섞이면 남의 프로젝트 이름과
    // 배포 건전성이 그대로 새어 나간다.
    const names = await memberProjects(this.members, userId);
    const ids = [...names.keys()];

    // IN ()은 문법 오류다. 멤버인 프로젝트가 없으면 질의 자체를 하지 않는다.
    if (ids.length === 0) return { items: [], next_cursor: null, project_names: names };

    const qb = this.snapshots.createQueryBuilder('h').where('h.project_id IN (:...ids)', { ids });

    const result = await keysetPage(qb, 'measured_at', page, (h) => h.measured_at);
    return { ...result, project_names: names };
  }
}
