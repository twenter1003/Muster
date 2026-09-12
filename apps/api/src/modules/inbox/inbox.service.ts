import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import {
  Agent,
  AgentRun,
  AuditLog,
  DeploymentEvent,
  PolicyCheckResult,
  Project,
  ProjectBudget,
  ProjectEnvConfig,
  ProjectMember,
} from '../../database/entities';
import {
  NOTABLE_AUDIT_ACTIONS,
  buildAuditItems,
  buildBudgetItems,
  buildDeploymentItems,
  buildPolicyItems,
  countByCategory,
  mergeItems,
  type AuditRow,
  type BudgetRow,
  type DeploymentRow,
  type EnvConfigRow,
  type InboxCategory,
  type InboxItem,
  type PolicyResultRow,
  type UsageRow,
} from './items';

const DAY = 24 * 60 * 60 * 1000;

/**
 * 배포 실패를 큐에 남겨 두는 기간.
 *
 * 14일인 이유: 이 항목이 사라지는 정상 경로는 "뒤이은 배포가 성공하는 것"이고(아래 질의는
 * 프로젝트의 **마지막** 이벤트만 본다), 그 경로가 막힌 채 2주가 지났다면 그건 인박스가
 * 처리를 재촉할 일이 아니라 방치된 프로젝트다. 기한 없이 두면 죽은 프로젝트의 마지막
 * 실패가 큐 맨 위에 영원히 남아 새 항목을 가린다.
 */
const DEPLOYMENT_FAILURE_DAYS = 14;

/**
 * 감사 항목을 큐에 남겨 두는 기간.
 *
 * 7일인 이유: 감사 항목은 "처리"가 아니라 "인지"가 목적이라(키가 발급됐다는 사실) 한 번
 * 보고 나면 끝이다. 읽음 표시가 없는 설계에서 유일하게 큐를 비우는 힘은 시간이고,
 * 일주일이면 같은 팀의 누군가가 알아채기에 충분하다.
 */
const NOTABLE_AUDIT_DAYS = 7;

/**
 * 출처별 상한과 전체 상한.
 *
 * 상한을 두는 이유는 아래 pagination 주석 참조. 한 출처가 나머지를 굶기지 않도록
 * 출처마다 따로 자른다 — 감사 기록 200건이 배포 실패 한 건을 밀어내면 안 된다.
 */
const PER_SOURCE_LIMIT = 50;
const MAX_ITEMS = 100;

export interface InboxResponse {
  items: InboxItem[];
  /**
   * 카테고리별 건수. 필터가 걸려 있어도 **전체 기준**으로 낸다 — 탭 배지는 그 탭을 보고
   * 있지 않을 때의 수를 보여줘야 한다. 사이드바의 "처리 대기 N"도 이 합이다.
   */
  counts: Record<InboxCategory, number> & { total: number };
  /** 상한에 걸려 잘렸는가. 잘렸다는 사실 자체가 화면에 표시돼야 한다. */
  truncated: boolean;
}

