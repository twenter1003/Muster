import {
  buildAuditItems,
  buildBudgetItems,
  buildDeploymentItems,
  buildPolicyItems,
  countByCategory,
  mergeItems,
  usagePct,
  type BudgetRow,
  type EnvConfigRow,
  type UsageRow,
} from './items';

const projects = new Map([
  ['p1', 'crawler-farm'],
  ['p2', 'nol-clone-dashboard'],
]);

const at = (iso: string) => new Date(iso);

const config = (over: Partial<EnvConfigRow> = {}): EnvConfigRow => ({
  id: 'c1',
  project_id: 'p1',
  build_status: 'policy_blocked',
  created_at: at('2026-09-12T10:00:00.000Z'),
  ...over,
});

const budget = (over: Partial<BudgetRow> = {}): BudgetRow => ({
  project_id: 'p2',
  token_limit: null,
  cost_limit: '45.0000',
  alert_threshold_pct: '80',
  updated_at: at('2026-09-01T00:00:00.000Z'),
  ...over,
});

const usage = (over: Partial<UsageRow> = {}): UsageRow => ({
  project_id: 'p2',
  tokens: '0',
  cost: '0.0000',
  last_run_at: at('2026-09-12T09:00:00.000Z'),
  ...over,
});

describe('policy 항목', () => {
  it('차단 항목은 사유(도구·규칙)를 담고 승인으로 해소되지 않는다고 말한다', () => {
    const [item] = buildPolicyItems(
      [config()],
      [
        { env_config_id: 'c1', tool: 'trivy', verdict: 'pass', risk_notes: null },
        {
          env_config_id: 'c1',
          tool: 'conftest',
          verdict: 'fail',
          risk_notes: '호스트 루트 마운트 규칙 위반',
        },
      ],
      projects,
    );

    expect(item.category).toBe('policy');
    expect(item.title).toContain('crawler-farm');
    expect(item.detail).toContain('conftest');
    expect(item.detail).toContain('호스트 루트 마운트 규칙 위반');
    // Part 1 §3.2.1 — 차단은 승인으로 우회할 수 없다.
    expect(item.approvable).toBe(false);
    expect(item.detail).toContain('우회할 수 없습니다');
    // pass 행은 차단 사유가 아니다.
    expect(item.detail).not.toContain('trivy');
    // 이동 대상이 있어야 한다.
    expect(item.target).toEqual({ kind: 'env_config', id: 'c1' });
    expect(item.href).toContain('p1');
  });

  it('검사 결과 행이 없어도 차단 사실과 승인 불가는 남는다', () => {
    const [item] = buildPolicyItems([config()], [], projects);
    expect(item.detail).toBe('정책 검사 실패. 승인 절차로 우회할 수 없습니다.');
  });

  it('승인 대기는 approvable이고 통과한 검사들을 보여준다', () => {
    const [item] = buildPolicyItems(
      [config({ build_status: 'policy_passed' })],
      [
        { env_config_id: 'c1', tool: 'trivy', verdict: 'pass', risk_notes: null },
        { env_config_id: 'c1', tool: 'conftest', verdict: 'pass', risk_notes: null },
      ],
      projects,
    );

    expect(item.approvable).toBe(true);
    expect(item.title).toContain('승인 대기');
    expect(item.detail).toContain('trivy pass · conftest pass');
  });
});

