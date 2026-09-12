import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import {
  AgentRun,
  DeploymentEvent,
  PolicyCheckResult,
  Project,
  ProjectMember,
} from '../../database/entities';
import type { AgentRunStatus, PolicyTool } from '../../database/entities/enums';
import { ApiException } from '../../common/errors/api.exception';
import { WINDOW_DAYS, scoreDora, type DoraScores, type ScoredEvent } from '../ingest/dora';
import {
  buildCostByProject,
  buildPolicyGate,
  buildRunOutcomes,
  type CostByProject,
  type PolicyGate,
  type RunOutcomes,
} from './aggregate';

const DAY = 24 * 60 * 60 * 1000;

/**
 * 기본 구간: 최근 30일.
 *
 * 리포트 화면의 토글은 7일·30일·분기다. 그 중 30일을 기본으로 잡는 이유는 두 가지다.
 * 7일은 주말이 끼면 배포·실행이 거의 없는 프로젝트에서 표가 통째로 비어 "고장난 화면"으로
 * 보이고, 분기는 방금 바뀐 것이 평균에 묻혀 지금 상태를 읽을 수 없다. 비용이 청구되는
 * 단위가 월이라, 비용 집계를 눈으로 대조하기에도 30일이 맞다.
 */
export const DEFAULT_WINDOW_DAYS = 30;

/** 차단 사유 순위에 남길 개수. 그 아래는 꼬리가 길어 화면에서 의미를 잃는다. */
const TOP_REASON_COUNT = 5;

export interface ReportSummary {
  window: { from: string; to: string };
  cost_by_project: CostByProject;
  run_outcomes: RunOutcomes;
  policy_gate: PolicyGate;
  dora: DoraScores & {
    /**
     * DORA만 요청 구간(from~to)을 따르지 않고 to 기준 고정 관측 창을 쓴다는 사실을 응답에
     * 명시한다. 아래 summary()의 주석 참조.
     */
    window_days: number;
    projects_counted: number;
  };
}

