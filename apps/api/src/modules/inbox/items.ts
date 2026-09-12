import type { AuditAction, BuildStatus, PolicyTool } from '../../database/entities/enums';

/**
 * 원시 행 → 인박스 항목으로 바꾸는 순수 함수들.
 *
 * 서비스에서 분리한 이유는 reports/aggregate.ts와 같다: 실제로 틀리기 쉬운 곳이 여기다
 * (임계치 경계, 사유 문구 조립, 한도가 둘 다 있을 때 무엇을 보여줄지). DB 없이 고정
 * 데이터로 경계값을 찍어볼 수 있어야 한다. 범위 좁히기와 그룹핑은 SQL이 책임진다.
 */

/** 목업의 필터 탭(전체 · 예산 · Policy · 배포)과 1:1로 대응한다. */
export const INBOX_CATEGORIES = ['policy', 'budget', 'deployment', 'audit'] as const;
export type InboxCategory = (typeof INBOX_CATEGORIES)[number];

/**
 * 화면이 신호색(붉은색)을 쓸지 가르는 값.
 *
 * 화면이 category와 approvable로 역산하던 것을 서버로 옮긴다. 역산으로는 예산을 가를 수
 * 없었다 — 임계치 초과와 한도 초과는 다음 행동이 다른데(후자는 실행이 멈출 수 있다)
 * 응답에서는 detail 문구로만 갈렸고, 화면이 문구를 파싱해 색을 정하는 것은 문구를 고치면
 * 색이 조용히 바뀐다는 뜻이다.
 *
 * - `critical` — 지금 막혀 있거나 이미 실패한 것. Policy 차단 · 배포 실패 · 예산 한도 초과.
 * - `notice` — 읽고 판단할 것. 승인 대기 · 예산 임계치 · 감사 기록.
 */
export type InboxSeverity = 'critical' | 'notice';

export interface InboxItem {
  /**
   * `<category>:<출처 행 id>`. 저장된 알림 행이 아니라 현재 상태에서 유도한 항목이라
   * 자체 PK가 없다. 조건이 그대로면 같은 id가 다시 나오므로 프론트의 리스트 key로 쓸 수 있다.
   */
  id: string;
  category: InboxCategory;
  project_id: string;
  project_name: string;
  title: string;
  /** 원인. 어느 규칙·어느 커밋·얼마나 썼는지가 여기 들어간다 (UI 설계서 08). */
  detail: string;
  occurred_at: string;
  /** 프론트가 경로를 지어내지 않도록 서버가 확정해 준다. */
  href: string;
  /** href와 같은 대상을 식별자로 한 번 더 싣는다 — 경로 규칙이 바뀌어도 대상은 남는다. */
  target: { kind: 'env_config' | 'budget' | 'deployment_event' | 'audit_log'; id: string };
  severity: InboxSeverity;
  /**
   * 승인 버튼으로 해소되는 항목인가.
   *
   * policy_blocked는 false다 — Part 1 §3.2.1이 "차단은 승인으로 우회할 수 없다"로 못박았고,
   * 화면이 이걸 모르면 승인 버튼을 그려 놓고 눌러도 아무 일이 없는 상태가 된다.
   */
  approvable: boolean;
}

export interface EnvConfigRow {
  id: string;
  project_id: string;
  build_status: BuildStatus;
  created_at: Date;
}

export interface PolicyResultRow {
  env_config_id: string;
  tool: PolicyTool;
  verdict: 'pass' | 'fail';
  risk_notes: string | null;
}

export interface BudgetRow {
  project_id: string;
  token_limit: string | null;
  cost_limit: string | null;
  alert_threshold_pct: string;
  updated_at: Date;
}

export interface UsageRow {
  project_id: string;
  tokens: string;
  cost: string;
  /** 이 프로젝트에서 마지막으로 시작된 실행 시각. 예산 항목의 occurred_at으로 쓴다. */
  last_run_at: Date | null;
}