/**
 * 인박스 — "처리해야 할 일"의 큐.
 *
 * ## 알림 테이블을 만들지 않는다
 *
 * 설계서 본문의 화면↔API 표는 인박스를 `GET /audit-logs`로 매핑했지만, UI 설계서 08의
 * 예시 6개 중 4개(구성 차단·승인 대기·예산 78%·배포 실패)는 감사 로그에 존재하지 않는
 * 것들이다. 같은 문서가 스스로 답을 적었다: "인박스는 알림의 목록이 아니라 '처리해야 할
 * 일'의 큐다." 그래서 알림 행을 적재하는 대신 **현재 상태에서 유도**한다.
 *
 * - 큐 항목은 조건이 해소되면 사라져야 한다(승인하면 없어지고, 다음 배포가 성공하면 없어진다).
 *   저장된 알림 행은 그렇게 못 하고, 그래서 읽음 표시라는 별도 상태가 필요해진다.
 * - 파생 상태는 항상 정확하다. 쓰기 경로가 없으니 알림이 빠지거나 중복될 수 없다.
 * - 스키마·마이그레이션이 늘지 않는다.
 *
 * 따라서 **읽음/안읽음은 없다.** 목업의 "읽지 않음 4"는 "처리 대기 4"로 읽는다.
 *
 * ## 모듈 경계
 *
 * ReportsService와 같은 성격(여러 모듈의 데이터를 가로지르는 읽기 전용 조회)이라 다른
 * 모듈의 서비스를 호출하지 않고 리포지토리를 직접 주입한다. 엔티티는 모듈이 공유하는
 * 계약이다(database/entities/index.ts 상단 주석).
 *
 * ## 페이지네이션을 두지 않은 이유
 *
 * 키셋 커서는 (정렬키, 타이브레이커)가 **한 테이블 안에서 유일하고 안정적일 때만** 성립한다.
 * 여기서는 네 출처의 서로 다른 시각 컬럼을 섞어 정렬하므로, 커서 하나로 "이 지점 이후"를
 * 재현하려면 네 질의 모두에 같은 부등식을 걸고 다시 합쳐야 한다. 그런데 항목은 저장된
 * 행이 아니라 파생 상태라, 두 번째 페이지를 요청하는 사이에 승인 하나로 앞 페이지 항목이
 * 사라지면 오프셋이 밀려 항목이 누락된다. 커서를 흉내 내면 "안 빠뜨린다"는 커서의 유일한
 * 보장을 잃은 채 복잡도만 얻는다.
 *
 * 대신 상한을 두고 전부 반환한다. 이건 처리해야 할 일의 큐이고, 100건이 쌓였다면 다음
 * 페이지가 필요한 게 아니라 큐가 터진 것이다. 그 사실은 `truncated`로 알린다.
 */
@Injectable()
export class InboxService {
  constructor(
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @InjectRepository(ProjectEnvConfig) private readonly configs: Repository<ProjectEnvConfig>,
    @InjectRepository(PolicyCheckResult) private readonly policy: Repository<PolicyCheckResult>,
    @InjectRepository(ProjectBudget) private readonly budgets: Repository<ProjectBudget>,
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    @InjectRepository(DeploymentEvent) private readonly deployments: Repository<DeploymentEvent>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
  ) {}

  async list(userId: string, filter: { category?: InboxCategory }): Promise<InboxResponse> {
    // 범위를 **먼저** 좁힌다. 멤버가 아닌 프로젝트가 한 항목이라도 섞이면 그 프로젝트의
    // 이름·차단 사유·커밋 sha가 그대로 새어 나간다.
    const projects = await this.memberProjects(userId);
    const ids = [...projects.keys()];

    // IN ()은 문법 오류다. 멤버인 프로젝트가 없으면 질의 자체를 하지 않는다.
    if (ids.length === 0) {
      return {
        items: [],
        counts: { policy: 0, budget: 0, deployment: 0, audit: 0, total: 0 },
        truncated: false,
      };
    }

    const now = new Date();
    const [configs, budgets, usages, deployments, audits] = await Promise.all([
      this.pendingConfigs(ids),
      this.budgetRows(ids),
      this.usageRows(ids),
      this.failedDeployments(ids, now),
      this.notableAudits(ids, now),
    ]);

    // 정책 검사 결과는 위에서 고른 구성에만 필요하다. 구성마다 질의하면 N+1이라
    // 구성 id 목록으로 한 번에 가져온다.
    const results = await this.policyResults(configs.map((c) => c.id));

    const all = mergeItems([
      buildPolicyItems(configs, results, projects),
      buildBudgetItems(budgets, usages, projects),
      buildDeploymentItems(deployments, projects),
      buildAuditItems(audits, projects),
    ]);

    const counts = countByCategory(all);
    const filtered = filter.category ? all.filter((i) => i.category === filter.category) : all;

    return {
      items: filtered.slice(0, MAX_ITEMS),
      counts: { ...counts, total: all.length },
      truncated: filtered.length > MAX_ITEMS,
    };
  }

  /** 요청자가 멤버인, 살아 있는 프로젝트의 id→이름. 이 맵이 인박스의 전 범위다. */
  private async memberProjects(userId: string): Promise<Map<string, string>> {
    const rows = await this.members
      .createQueryBuilder('m')
      // soft delete된 프로젝트는 조인 조건에서 떨군다(ReportsService와 같은 방식).
      .innerJoin(Project, 'p', 'p.id = m.project_id AND p.deleted_at IS NULL')
      .select('m.project_id', 'project_id')
      .addSelect('p.name', 'name')
      .where('m.user_id = :userId', { userId })
      .getRawMany<{ project_id: string; name: string }>();

    return new Map(rows.map((r) => [r.project_id, r.name]));
  }

