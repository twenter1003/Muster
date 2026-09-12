import type { AgentRunStatus, PolicyTool } from '../../database/entities/enums';
import { compareDecimals, sumDecimals } from './decimal';

/**
 * SQL이 내준 그룹별 원시 행을 응답 형태로 바꾸는 순수 함수들.
 *
 * 서비스에서 분리한 이유: 여기가 실제로 틀리기 쉬운 부분이다(나머지 묶음, 0건일 때의 비율,
 * 어떤 건수를 분모로 삼는지). DB 없이 고정 데이터로 경계값을 찍어볼 수 있어야 한다 —
 * ingest/dora.ts와 같은 이유다. 그룹핑 자체의 정확성은 Postgres가 보장한다.
 */

/** 응답에 항목으로 남길 프로젝트 수. 나머지는 한 줄로 묶는다. */
export const TOP_PROJECT_COUNT = 5;

export interface CostByProject {
  items: { project_id: string; name: string; cost: string }[];
  /** 상위 N개에 들지 못한 프로젝트들의 합. 해당 없으면 null. */
  others: { project_count: number; cost: string } | null;
  /** 집계 범위 전체 합. items + others와 반드시 일치한다. */
  total: string;
}

export interface RunOutcomes {
  succeeded: number;
  failed: number;
  cancelled: number;
  /** 아직 끝나지 않은 실행. 성공률의 분모에서 뺀다 — 결과가 아직 없기 때문이다. */
  running: number;
  /** succeeded / (succeeded+failed+cancelled). 종료된 실행이 0건이면 null. */
  success_rate: number | null;
  /**
   * 구간 내 토큰 사용량 합계. 대시보드의 "오늘 토큰" KPI가 이 값을 쓴다.
   *
   * 문자열인 이유: Postgres의 SUM(integer)은 bigint라 드라이버가 문자열로 준다.
   * 건수(COUNT)와 달리 토큰은 자릿수가 커질 수 있어 number로 옮기지 않는다 —
   * 비용을 문자열로 다루는 것과 같은 이유다.
   */
  tokens_used: string;
}

export interface PolicyGate {
  /** 실제로 돌아간 검사 행 수 (도구 하나가 한 행). */
  total_checks: number;
  /** 검사를 거친 환경 구성 수. 아래 비율의 분모다. */
  configs_checked: number;
  /** fail이 한 건도 없었던 환경 구성 수 — "1차 통과". */
  first_pass_configs: number;
  first_pass_rate: number | null;
  trivy_blocked: number;
  conftest_blocked: number;
  /**
   * 사유별 건수와 **가장 최근에 그 사유로 막힌 구성**.
   *
   * latest가 있어야 화면이 "이 사유로 막힌 구성 보기"로 넘어갈 수 있다. 사유 문구만 주던
   * 때에는 사용자가 프로젝트를 하나씩 열어 찾아야 했다.
   */
  top_block_reasons: {
    reason: string;
    count: number;
    latest: { env_config_id: string; project_id: string };
  }[];
}

/** cost_by_project — 비용 내림차순 상위 N개 + 나머지 묶음. */
export function buildCostByProject(
  rows: readonly { project_id: string; cost: string }[],
  names: ReadonlyMap<string, string>,
): CostByProject {
  // SQL에서 이미 정렬해 오지만, 정렬을 여기서도 보장한다 — 이 함수의 계약이 "상위 N개"라
  // 입력 순서에 의존하면 호출부를 고칠 때 조용히 틀린 답이 나온다.
  const sorted = [...rows].sort((a, b) => compareDecimals(b.cost, a.cost));
  const top = sorted.slice(0, TOP_PROJECT_COUNT);
  const rest = sorted.slice(TOP_PROJECT_COUNT);

  return {
    items: top.map((r) => ({
      project_id: r.project_id,
      name: names.get(r.project_id) ?? '',
      cost: sumDecimals([r.cost]), // 자리수를 items 전체에서 통일한다.
    })),
    others:
      rest.length > 0
        ? { project_count: rest.length, cost: sumDecimals(rest.map((r) => r.cost)) }
        : null,
    total: sumDecimals(sorted.map((r) => r.cost)),
  };
}

/** run_outcomes — 상태별 건수와 성공률. */
export function buildRunOutcomes(
  rows: readonly { status: AgentRunStatus; count: number; tokens: string }[],
): RunOutcomes {
  const of = (status: AgentRunStatus) => rows.find((r) => r.status === status)?.count ?? 0;

  const succeeded = of('succeeded');
  const failed = of('failed');
  const cancelled = of('cancelled');
  const terminal = succeeded + failed + cancelled;

  return {
    succeeded,
    failed,
    cancelled,
    running: of('running'),
    // 0건일 때 0을 주면 "전부 실패했다"로 읽힌다. 모른다는 뜻의 null이 맞다.
    success_rate: terminal === 0 ? null : round4(succeeded / terminal),
    // 정수 합이라 BigInt로 더한다. 상태별 부분합을 number로 옮겼다가 다시 더하면
    // 큰 값에서 정밀도를 잃는다.
    tokens_used: rows.reduce((sum, r) => sum + BigInt(r.tokens || '0'), 0n).toString(),
  };
}

/** policy_gate — 검사 건수, 1차 통과, 도구별 차단, 차단 사유 순위. */
export function buildPolicyGate(input: {
  verdicts: readonly { tool: PolicyTool; verdict: 'pass' | 'fail'; count: number }[];
  /** 환경 구성별 fail 행 수. fail이 0이면 1차 통과다. */
  configFailCounts: readonly { fails: number }[];
  reasons: readonly {
    reason: string;
    count: number;
    latest: { env_config_id: string; project_id: string };
  }[];
}): PolicyGate {
  const total_checks = input.verdicts.reduce((sum, v) => sum + v.count, 0);
  const blocked = (tool: PolicyTool) =>
    input.verdicts.find((v) => v.tool === tool && v.verdict === 'fail')?.count ?? 0;

  const configs_checked = input.configFailCounts.length;
  const first_pass_configs = input.configFailCounts.filter((c) => c.fails === 0).length;

  return {
    total_checks,
    configs_checked,
    first_pass_configs,
    first_pass_rate: configs_checked === 0 ? null : round4(first_pass_configs / configs_checked),
    trivy_blocked: blocked('trivy'),
    conftest_blocked: blocked('conftest'),
    top_block_reasons: input.reasons.map((r) => ({
      reason: r.reason,
      count: r.count,
      latest: r.latest,
    })),
  };
}

/** 비율은 표시용이라 배정밀도로 충분하다. 자리수만 고정해 응답이 흔들리지 않게 한다. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