/**
 * 리포트 화면용 서버 집계.
 *
 * **설계서 Part 2 §2의 7개 모듈 목록에 없는 신설 모듈이다.** UI가 요구하는 집계인데 대응
 * 엔드포인트가 없었고, 클라이언트가 AGENT_RUNS를 페이지네이션으로 전부 긁어 합산하는 것은
 * 전송량 문제이기 이전에 numeric 비용을 JS 부동소수점으로 더하게 만든다.
 *
 * 읽기 전용이며 다른 모듈의 서비스를 호출하지 않는다 — 리포지토리를 직접 주입해 쓴다.
 * ingest/dora.ts의 scoreDora만 import한다. 등급표를 복제하면 두 벌이 되어 갈라지고,
 * Part 2 §8의 경계 규칙은 "Ingest가 밖을 호출하지 않는다"는 방향의 규칙이라 밖에서 ingest의
 * 순수 함수를 읽는 것은 걸리지 않는다(.eslintrc.js의 override가 ingest/**에만 걸려 있고,
 * module-boundary.spec.ts도 ingest 디렉터리만 검사한다).
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    @InjectRepository(PolicyCheckResult) private readonly policy: Repository<PolicyCheckResult>,
    @InjectRepository(DeploymentEvent) private readonly deployments: Repository<DeploymentEvent>,
  ) {}

  async summary(userId: string, range: { from?: string; to?: string }): Promise<ReportSummary> {
    const { from, to } = resolveRange(range);

    // 범위를 **먼저** 좁힌다. 이 목록에 없는 프로젝트는 어떤 집계에도 섞이지 않는다 —
    // 집계값 하나만 새어 나가도 남의 프로젝트가 존재한다는 사실과 그 비용 규모가 드러난다.
    const scope = await this.memberProjects(userId);
    const ids = [...scope.keys()];

    // IN ()은 문법 오류다. 멤버인 프로젝트가 없으면 질의 자체를 하지 않는다.
    if (ids.length === 0) return emptySummary(from, to);

    const [costRows, statusRows, verdicts, configFails, reasons, events] = await Promise.all([
      this.costByProject(ids, from, to),
      this.runStatusCounts(ids, from, to),
      this.policyVerdictCounts(ids, from, to),
      this.policyConfigFailCounts(ids, from, to),
      this.policyTopReasons(ids, from, to),
      this.deploymentEvents(ids, to),
    ]);

    return {
      window: { from: from.toISOString(), to: to.toISOString() },
      cost_by_project: buildCostByProject(costRows, scope),
      run_outcomes: buildRunOutcomes(statusRows),
      policy_gate: buildPolicyGate({ verdicts, configFailCounts: configFails, reasons }),
      dora: { ...scoreDora(events, to), window_days: WINDOW_DAYS, projects_counted: ids.length },
    };
  }

  /** 요청자가 멤버인, 살아 있는 프로젝트의 id→이름. 이 맵이 모든 집계의 범위다. */
  private async memberProjects(userId: string): Promise<Map<string, string>> {
    const rows = await this.members
      .createQueryBuilder('m')
      // soft delete된 프로젝트를 조인 조건에서 떨군다. 별도 WHERE로 두면 조건을 빠뜨렸을 때
      // 삭제된 프로젝트가 조용히 집계에 들어온다.
      .innerJoin(Project, 'p', 'p.id = m.project_id AND p.deleted_at IS NULL')
      .select('m.project_id', 'project_id')
      .addSelect('p.name', 'name')
      .where('m.user_id = :userId', { userId })
      .getRawMany<{ project_id: string; name: string }>();

    return new Map(rows.map((r) => [r.project_id, r.name]));
  }

  /**
   * 프로젝트별 비용 합계. GROUP BY 한 번으로 끝낸다(프로젝트마다 질의하면 N+1이다).
   *
   * SUM은 SQL에서 한다. numeric은 Postgres가 정확히 더하지만 JS의 number로 옮기는 순간
   * 오차가 생긴다. 결과는 문자열 그대로 들고 다닌다.
   */
  private costByProject(ids: string[], from: Date, to: Date) {
    return (
      this.runs
        .createQueryBuilder('r')
        .innerJoin('r.agent', 'a')
        .select('a.project_id', 'project_id')
        .addSelect('SUM(r.cost)', 'cost')
        .where('a.project_id IN (:...ids)', { ids })
        // 실행이 구간에 속하는 기준은 시작 시각이다. 종료 시각으로 잡으면 아직 돌고 있는
        // 실행(ended_at이 null)이 어느 구간에도 들어가지 않는다.
        .andWhere('r.started_at >= :from AND r.started_at < :to', { from, to })
        .groupBy('a.project_id')
        .orderBy('cost', 'DESC')
        .getRawMany<{ project_id: string; cost: string }>()
    );
  }

  private async runStatusCounts(ids: string[], from: Date, to: Date) {
    const rows = await this.runs
      .createQueryBuilder('r')
      .innerJoin('r.agent', 'a')
      .select('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('a.project_id IN (:...ids)', { ids })
      .andWhere('r.started_at >= :from AND r.started_at < :to', { from, to })
      .groupBy('r.status')
      .getRawMany<{ status: AgentRunStatus; count: string }>();

    // COUNT(*)는 bigint라 드라이버가 문자열로 준다. 건수는 Number.MAX_SAFE_INTEGER 근처에
    // 갈 일이 없으므로 여기서만 number로 바꾼다(비용과 달리 소수가 없다).
    return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
  }

  private async policyVerdictCounts(ids: string[], from: Date, to: Date) {
    const rows = await this.policyScope(ids, from, to)
      .select('r.tool', 'tool')
      .addSelect('r.verdict', 'verdict')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.tool')
      .addGroupBy('r.verdict')
      .getRawMany<{ tool: PolicyTool; verdict: 'pass' | 'fail'; count: string }>();

    return rows.map((r) => ({ tool: r.tool, verdict: r.verdict, count: Number(r.count) }));
  }

  /** 환경 구성별 fail 행 수. fail이 0이면 "1차 통과"다. */
  private async policyConfigFailCounts(ids: string[], from: Date, to: Date) {
    const rows = await this.policyScope(ids, from, to)
      .select('r.env_config_id', 'env_config_id')
      .addSelect("COUNT(*) FILTER (WHERE r.verdict = 'fail')", 'fails')
      .groupBy('r.env_config_id')
      .getRawMany<{ env_config_id: string; fails: string }>();

    return rows.map((r) => ({ fails: Number(r.fails) }));
  }

  private async policyTopReasons(ids: string[], from: Date, to: Date) {
    const rows = await this.policyScope(ids, from, to)
      .select('r.risk_notes', 'reason')
      .addSelect('COUNT(*)', 'count')
      .andWhere("r.verdict = 'fail'")
      .andWhere('r.risk_notes IS NOT NULL')
      .groupBy('r.risk_notes')
      .orderBy('count', 'DESC')
      .limit(TOP_REASON_COUNT)
      .getRawMany<{ reason: string; count: string }>();

    return rows.map((r) => ({ reason: r.reason, count: Number(r.count) }));
  }

  /** 세 정책 질의가 공유하는 범위·구간 조건. 한 곳에서만 정의해 셋이 갈라지지 않게 한다. */
  private policyScope(ids: string[], from: Date, to: Date) {
    return this.policy
      .createQueryBuilder('r')
      .innerJoin('r.env_config', 'c')
      .where('c.project_id IN (:...ids)', { ids })
      .andWhere('r.checked_at >= :from AND r.checked_at < :to', { from, to });
  }

  /**
   * DORA 입력 이벤트.
   *
   * from~to가 아니라 **to 기준 WINDOW_DAYS(90일)** 창을 쓴다. scoreDora의 등급 구간은
   * 90일 관측 창을 전제로 만들어져 있어("주 1회 이상" 같은 빈도 판정의 분모다), 7일치
   * 이벤트를 그대로 넣으면 배포 빈도가 실제의 1/13로 계산된다. 임의 구간에 맞춰 등급표를
   * 다시 만드는 것은 등급표를 두 벌로 만드는 일이라 하지 않는다. 대신 응답의
   * `dora.window_days`로 이 지표만 다른 창을 본다는 사실을 드러낸다.
   */
  private async deploymentEvents(ids: string[], to: Date): Promise<ScoredEvent[]> {
    const events = await this.deployments
      .createQueryBuilder('e')
      .select(['e.status', 'e.committed_at', 'e.occurred_at'])
      .where('e.project_id IN (:...ids)', { ids })
      .andWhere('e.occurred_at > :since', { since: new Date(to.getTime() - WINDOW_DAYS * DAY) })
      .andWhere('e.occurred_at <= :to', { to })
      .orderBy('e.occurred_at', 'ASC')
      .getMany();

    return events as ScoredEvent[];
  }
}