  /**
   * 프로젝트마다 **가장 최근** 환경 구성 하나만 보고, 그게 차단·승인대기면 항목으로 만든다.
   *
   * 최신 하나로 제한하는 이유: policy_blocked는 종료 상태라 영원히 그대로다. 전부 넣으면
   * 새 구성을 만들어 문제를 해결한 프로젝트도 과거 차단 기록이 큐에 계속 남는다. 새 구성이
   * 만들어졌다는 것은 이전 구성을 더 이상 처리하지 않겠다는 뜻이므로, 최신이 곧 큐다.
   */
  private async pendingConfigs(ids: string[]): Promise<EnvConfigRow[]> {
    return (
      this.configs
        .createQueryBuilder('c')
        // DISTINCT ON은 Postgres 전용이지만 이 프로젝트의 DB는 Postgres로 고정이고,
        // 윈도 함수를 쓰는 서브쿼리보다 의도가 그대로 드러난다.
        .distinctOn(['c.project_id'])
        .select(['c.id', 'c.project_id', 'c.build_status', 'c.created_at'])
        .where('c.project_id IN (:...ids)', { ids })
        .orderBy('c.project_id', 'ASC')
        .addOrderBy('c.created_at', 'DESC')
        .addOrderBy('c.id', 'DESC')
        .limit(PER_SOURCE_LIMIT)
        .getMany()
        .then((rows) =>
          rows
            .filter(
              (c) => c.build_status === 'policy_blocked' || c.build_status === 'policy_passed',
            )
            .map((c) => ({
              id: c.id,
              project_id: c.project_id,
              build_status: c.build_status,
              created_at: c.created_at,
            })),
        )
    );
  }

  private async policyResults(configIds: string[]): Promise<PolicyResultRow[]> {
    if (configIds.length === 0) return [];

    const rows = await this.policy
      .createQueryBuilder('r')
      .select(['r.env_config_id', 'r.tool', 'r.verdict', 'r.risk_notes'])
      .where('r.env_config_id IN (:...configIds)', { configIds })
      .orderBy('r.checked_at', 'ASC')
      .getMany();

    return rows.map((r) => ({
      env_config_id: r.env_config_id,
      tool: r.tool,
      verdict: r.verdict,
      risk_notes: r.risk_notes,
    }));
  }

  /** 한도가 하나라도 있는 예산만. 한도가 없으면 임계치를 넘을 수가 없다. */
  private async budgetRows(ids: string[]): Promise<BudgetRow[]> {
    const rows = await this.budgets
      .createQueryBuilder('b')
      .select([
        'b.project_id',
        'b.token_limit',
        'b.cost_limit',
        'b.alert_threshold_pct',
        'b.updated_at',
      ])
      .where('b.project_id IN (:...ids)', { ids })
      .andWhere('(b.token_limit IS NOT NULL OR b.cost_limit IS NOT NULL)')
      .getMany();

    return rows.map((b) => ({
      project_id: b.project_id,
      token_limit: b.token_limit,
      cost_limit: b.cost_limit,
      alert_threshold_pct: b.alert_threshold_pct,
      updated_at: b.updated_at,
    }));
  }

  /**
   * 프로젝트별 누적 사용량. GROUP BY 한 번으로 끝낸다(프로젝트마다 질의하면 N+1이다).
   *
   * 합계는 SQL의 SUM()이 낸다 — cost는 numeric(12,4)라 JS number로 더하면 금액이 어긋난다.
   * 기간을 자르지 않는 이유: 예산은 누적 한도이고, BudgetService.sumUsage도 전 기간을 센다.
   * 여기서만 30일로 자르면 설정 화면의 사용률과 인박스의 사용률이 달라진다.
   */
  private async usageRows(ids: string[]): Promise<UsageRow[]> {
    const rows = await this.runs
      .createQueryBuilder('r')
      .innerJoin(Agent, 'a', 'a.id = r.agent_id')
      .select('a.project_id', 'project_id')
      .addSelect('COALESCE(SUM(r.tokens_used), 0)', 'tokens')
      .addSelect('COALESCE(SUM(r.cost), 0)', 'cost')
      .addSelect('MAX(r.started_at)', 'last_run_at')
      .where('a.project_id IN (:...ids)', { ids })
      .groupBy('a.project_id')
      .getRawMany<{ project_id: string; tokens: string; cost: string; last_run_at: Date | null }>();

    return rows.map((r) => ({
      project_id: r.project_id,
      tokens: String(r.tokens),
      cost: String(r.cost),
      last_run_at: r.last_run_at === null ? null : new Date(r.last_run_at),
    }));
  }

