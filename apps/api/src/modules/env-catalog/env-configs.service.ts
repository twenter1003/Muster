import { Inject, Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import {
  PolicyCheckResult,
  ProjectEnvConfig,
  ProjectMember,
} from '../../database/entities';
import type { BuildStatus } from '../../database/entities/enums';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { buildPage, type Page, type PageRequest } from '../../common/pagination/paginate';
import { DOCKER_CONFIG_GENERATOR, type DockerConfigGenerator } from './docker-config-generator';
import { POLICY_GATE, type PolicyGate } from './policy-gate';
import { EnvTemplatesService } from './env-templates.service';
import type { CreateEnvConfigDto } from './dto/create-env-config.dto';

@Injectable()
export class EnvConfigsService {
  private readonly logger = new Logger(EnvConfigsService.name);

  constructor(
    @InjectRepository(ProjectEnvConfig) private readonly configs: Repository<ProjectEnvConfig>,
    @InjectRepository(PolicyCheckResult) private readonly results: Repository<PolicyCheckResult>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @Inject(DOCKER_CONFIG_GENERATOR) private readonly generator: DockerConfigGenerator,
    @Inject(POLICY_GATE) private readonly gate: PolicyGate,
    private readonly templates: EnvTemplatesService,
  ) {}

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
    const preset = dto.template_id
      ? await this.templates.presetFor(dto.template_id, userId)
      : null;

    const generated = await this.generator.generate({
      stackInput: dto.stack_input,
      inputMode: dto.input_mode,
      templatePreset: preset,
    });

    const config = await this.configs.save(
      this.configs.create({
        project_id: projectId,
        template_id: dto.template_id ?? null,
        stack_config: dto.stack_input,
        docker_config: {
          dockerfile: generated.dockerfile,
          compose: generated.compose,
          rationale: generated.rationale,
        },
        build_status: 'generated',
      }),
    );

    return this.runPolicyGate(config);
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
    config.build_status = allPassed ? 'policy_passed' : 'policy_blocked';

    return this.configs.save(config);
  }

  async detail(configId: string, userId: string): Promise<ProjectEnvConfig> {
    return this.findAccessibleOrFail(configId, userId);
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

    config.build_status = 'approved';
    return this.configs.save(config);
  }

  /** 반려. 승인 대기 상태에서만 의미가 있다. */
  async reject(configId: string, userId: string): Promise<ProjectEnvConfig> {
    const config = await this.findAccessibleOrFail(configId, userId);
    this.requireStatus(config, ['policy_passed', 'policy_blocked'], '반려');

    config.build_status = 'rejected';
    return this.configs.save(config);
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

    config.build_status = 'running';
    const saved = await this.configs.save(config);

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
