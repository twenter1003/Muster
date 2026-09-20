import { Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { DeploymentEvent } from '../../database/entities';
import { keysetPage, type Page, type PageRequest } from '../../common/pagination/paginate';

/**
 * 설계서 Part 4 §7.2의 읽기 전용 조회 — 배포 이벤트.
 *
 * 단계 전환 이력 조회(`GET /projects/:id/stage-history`)도 여기 있었으나, 그것을 그리던
 * ProjectOverviewPage가 PR #76에서 삭제되면서 같이 지웠다. PROJECT_STAGE_HISTORY 테이블과
 * 거기에 쓰는 ProjectCore 쪽은 그대로다 — 이력은 계속 쌓이고, 읽는 API 표면만 없다.
 */
@Injectable()
export class TimelineService {
  constructor(
    @InjectRepository(DeploymentEvent) private readonly deployments: Repository<DeploymentEvent>,
  ) {}

  /** DORA 지표 산출 원본 이벤트 조회. */
  async listDeployments(projectId: string, page: PageRequest): Promise<Page<DeploymentEvent>> {
    const qb = this.deployments
      .createQueryBuilder('d')
      .where('d.project_id = :projectId', { projectId });

    return keysetPage(qb, 'occurred_at', page, (d) => d.occurred_at);
  }
}