describe('budget 항목 — 임계치 경계', () => {
  it('임계치 미만은 큐에 들어가지 않는다', () => {
    // 79.98% < 80%
    const items = buildBudgetItems([budget()], [usage({ cost: '35.9900' })], projects);
    expect(items).toEqual([]);
  });

  it('임계치와 같으면 들어간다 (경계 포함)', () => {
    const items = buildBudgetItems([budget()], [usage({ cost: '36.0000' })], projects);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('80%');
    expect(items[0].detail).toBe('$36.00 / $45.00 · 알림 임계치 80% 초과');
  });

  it('한도를 넘으면 임계치 초과가 아니라 한도 초과라고 말한다', () => {
    const items = buildBudgetItems([budget()], [usage({ cost: '50.0000' })], projects);
    expect(items[0].detail).toContain('한도 초과');
  });

  it('한도가 없으면 사용량이 얼마든 들어가지 않는다', () => {
    const items = buildBudgetItems(
      [budget({ cost_limit: null })],
      [usage({ cost: '9999.0000' })],
      projects,
    );
    expect(items).toEqual([]);
  });

  it('토큰·비용이 둘 다 걸려도 한 프로젝트에 한 줄이고, 높은 쪽이 제목이 된다', () => {
    const items = buildBudgetItems(
      [budget({ token_limit: '1000', cost_limit: '45.0000' })],
      [usage({ tokens: '990', cost: '36.0000' })],
      projects,
    );

    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('99%');
    expect(items[0].detail).toContain('토큰');
  });

  it('실행 기록이 있으면 그 시각이 occurred_at이다 (예산 수정 시각이 아니라)', () => {
    const items = buildBudgetItems([budget()], [usage({ cost: '40.0000' })], projects);
    expect(items[0].occurred_at).toBe('2026-09-12T09:00:00.000Z');
  });

  it('임계치가 숫자가 아니면 건너뛴다 (터지지 않는다)', () => {
    const items = buildBudgetItems(
      [budget({ alert_threshold_pct: 'nan' })],
      [usage({ cost: '44.0000' })],
      projects,
    );
    expect(items).toEqual([]);
  });
});

describe('usagePct', () => {
  it('한도가 없거나 0이면 null이다 — 0%가 아니다', () => {
    expect(usagePct('10', null)).toBeNull();
    expect(usagePct('10', '0')).toBeNull();
  });
});

describe('deployment 항목', () => {
  it('커밋 sha를 원인으로 담는다', () => {
    const [item] = buildDeploymentItems(
      [
        {
          id: 'd1',
          project_id: 'p1',
          kind: 'workflow_run',
          commit_sha: '7be0d14abcdef0123456789abcdef0123456789a',
          occurred_at: at('2026-09-12T08:00:00.000Z'),
        },
      ],
      projects,
    );

    expect(item.category).toBe('deployment');
    expect(item.detail).toContain('7be0d14');
    expect(item.detail).toContain('workflow_run failure');
    expect(item.target).toEqual({ kind: 'deployment_event', id: 'd1' });
  });
});

describe('audit 항목', () => {
  it('알릴 가치가 있는 액션만 통과하고, 행위자가 원인으로 실린다', () => {
    const items = buildAuditItems(
      [
        {
          id: 'a1',
          project_id: 'p1',
          action: 'api_key.create',
          actor: 'alice',
          created_at: at('2026-09-11T00:00:00.000Z'),
        },
        {
          // 목록 밖 액션이 흘러들어와도 조용히 undefined 제목이 나가지 않는다.
          id: 'a2',
          project_id: 'p1',
          action: 'login',
          actor: 'alice',
          created_at: at('2026-09-11T00:00:00.000Z'),
        },
      ],
      projects,
    );

    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('API 키');
    expect(items[0].detail).toBe('alice · api_key.create');
  });
});

describe('병합·집계', () => {
  it('occurred_at 내림차순이고, 동시각은 id로 안정 정렬된다', () => {
    const same = at('2026-09-12T10:00:00.000Z');
    const merged = mergeItems([
      buildDeploymentItems(
        [{ id: 'd2', project_id: 'p1', kind: 'deployment', commit_sha: 'bbb', occurred_at: same }],
        projects,
      ),
      buildDeploymentItems(
        [{ id: 'd1', project_id: 'p1', kind: 'deployment', commit_sha: 'aaa', occurred_at: same }],
        projects,
      ),
      buildPolicyItems([config({ created_at: at('2026-09-12T11:00:00.000Z') })], [], projects),
    ]);

    expect(merged.map((i) => i.id)).toEqual(['policy:c1', 'deployment:d1', 'deployment:d2']);
  });

  it('빈 입력에서 터지지 않는다', () => {
    expect(mergeItems([])).toEqual([]);
    expect(countByCategory([])).toEqual({ policy: 0, budget: 0, deployment: 0, audit: 0 });
  });
});
