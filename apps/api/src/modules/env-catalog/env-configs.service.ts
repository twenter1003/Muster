import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import {
  EnvConfigTransition,
  PolicyCheckResult,
  Project,
  ProjectEnvConfig,
  ProjectMember,
} from '../../database/entities';
import type { BuildStatus } from '../../database/entities/enums';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  buildPage,
  keysetPage,
  type Page,
  type PageRequest,
  type ScopedPage,
} from '../../common/pagination/paginate';
import { DOCKER_CONFIG_GENERATOR, type DockerConfigGenerator } from './docker-config-generator';
import { POLICY_GATE, type PolicyGate } from './policy-gate';
import { AuditService } from '../audit/audit.service';
import { EnvTemplatesService } from './env-templates.service';
import type { CreateEnvConfigDto } from './dto/create-env-config.dto';

@Injectable()
export class EnvConfigsService {
  private readonly logger = new Logger(EnvConfigsService.name);

  constructor(
    @InjectRepository(ProjectEnvConfig) private readonly configs: Repository<ProjectEnvConfig>,
    @InjectRepository(PolicyCheckResult) private readonly results: Repository<PolicyCheckResult>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @InjectRepository(EnvConfigTransition)
    private readonly transitionRepo: Repository<EnvConfigTransition>,
    @Inject(DOCKER_CONFIG_GENERATOR) private readonly generator: DockerConfigGenerator,
    @Inject(POLICY_GATE) private readonly gate: PolicyGate,
    private readonly templates: EnvTemplatesService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 상태를 바꾸고 그 사실을 이력에 남긴다. **상태 변경은 전부 이 메서드를 지난다** —
   * 한 군데라도 configs.save()로 직접 바꾸면 그 전이만 이력에서 빠지고, 그때부터 이력은
   * "대체로 맞는 기록"이 된다. 대체로 맞는 감사 자료는 쓸 수 없다.
   *
   * 한 트랜잭션으로 묶는 이유도 같다. 상태만 바뀌고 이력이 실패하면 화면은 approved인데
   * 승인한 사람이 없는 구성을 보여 주게 된다.
   */
  private async transitionTo(
    config: ProjectEnvConfig,
    to: BuildStatus,
    actorUserId: string | null,
    reason: string | null = null,
  ): Promise<ProjectEnvConfig> {
    const from = config.build_status;
    config.build_status = to;

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(config);
      await manager.save(
        manager.create(EnvConfigTransition, {
          env_config_id: saved.id,
          // 최초 생성은 직전 상태가 없다. 그 외에는 제자리 전이가 들어오지 않는다(CHECK가 막는다).
          from_status: from === to ? null : from,
          to_status: to,
          actor_user_id: actorUserId,
          reason,
        }),
      );
      return saved;
    });
  }

  async listForProject(projectId: string, page: PageRequest): Promise<Page<ProjectEnvConfig>> {
    const qb = this.configs
      .createQueryBuilder('c')
      .where('c.project_id = :projectId', { projectId })
      .orderBy('c.created_at', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .take(page.limit + 1);

    if (page.after) {
      qb.andWhere('(c.created_at, c.id) < (:ts, :id)', { ts: page.after.ts, id: page.after.id });
    }

    const rows = await qb.getMany();
    return buildPage(rows, page.limit, (c) => ({ ts: c.created_at.toISOString(), id: c.id }));
  }

  /**
   * `GET /env-configs` — 프로젝트를 가로지르는 환경 구성 목록. 사이드바의 EnvCatalog 화면이 쓴다.
   * 근거는 DocumentsService.listForMember 주석과 같다.
   */
  async listForMember(
    userId: string,
    page: PageRequest,
    filters: { build_status?: BuildStatus },
  ): Promise<ScopedPage<ProjectEnvConfig>> {
    // 범위를 **먼저** 좁힌다. 환경 구성은 남의 스택 구성과 차단 사유까지 실어 나른다.
    const names = await this.memberProjects(userId);
    const ids = [...names.keys()];

    // IN ()은 문법 오류다. 멤버인 프로젝트가 없으면 질의 자체를 하지 않는다.
    if (ids.length === 0) return { items: [], next_cursor: null, project_names: names };

    const qb = this.configs.createQueryBuilder('c').where('c.project_id IN (:...ids)', { ids });

    if (filters.build_status) {
      qb.andWhere('c.build_status = :status', { status: filters.build_status });
    }

    const result = await keysetPage(qb, 'created_at', page, (c) => c.created_at);
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

  /**
   * 설계서 Part 4 §5.2 — 환경 구성 생성.
   *
   * 생성 직후 Policy Gate를 자동으로 돌린다. 상태 전이도의 `generated → (자동 실행)`이
   * 그것이다. 여기서 돌리지 않고 별도 호출로 두면 검사되지 않은 채 승인 화면에 노출되는
   * 구성이 생긴다.
   */
  async create(
    projectId: string,
    userId: string,
    dto: CreateEnvConfigDto,
  ): Promise<ProjectEnvConfig> {
    const preset = dto.template_id ? await this.templates.presetFor(dto.template_id, userId) : null;

    const generated = await this.generator.generate({
      stackInput: dto.stack_input,
      inputMode: dto.input_mode,
      templatePreset: preset,
    });

    const created = this.configs.create({
      project_id: projectId,
      template_id: dto.template_id ?? null,
      stack_config: dto.stack_input,
      docker_config: {
        dockerfile: generated.dockerfile,
        compose: generated.compose,
        rationale: generated.rationale,
      },
      build_status: 'generated',
    });

    // 최초 저장도 이력을 남긴다. from_status는 없다(직전 상태가 존재하지 않는다).
    const config = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(created);
      await manager.save(
        manager.create(EnvConfigTransition, {
          env_config_id: saved.id,
          from_status: null,
          to_status: 'generated',
          actor_user_id: userId,
          reason: null,
        }),
      );
      return saved;
    });

    const checked = await this.runPolicyGate(config);
    await this.audit.record({
      user_id: userId,
      action: 'env_config.create',
      project_id: projectId,
    });
    return checked;
  }

  /**
   * Policy Gate 실행 + 판정.
   *
   * **AND 판정은 여기 한 곳에만 있다** (설계서 Part 4 §5.2). 승인 API는 개별 검사
   * 결과를 다시 보지 않고 build_status만 본다 — 판정이 두 곳에 흩어지면 서로 다른
   * 말을 하게 된다.
   */
  private async runPolicyGate(config: ProjectEnvConfig): Promise<ProjectEnvConfig> {
    const docker = config.docker_config as { dockerfile?: string; compose?: string | null };

    const checks = await this.gate.run({
      dockerfile: String(docker.dockerfile ?? ''),
      compose: docker.compose ?? null,
    });

    await this.results.save(
      checks.map((c) =>
        this.results.create({
          env_config_id: config.id,
          tool: c.tool,
          verdict: c.verdict,
          risk_notes: c.risk_notes,
        }),
      ),
    );

    const allPassed = checks.length > 0 && checks.every((c) => c.verdict === 'pass');
    const fails = checks.filter((c) => c.verdict === 'fail');

    // 행위자는 null이다 — 이 전이를 일으킨 것은 사람이 아니라 Policy Gate다.
    // 사람 이름을 적으면 "누가 막았나"에 잘못된 답이 남는다.
    return this.transitionTo(
      config,
      allPassed ? 'policy_passed' : 'policy_blocked',
      null,
      allPassed
        ? null
        : fails
            .map((c) => (c.risk_notes ? `${c.tool}: ${c.risk_notes}` : `${c.tool} 검사 실패`))
            .join(' · '),
    );
  }

  async detail(configId: string, userId: string): Promise<ProjectEnvConfig> {
    return this.findAccessibleOrFail(configId, userId);
  }

  /**
   * 상태 전이 이력. 시간 오름차순 — 이력은 지나온 순서대로 읽는 것이다.
   *
   * 페이지네이션이 없다. 한 구성의 전이는 많아야 대여섯 줄이고(생성 → 판정 → 승인/반려 →
   * 실행), 재생성을 반복해도 자릿수가 달라지지 않는다. 커서를 태우면 화면이 "지나온 길
   * 전부"를 그리려고 모든 페이지를 훑게 된다.
   */
  async transitions(configId: string, userId: string): Promise<EnvConfigTransition[]> {
    await this.findAccessibleOrFail(configId, userId);
    return this.transitionRepo.find({
      where: { env_config_id: configId },
      // 행위자 이름을 같은 질의로 가져온다. 줄마다 사용자를 다시 읽으면 N+1이다.
      relations: { actor: true },
      order: { created_at: 'ASC' },
    });
  }

  async policyChecks(configId: string, userId: string): Promise<PolicyCheckResult[]> {
    await this.findAccessibleOrFail(configId, userId);
    return this.results.find({
      where: { env_config_id: configId },
      order: { checked_at: 'ASC' },
    });
  }

  /**
   * 설계서 Part 4 §5.2 — 사람 승인. `policy_passed`에서만 가능하고 그 외는 409.
   *
   * 이 검사가 Policy Gate를 실효화한다. 상태만 보고 판정하므로, 검사에서 막힌 구성은
   * 사람이 승인하려 해도 통과시킬 수 없다 (Part 1 §3.2.1 — "사람의 승인 여부와
   * 무관하게 원천 차단").
   */
  async approve(configId: string, userId: string): Promise<ProjectEnvConfig> {
    const config = await this.findAccessibleOrFail(configId, userId);
    this.requireStatus(config, ['policy_passed'], '승인');

    const saved = await this.transitionTo(config, 'approved', userId);
    await this.audit.record({
      user_id: userId,
      action: 'env_config.approve',
      project_id: config.project_id,
    });
    return saved;
  }

  /** 반려. 승인 대기 상태에서만 의미가 있다. */
  async reject(configId: string, userId: string): Promise<ProjectEnvConfig> {
    const config = await this.findAccessibleOrFail(configId, userId);
    this.requireStatus(config, ['policy_passed', 'policy_blocked'], '반려');

    const saved = await this.transitionTo(config, 'rejected', userId);
    await this.audit.record({
      user_id: userId,
      action: 'env_config.reject',
      project_id: config.project_id,
    });
    return saved;
  }

  /**
   * 설계서 Part 4 §5.2 — 실행 트리거.
   *
   * 실행 인프라는 기술 사양서 9장의 미해결 사항이라, 여기서는 **상태 전이 계약만**
   * 정의한다. 어댑터가 붙기 전까지 running에서 더 나아가지 않는다.
   */
  async execute(configId: string, userId: string): Promise<ProjectEnvConfig> {
    const config = await this.findAccessibleOrFail(configId, userId);
    this.requireStatus(config, ['approved'], '실행');

    const saved = await this.transitionTo(config, 'running', userId);

    await this.audit.record({
      user_id: userId,
      action: 'env_config.execute',
      project_id: config.project_id,
    });

    this.logger.warn(
      `환경 구성 ${config.id}가 running으로 전이했지만 실행 어댑터가 없습니다 ` +
        `(기술 사양서 9장 미해결 — EnvCatalog 실행 인프라).`,
    );
    return saved;
  }

  private requireStatus(config: ProjectEnvConfig, allowed: BuildStatus[], action: string): void {
    if (allowed.includes(config.build_status)) return;

    throw new ApiException(
      ErrorCode.INVALID_STATE_TRANSITION,
      `${action}은(는) ${allowed.join(' 또는 ')} 상태에서만 가능합니다. 현재 상태: ${config.build_status}`,
      409,
    );
  }

  /** 구성 → 프로젝트 → 멤버십. 비멤버에게는 404다. */
  private async findAccessibleOrFail(configId: string, userId: string): Promise<ProjectEnvConfig> {
    const config = await this.configs.findOneBy({ id: configId });
    if (!config) throw ApiException.notFound('환경 구성을 찾을 수 없습니다.');

    const isMember = await this.members.countBy({
      project_id: config.project_id,
      user_id: userId,
    });
    if (!isMember) throw ApiException.notFound('환경 구성을 찾을 수 없습니다.');

    return config;
  }
}
