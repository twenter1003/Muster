import { buildCostByProject, buildPolicyGate, buildRunOutcomes } from './aggregate';

describe('buildCostByProject', () => {
  const names = new Map([
    ['p1', '프로젝트 1'],
    ['p2', '프로젝트 2'],
  ]);

  it('비용 내림차순으로 정렬한다 (문자열 비교가 아니라 수치 비교)', () => {
    const result = buildCostByProject(
      [
        { project_id: 'p1', cost: '9.0000' },
        { project_id: 'p2', cost: '10.0000' },
      ],
      names,
    );
    expect(result.items.map((i) => i.project_id)).toEqual(['p2', 'p1']);
  });

  it('상위 5개를 넘는 프로젝트는 나머지로 묶고, 합계가 정확하다', () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      project_id: `p${i}`,
      cost: `${10 - i}.0000`,
    }));

    const result = buildCostByProject(rows, new Map());

    expect(result.items).toHaveLength(5);
    // 남은 둘은 4.0000과 5.0000 → 9.0000.
    expect(result.others).toEqual({ project_count: 2, cost: '9.0000' });
    // 10+9+8+7+6+5+4 = 49.
    expect(result.total).toBe('49.0000');
  });

  it('항목 합 + 나머지 = total (화면에서 어긋나면 즉시 보인다)', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      project_id: `p${i}`,
      cost: '0.1000',
    }));
    const result = buildCostByProject(rows, new Map());

    expect(result.items).toHaveLength(5);
    expect(result.others?.cost).toBe('0.3000');
    expect(result.total).toBe('0.8000');
  });

  it('프로젝트가 5개 이하면 나머지 묶음이 없다', () => {
    const result = buildCostByProject([{ project_id: 'p1', cost: '1.0000' }], names);
    expect(result.others).toBeNull();
  });

  it('0건이면 빈 목록과 0', () => {
    expect(buildCostByProject([], names)).toEqual({ items: [], others: null, total: '0.0000' });
  });

  it('이름을 붙인다', () => {
    const result = buildCostByProject([{ project_id: 'p1', cost: '1.0000' }], names);
    expect(result.items[0].name).toBe('프로젝트 1');
  });
});

describe('buildRunOutcomes', () => {
  it('상태별 건수를 세고 성공률을 낸다', () => {
    const result = buildRunOutcomes([
      { status: 'succeeded', count: 8 },
      { status: 'failed', count: 1 },
      { status: 'cancelled', count: 1 },
    ]);

    expect(result).toMatchObject({ succeeded: 8, failed: 1, cancelled: 1, success_rate: 0.8 });
  });

  it('running은 성공률 분모에서 빠진다 — 아직 결과가 없다', () => {
    const result = buildRunOutcomes([
      { status: 'succeeded', count: 1 },
      { status: 'failed', count: 1 },
      { status: 'running', count: 98 },
    ]);

    expect(result.running).toBe(98);
    expect(result.success_rate).toBe(0.5);
  });

  it('종료된 실행이 0건이면 성공률은 0이 아니라 null', () => {
    expect(buildRunOutcomes([{ status: 'running', count: 3 }]).success_rate).toBeNull();
  });

  it('행이 하나도 없어도 터지지 않는다', () => {
    expect(buildRunOutcomes([])).toEqual({
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      running: 0,
      success_rate: null,
    });
  });
});

describe('buildPolicyGate', () => {
  it('검사 건수·1차 통과·도구별 차단을 각각 센다', () => {
    const result = buildPolicyGate({
      verdicts: [
        { tool: 'trivy', verdict: 'pass', count: 7 },
        { tool: 'trivy', verdict: 'fail', count: 3 },
        { tool: 'conftest', verdict: 'pass', count: 9 },
        { tool: 'conftest', verdict: 'fail', count: 1 },
      ],
      // 환경 구성 10개 중 4개에 fail이 하나 이상 있었다.
      configFailCounts: [
        ...Array(6).fill({ fails: 0 }),
        { fails: 1 },
        { fails: 1 },
        { fails: 1 },
        { fails: 2 },
      ],
      reasons: [
        { reason: 'CRITICAL 취약점 포함 베이스 이미지', count: 3 },
        { reason: 'root 사용자로 실행', count: 1 },
      ],
    });

    expect(result.total_checks).toBe(20);
    expect(result.configs_checked).toBe(10);
    expect(result.first_pass_configs).toBe(6);
    expect(result.first_pass_rate).toBe(0.6);
    expect(result.trivy_blocked).toBe(3);
    expect(result.conftest_blocked).toBe(1);
    expect(result.top_block_reasons[0].reason).toBe('CRITICAL 취약점 포함 베이스 이미지');
  });

  it('차단이 하나도 없으면 도구별 차단은 0이고 1차 통과는 100%다', () => {
    const result = buildPolicyGate({
      verdicts: [{ tool: 'trivy', verdict: 'pass', count: 2 }],
      configFailCounts: [{ fails: 0 }, { fails: 0 }],
      reasons: [],
    });

    expect(result.trivy_blocked).toBe(0);
    expect(result.conftest_blocked).toBe(0);
    expect(result.first_pass_rate).toBe(1);
  });

  it('0건이면 비율은 null이고 터지지 않는다', () => {
    const result = buildPolicyGate({ verdicts: [], configFailCounts: [], reasons: [] });

    expect(result.total_checks).toBe(0);
    expect(result.first_pass_rate).toBeNull();
    expect(result.top_block_reasons).toEqual([]);
  });
});