export interface DeploymentRow {
  id: string;
  project_id: string;
  kind: string;
  commit_sha: string;
  occurred_at: Date;
}

export interface AuditRow {
  id: string;
  project_id: string;
  action: AuditAction;
  actor: string;
  created_at: Date;
}

/** 프로젝트 id → 이름. 범위 질의가 만들어 준다. */
export type ProjectNames = ReadonlyMap<string, string>;

/**
 * 사용률(%).
 *
 * 여기서만 Number로 바꾼다. 합산은 전부 SQL의 SUM()이 끝낸 뒤이고, 이 값은 비교(임계치를
 * 넘었는가)와 표시에만 쓴다 — 저장하거나 다시 더하지 않는다. agent-registry의 BudgetService가
 * 쓰는 계산과 같은 식이다(모듈을 가로질러 호출할 수 없으므로 식만 같게 유지한다).
 */
export function usagePct(used: string, limit: string | null): number | null {
  if (!limit) return null;
  const l = Number(limit);
  if (!Number.isFinite(l) || l <= 0) return null;
  return Math.round((Number(used) / l) * 10000) / 100;
}

/** 소수점 둘째 자리까지의 표시용 금액. numeric(12,4) 원문은 계산에만 쓴다. */
function money(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : `$${value}`;
}

function names(map: ProjectNames, projectId: string): string {
  return map.get(projectId) ?? '알 수 없는 프로젝트';
}

/**
 * Policy 항목 — 차단(policy_blocked)과 승인 대기(policy_passed).
 *
 * 둘을 한 카테고리로 묶는 이유: 목업의 필터 탭이 "Policy" 하나다. 둘 다 Policy Gate가
 * 만들어 낸, 환경 구성 화면에서 처리해야 할 일이라는 점도 같다.
 */
export function buildPolicyItems(
  configs: readonly EnvConfigRow[],
  results: readonly PolicyResultRow[],
  projects: ProjectNames,
): InboxItem[] {
  const byConfig = new Map<string, PolicyResultRow[]>();
  for (const r of results) {
    const list = byConfig.get(r.env_config_id);
    if (list) list.push(r);
    else byConfig.set(r.env_config_id, [r]);
  }

  return configs.map((c) => {
    const rows = byConfig.get(c.id) ?? [];
    const blocked = c.build_status === 'policy_blocked';
    const name = names(projects, c.project_id);

    return {
      id: `policy:${c.id}`,
      category: 'policy' as const,
      project_id: c.project_id,
      project_name: name,
      title: blocked ? `${name} 환경 구성이 차단되었습니다` : `${name} 구성이 승인 대기 중입니다`,
      detail: blocked ? blockedDetail(rows) : passedDetail(rows),
      occurred_at: c.created_at.toISOString(),
      severity: blocked ? ('critical' as const) : ('notice' as const),
      href: `/projects/${c.project_id}?tab=env`,
      target: { kind: 'env_config' as const, id: c.id },
      approvable: !blocked,
    };
  });
}

/** "conftest — 호스트 루트 마운트 규칙 위반. 승인 절차로 우회할 수 없습니다." */
function blockedDetail(rows: readonly PolicyResultRow[]): string {
  const fails = rows.filter((r) => r.verdict === 'fail');
  const reasons = fails
    .map((r) => (r.risk_notes ? `${r.tool} — ${r.risk_notes}` : `${r.tool} 검사 실패`))
    .join(' · ');
  // 검사 행이 아직 안 들어온 구성도 있다(차단 상태만 먼저 기록된 경우). 사유가 비어도
  // "승인으로 못 푼다"는 사실은 항상 말해야 한다 — 그게 이 항목의 존재 이유다.
  const head = reasons.length > 0 ? reasons : '정책 검사 실패';
  return `${head}. 승인 절차로 우회할 수 없습니다.`;
}

