import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, IsNull, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Project, ProjectMember, ProjectStageHistory } from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import { buildPage, type Page, type PageRequest } from '../../common/pagination/paginate';
import { DomainEvent, type ProjectStageChangedEvent } from '../../common/events/domain-events';
import { AuditService } from '../audit/audit.service';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
  ) {}

  /**
   * 설계서 Part 4 §3 — 내가 속한 프로젝트 목록.
   * 커서 페이지네이션은 (created_at, id) 키셋 방식이다.
   */
  async listForUser(userId: string, page: PageRequest): Promise<Page<Project>> {
    const qb = this.projects
      .createQueryBuilder('p')
      .innerJoin(ProjectMember, 'm', 'm.project_id = p.id AND m.user_id = :userId', { userId })
      .orderBy('p.created_at', 'DESC')
      .addOrderBy('p.id', 'DESC')
      // 다음 페이지 유무를 별도 count 없이 판정하기 위해 하나 더 가져온다.
      .take(page.limit + 1);

    if (page.after) {
      // 정렬 키가 같은 행이 있어도 순서가 흔들리지 않도록 (created_at, id) 튜플로 비교한다.
      qb.andWhere('(p.created_at, p.id) < (:ts, :id)', {
        ts: page.after.ts,
        id: page.after.id,
      });
    }

    const rows = await qb.getMany();
    return buildPage(rows, page.limit, (p) => ({ ts: p.created_at.toISOString(), id: p.id }));
  }

  /**
   * 생성 시 요청자를 owner로 등록한다 (설계서 Part 4 §3).
   * 멤버십 없이 프로젝트만 남으면 아무도 접근할 수 없는 고아가 되므로 한 트랜잭션으로 묶는다.
   */
  async create(userId: string, dto: CreateProjectDto): Promise<Project> {
    return this.dataSource.transaction(async (manager) => {
      const project = await manager.save(manager.create(Project, { name: dto.name }));

      await manager.save(
        manager.create(ProjectMember, {
          project_id: project.id,
          user_id: userId,
          role: 'owner',
        }),
      );

      // 최초 단계도 이력에 남겨야 타임라인이 생성 시점부터 이어진다.
      await manager.save(
        manager.create(ProjectStageHistory, {
          project_id: project.id,
          stage: project.current_stage,
        }),
      );

      // 이미 트랜잭션 안이라 같은 매니저를 넘긴다 — 프로젝트·멤버십·감사 기록이 한 덩어리다.
      await this.audit.record(
        { user_id: userId, action: 'project.create', project_id: project.id },
        manager,
      );

      return project;
    });
  }

  /** soft delete라 @DeleteDateColumn 덕분에 삭제된 프로젝트는 자동으로 제외된다. */
  async findOneOrFail(projectId: string): Promise<Project> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project) throw ApiException.notFound('프로젝트를 찾을 수 없습니다.');
    return project;
  }

  /**
   * userId를 받는 이유는 감사 기록뿐이다 — 갱신 자체에는 쓰이지 않는다.
   * 컨트롤러에서 따로 기록하지 않고 여기로 내린 것은, 이미 열려 있는 트랜잭션에
   * 같은 매니저로 넣기 위해서다.
   */
  async update(projectId: string, userId: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOneOrFail(projectId);
    const stageChanged =
      dto.current_stage !== undefined && dto.current_stage !== project.current_stage;

    const saved = await this.dataSource.transaction(async (manager) => {
      if (dto.name !== undefined) project.name = dto.name;
      if (dto.current_stage !== undefined) project.current_stage = dto.current_stage;

      const saved = await manager.save(project);

      // current_stage는 현재 상태만 담고, 전환 이력은 별도 테이블이 담당한다
      // (설계서 Part 1 §3.4 타임라인 시각화의 전제).
      if (stageChanged) {
        await manager.save(
          manager.create(ProjectStageHistory, {
            project_id: saved.id,
            stage: saved.current_stage,
          }),
        );
      }

      await this.audit.record(
        { user_id: userId, action: 'project.update', project_id: saved.id },
        manager,
      );

      return saved;
    });

    // 커밋 뒤에 발행한다 (Part 4 §7.3의 SSE `stage_change`). 트랜잭션 안에서 발행하면
    // 롤백된 전환이 화면에만 남는다. 이력 자체는 위에서 current_stage와 원자적으로
    // 기록되므로, 발행이 실패해도 타임라인에는 구멍이 나지 않는다.
    if (stageChanged) {
      this.events.emit(DomainEvent.PROJECT_STAGE_CHANGED, {
        project_id: saved.id,
        stage: saved.current_stage,
        entered_at: new Date().toISOString(),
      } satisfies ProjectStageChangedEvent);
    }

    return saved;
  }

  /**
   * 설계서 Part 4 §3 — soft delete. 감사 로그 보존을 위해 물리 삭제하지 않는다.
   * GCS 문서 파일은 30일 경과 후 별도 정리한다(해당 배치는 아직 없음).
   */
  async softDelete(projectId: string, userId: string): Promise<void> {
    await this.findOneOrFail(projectId);
    await this.projects.softDelete(projectId);
    await this.audit.record({ user_id: userId, action: 'project.delete', project_id: projectId });
  }

  /** 설계서 Part 4 §1 — 프로젝트 하위 리소스는 요청자가 PROJECT_MEMBERS인지 검사한다. */
  async isMember(projectId: string, userId: string): Promise<boolean> {
    const count = await this.members.countBy({ project_id: projectId, user_id: userId });
    return count > 0;
  }

  /**
   * owner가 아니면 404를 던진다.
   *
   * 가드(ProjectOwnerGuard)를 쓸 수 없는 경로를 위한 것이다 — 경로 파라미터가 프로젝트 id가
   * 아닐 때(예: 초대 id로 폐기할 때). 권한 부족을 403이 아니라 404로 만드는 이유는 가드와
   * 같다: 응답이 갈리면 그 차이가 곧 "그 프로젝트가 존재한다"는 정보다.
   */
  async assertOwner(projectId: string, userId: string): Promise<void> {
    const [exists, owner] = await Promise.all([
      this.projects.countBy({ id: projectId, deleted_at: IsNull() }),
      this.members.countBy({ project_id: projectId, user_id: userId, role: 'owner' }),
    ]);

    if (!exists || !owner) throw ApiException.notFound('프로젝트를 찾을 수 없습니다.');
  }

  /** soft delete되지 않은 프로젝트인지 확인한다. */
  async exists(projectId: string): Promise<boolean> {
    const count = await this.projects.countBy({ id: projectId, deleted_at: IsNull() });
    return count > 0;
  }
}
