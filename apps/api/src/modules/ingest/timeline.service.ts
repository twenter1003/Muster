import { Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { DeploymentEvent, ProjectStageHistory } from '../../database/entities';
import { keysetPage, type Page, type PageRequest } from '../../common/pagination/paginate';

/**
 * 설계서 Part 4 §7.2의 읽기 전용 조회 두 개 — 배포 이벤트, 단계 전환 이력.
 *
 * PROJECT_STAGE_HISTORY에 쓰는 쪽은 ProjectCore다 (current_stage 변경과 같은 트랜잭션).
 * 이벤트로 넘겨받아 여기서 쓰면 발행이 실패한 순간 타임라인에 구멍이 나는데, 그건
 * 이력 테이블이 존재하는 이유와 정면으로 어긋난다. 여기서는 읽기만 한다.
 */
@Injectable()
export class TimelineService {
  constructor(
    @InjectRepository(DeploymentEvent) private readonly deployments: Repository<DeploymentEvent>,
    @InjectRepository(ProjectStageHistory) private readonly stages: Repository<ProjectStageHistory>,
  ) {}

  /** DORA 지표 산출 원본 이벤트 조회. */
  async listDeployments(projectId: string, page: PageRequest): Promise<Page<DeploymentEvent>> {
    const qb = this.deployments
      .createQueryBuilder('d')
      .where('d.project_id = :projectId', { projectId });

    return keysetPage(qb, 'occurred_at', page, (d) => d.occurred_at);
  }

  /** 진행 단계 전환 이력 (Part 1 §3.4 타임라인). */
  async listStages(projectId: string, page: PageRequest): Promise<Page<ProjectStageHistory>> {
    const qb = this.stages
      .createQueryBuilder('s')
      .where('s.project_id = :projectId', { projectId });

    return keysetPage(qb, 'entered_at', page, (s) => s.entered_at);
  }
}