/** "trivy pass · conftest pass — 승인하면 docker build/run이 실행됩니다" */
function passedDetail(rows: readonly PolicyResultRow[]): string {
  const verdicts = rows.map((r) => `${r.tool} ${r.verdict}`).join(' · ');
  const head = verdicts.length > 0 ? `${verdicts} — ` : '';
  return `${head}승인하면 docker build/run이 실행됩니다`;
}

/**
 * 예산 항목 — **임계치에 도달했거나 넘은 것만**.
 *
 * 전부 넣으면 큐가 아니라 목록이 된다. 판정 기준은 PROJECT_BUDGETS.alert_threshold_pct다
 * (기본 80%). 토큰·비용 두 한도 중 하나라도 걸리면 항목 하나를 만들고, 둘 다 걸리면
 * 사용률이 높은 쪽을 제목에 세운다 — 같은 프로젝트로 두 줄이 서면 큐가 시끄러워진다.
 */
export function buildBudgetItems(
  budgets: readonly BudgetRow[],
  usages: readonly UsageRow[],
  projects: ProjectNames,
): InboxItem[] {
  const byProject = new Map(usages.map((u) => [u.project_id, u]));
  const items: InboxItem[] = [];

  for (const b of budgets) {
    const used = byProject.get(b.project_id) ?? {
      project_id: b.project_id,
      tokens: '0',
      cost: '0.0000',
      last_run_at: null,
    };
    const threshold = Number(b.alert_threshold_pct);
    if (!Number.isFinite(threshold)) continue;

    const cost = usagePct(used.cost, b.cost_limit);
    const tokens = usagePct(used.tokens, b.token_limit);
    const worst =
      cost !== null && (tokens === null || cost >= tokens)
        ? { metric: 'cost' as const, pct: cost }
        : tokens !== null
          ? { metric: 'tokens' as const, pct: tokens }
          : null;

    if (worst === null || worst.pct < threshold) continue;

    const name = names(projects, b.project_id);
    const amount =
      worst.metric === 'cost'
        ? `${money(used.cost)} / ${money(b.cost_limit as string)}`
        : `${used.tokens} / ${b.token_limit as string} 토큰`;
    // 목업 문구는 "임계치 80% 근접"이지만, 한도 자체를 넘은 것과 임계치만 넘은 것은
    // 다음 행동이 다르다(전자는 실행이 멈출 수 있다). 문구에서 구분한다.
    const state = worst.pct >= 100 ? '한도 초과' : `알림 임계치 ${threshold}% 초과`;

    items.push({
      id: `budget:${b.project_id}`,
      category: 'budget',
      project_id: b.project_id,
      project_name: name,
      title: `${name} 예산 사용률 ${worst.pct}%`,
      detail: `${amount} · ${state}`,
      // 이 항목을 만든 사건은 "예산을 고친 것"이 아니라 "사용량이 임계치를 넘은 것"이다.
      // 그 시각에 가장 가까운 관측값이 마지막 실행 시각이다. 실행이 없는데 임계치를
      // 넘을 수는 없지만, 방어적으로 예산 수정 시각으로 떨어진다.
      occurred_at: (used.last_run_at ?? b.updated_at).toISOString(),
      // 한도를 넘긴 것만 신호다. 임계치는 "곧 넘는다"는 예고라 아직 막힌 것이 없다.
      severity: worst.pct >= 100 ? 'critical' : 'notice',
      href: `/settings/budget?project=${b.project_id}`,
      target: { kind: 'budget', id: b.project_id },
      approvable: false,
    });
  }

  return items;
}