  /**
   * 프로젝트별 **마지막** 배포 이벤트가 실패이고, 그게 최근인 것만.
   *
   * 마지막 것만 보는 게 곧 "복구되면 큐에서 사라진다"이다 — 뒤이은 성공이 들어오는 순간
   * 이 질의의 결과에서 빠진다. 실패를 전부 넣으면 이미 복구된 옛 실패가 큐를 막는다.
   */
  private async failedDeployments(ids: string[], now: Date): Promise<DeploymentRow[]> {
    const rows = await this.deployments
      .createQueryBuilder('e')
      .distinctOn(['e.project_id'])
      .select(['e.id', 'e.project_id', 'e.kind', 'e.status', 'e.commit_sha', 'e.occurred_at'])
      .where('e.project_id IN (:...ids)', { ids })
      .orderBy('e.project_id', 'ASC')
      .addOrderBy('e.occurred_at', 'DESC')
      .addOrderBy('e.id', 'DESC')
      .limit(PER_SOURCE_LIMIT)
      .getMany();

    const since = new Date(now.getTime() - DEPLOYMENT_FAILURE_DAYS * DAY);
    return (
      rows
        // 상태·기간 필터를 SQL에 넣지 않는 이유: WHERE로 성공을 먼저 걸러 버리면 "마지막
        // 이벤트가 실패인가"가 아니라 "실패가 하나라도 있는가"를 묻게 된다. 그러면 복구된
        // 프로젝트가 큐에 남는다. 프로젝트당 한 행만 올라오므로 여기서 거르는 비용은 없다.
        .filter((e) => e.status === 'failure' && e.occurred_at > since)
        .map((e) => ({
          id: e.id,
          project_id: e.project_id,
          kind: e.kind,
          commit_sha: e.commit_sha,
          occurred_at: e.occurred_at,
        }))
    );
  }

  /**
   * 알릴 가치가 있는 감사 기록만. 고른 액션과 그 기준은 items.ts의 NOTABLE_AUDIT 주석 참조.
   *
   * 요청자 본인의 기록만이 아니라 **범위 프로젝트의 모든 멤버 기록**을 본다 — 동료가 API
   * 키를 발급한 사실이야말로 내가 알아야 할 일이고, 내가 한 일은 이미 알고 있다.
   */
  private async notableAudits(ids: string[], now: Date): Promise<AuditRow[]> {
    const rows = await this.audit
      .createQueryBuilder('a')
      // 행위자 이름이 곧 원인이라 조인해서 한 번에 가져온다(클라이언트가 user_id마다
      // 다시 조회하면 그게 N+1이다).
      .innerJoin('a.user', 'u')
      .select('a.id', 'id')
      .addSelect('a.project_id', 'project_id')
      .addSelect('a.action', 'action')
      .addSelect('a.created_at', 'created_at')
      .addSelect('u.github_login', 'actor')
      .where('a.project_id IN (:...ids)', { ids })
      .andWhere('a.action IN (:...actions)', { actions: NOTABLE_AUDIT_ACTIONS })
      .andWhere('a.created_at > :since', {
        since: new Date(now.getTime() - NOTABLE_AUDIT_DAYS * DAY),
      })
      .orderBy('a.created_at', 'DESC')
      .limit(PER_SOURCE_LIMIT)
      .getRawMany<{
        id: string;
        project_id: string;
        action: AuditRow['action'];
        created_at: Date;
        actor: string;
      }>();

    return rows.map((r) => ({
      id: r.id,
      project_id: r.project_id,
      action: r.action,
      actor: r.actor,
      created_at: new Date(r.created_at),
    }));
  }
}