/** from/to를 확정한다. 반열린 구간 [from, to)이라 경계의 한 건이 양쪽에 중복되지 않는다. */
function resolveRange(range: { from?: string; to?: string }): { from: Date; to: Date } {
  const to = range.to ? new Date(range.to) : new Date();
  const from = range.from
    ? new Date(range.from)
    : new Date(to.getTime() - DEFAULT_WINDOW_DAYS * DAY);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw ApiException.validationFailed('from/to가 해석 가능한 시각이 아닙니다.');
  }
  if (from >= to) {
    throw ApiException.validationFailed('from은 to보다 앞서야 합니다.');
  }

  return { from, to };
}

/**
 * 멤버인 프로젝트가 하나도 없을 때의 응답.
 * 404나 에러가 아니다 — "집계할 것이 없다"는 정상적인 상태이고, 화면은 빈 표를 그려야 한다.
 */
function emptySummary(from: Date, to: Date): ReportSummary {
  return {
    window: { from: from.toISOString(), to: to.toISOString() },
    cost_by_project: { items: [], others: null, total: '0.0000' },
    run_outcomes: { succeeded: 0, failed: 0, cancelled: 0, running: 0, success_rate: null },
    policy_gate: {
      total_checks: 0,
      configs_checked: 0,
      first_pass_configs: 0,
      first_pass_rate: null,
      trivy_blocked: 0,
      conftest_blocked: 0,
      top_block_reasons: [],
    },
    dora: {
      deploy_freq_score: null,
      lead_time_score: null,
      change_fail_score: null,
      mttr_score: null,
      composite_score: null,
      window_days: WINDOW_DAYS,
      projects_counted: 0,
    },
  };
}