/** 배포 실패 항목. 커밋 sha가 원인 식별자다. */
export function buildDeploymentItems(
  rows: readonly DeploymentRow[],
  projects: ProjectNames,
): InboxItem[] {
  return rows.map((e) => {
    const name = names(projects, e.project_id);
    return {
      id: `deployment:${e.id}`,
      category: 'deployment' as const,
      project_id: e.project_id,
      project_name: name,
      title: `${name} 배포 실패`,
      detail: `${e.kind} failure · 커밋 ${e.commit_sha.slice(0, 7)} — MTTR 지표에 반영됩니다`,
      occurred_at: e.occurred_at.toISOString(),
      severity: 'critical' as const,
      href: `/projects/${e.project_id}`,
      target: { kind: 'deployment_event' as const, id: e.id },
      approvable: false,
    };
  });
}

/**
 * 큐에 올릴 만한 감사 액션과 그 제목.
 *
 * 22개 액션 전부를 넣으면 인박스가 감사 로그 화면의 복사본이 된다 — 그 화면은 이미 있다
 * (`/projects/:id/audit-logs`). 여기 남기는 기준은 두 가지를 동시에 만족하는 것이다:
 * (1) **보안·과금 표면을 바꾼다** — 키 발급/폐기, 레포 연동 생성/해제, 예산 변경
 * (2) **되돌리기 어렵다** — 프로젝트 삭제
 *
 * 빠진 것들의 이유: document·agent·env_config 계열은 건수가 많고 각자의 화면에서 바로
 * 보인다(환경 구성은 policy 카테고리가 이미 다룬다). login/logout과 template 계열은 남이
 * 처리할 일이 아니다. 목업의 "문서 업로드 완료"도 이 기준에서 빠졌다 — 알림이 아니라
 * 이력이고, 처리할 일이 없다.
 */
const NOTABLE_AUDIT: Partial<Record<AuditAction, string>> = {
  'api_key.create': 'API 키가 발급되었습니다',
  'api_key.revoke': 'API 키가 폐기되었습니다',
  'git_integration.create': 'Git 레포가 연동되었습니다',
  'git_integration.delete': 'Git 연동이 해제되었습니다',
  'budget.update': '예산 설정이 변경되었습니다',
  'project.delete': '프로젝트가 삭제되었습니다',
};

export const NOTABLE_AUDIT_ACTIONS = Object.keys(NOTABLE_AUDIT) as AuditAction[];

export function buildAuditItems(rows: readonly AuditRow[], projects: ProjectNames): InboxItem[] {
  const items: InboxItem[] = [];

  for (const a of rows) {
    const title = NOTABLE_AUDIT[a.action];
    // SQL이 이미 같은 목록으로 걸렀지만, 목록이 갈라지면 조용히 undefined 제목이 나간다.
    if (!title) continue;

    const name = names(projects, a.project_id);
    items.push({
      id: `audit:${a.id}`,
      category: 'audit',
      project_id: a.project_id,
      project_name: name,
      title: `${title} — ${name}`,
      // 원인 = 누가 했는가. 감사 항목에서 다음 행동을 정하는 정보는 그것뿐이다.
      detail: `${a.actor} · ${a.action}`,
      occurred_at: a.created_at.toISOString(),
      // 감사는 이력이다. 이미 일어난 일에 사용자가 할 수 있는 처리가 없다.
      severity: 'notice',
      href: `/projects/${a.project_id}?tab=audit`,
      target: { kind: 'audit_log', id: a.id },
      approvable: false,
    });
  }

  return items;
}

/**
 * 여러 출처를 합쳐 occurred_at 내림차순으로 세운다.
 *
 * 동시각 타이브레이커로 id를 쓴다 — 정렬이 흔들리면 같은 목록을 두 번 열었을 때 순서가
 * 바뀌어 "새 항목이 생겼다"로 오인된다.
 */
export function mergeItems(groups: readonly InboxItem[][]): InboxItem[] {
  return groups.flat().sort((a, b) => {
    if (a.occurred_at !== b.occurred_at) return a.occurred_at < b.occurred_at ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function countByCategory(items: readonly InboxItem[]): Record<InboxCategory, number> {
  const counts = { policy: 0, budget: 0, deployment: 0, audit: 0 };
  for (const item of items) counts[item.category] += 1;
  return counts;
}
