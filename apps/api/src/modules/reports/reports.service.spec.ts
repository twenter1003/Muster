import type { Repository } from 'typeorm';
import type {
  AgentRun,
  DeploymentEvent,
  PolicyCheckResult,
  ProjectMember,
} from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import { DEFAULT_WINDOW_DAYS, ReportsService } from './reports.service';
import { WINDOW_DAYS } from '../ingest/dora';

/**
 * 질의 빌더 대역.
 *
 * 여기서 검증하는 것은 SQL 자체가 아니라 **서비스가 무엇을 어디에 넘기는지**다 —
 * 특히 집계 범위로 넘긴 project_id 목록. 범위가 새면 남의 프로젝트 비용이 화면에 뜨는데,
 * 그건 DB 없이도 확인할 수 있고 반드시 확인해야 하는 부분이다.
 * 집계 산식의 정확성은 aggregate.spec.ts가 고정 데이터로 따로 본다.
 */
function fakeQb(results: { raw?: unknown[]; many?: unknown[] }, capture: Capture) {
  const qb: Record<string, unknown> = {};
  const chain = () => qb;
  for (const method of [
    'innerJoin',
    'select',
    'addSelect',
    'groupBy',
    'addGroupBy',
    'orderBy',
    'limit',
  ]) {
    qb[method] = chain;
  }
  const remember = (_sql: string, params?: Record<string, unknown>) => {
    if (params && Array.isArray(params.ids)) capture.ids.push(params.ids as string[]);
    if (params?.since instanceof Date) capture.since = params.since;
    if (params?.from instanceof Date) capture.from = params.from;
    if (params?.to instanceof Date) capture.to = params.to;
    return qb;
  };
  qb.where = remember;
  qb.andWhere = remember;
  qb.getRawMany = async () => results.raw ?? [];
  qb.getMany = async () => results.many ?? [];
  return qb;
}

interface Capture {
  ids: string[][];
  since?: Date;
  from?: Date;
  to?: Date;
}

function makeService(opts: {
  members?: unknown[];
  costRows?: unknown[];
  statusRows?: unknown[];
  policyRows?: unknown[];
  events?: unknown[];
}) {
  const capture: Capture = { ids: [] };
  const repo = (results: { raw?: unknown[]; many?: unknown[] }) =>
    ({ createQueryBuilder: () => fakeQb(results, capture) }) as unknown as Repository<never>;

  const service = new ReportsService(
    repo({ raw: opts.members ?? [] }) as Repository<ProjectMember>,
    repo({ raw: opts.costRows ?? opts.statusRows ?? [] }) as Repository<AgentRun>,
    repo({ raw: opts.policyRows ?? [] }) as Repository<PolicyCheckResult>,
    repo({ many: opts.events ?? [] }) as Repository<DeploymentEvent>,
  );

  return { service, capture };
}

const MEMBER_ROWS = [
  { project_id: 'p1', name: '내 프로젝트 1' },
  { project_id: 'p2', name: '내 프로젝트 2' },
];

describe('ReportsService.summary — 범위 제한', () => {
  it('멤버인 프로젝트 id만 집계 질의로 넘긴다', async () => {
    const { service, capture } = makeService({ members: MEMBER_ROWS });

    await service.summary('u1', {});

    // 비용·실행·정책 3종 + DORA까지 모든 질의가 같은 범위를 받아야 한다.
    expect(capture.ids.length).toBeGreaterThan(0);
    for (const ids of capture.ids) {
      expect(ids).toEqual(['p1', 'p2']);
    }
  });

  it('멤버인 프로젝트가 없으면 질의하지 않고 빈 집계를 돌려준다', async () => {
    const { service, capture } = makeService({ members: [] });

    const result = await service.summary('u1', {});

    // IN ()으로 터지는 대신 아예 질의를 만들지 않는다.
    expect(capture.ids).toEqual([]);
    expect(result.cost_by_project).toEqual({ items: [], others: null, total: '0.0000' });
    expect(result.run_outcomes.success_rate).toBeNull();
    expect(result.policy_gate.total_checks).toBe(0);
    expect(result.dora.composite_score).toBeNull();
  });
});

describe('ReportsService.summary — 구간', () => {
  it('from/to가 없으면 최근 30일을 본다', async () => {
    const { service, capture } = makeService({ members: MEMBER_ROWS });

    const result = await service.summary('u1', {});

    const from = new Date(result.window.from).getTime();
    const to = new Date(result.window.to).getTime();
    expect(Math.round((to - from) / (24 * 60 * 60 * 1000))).toBe(DEFAULT_WINDOW_DAYS);
    expect(capture.from?.toISOString()).toBe(result.window.from);
  });

  it('명시한 구간을 그대로 쓴다', async () => {
    const { service } = makeService({ members: MEMBER_ROWS });

    const result = await service.summary('u1', {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    });

    expect(result.window).toEqual({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    });
  });

  it('from이 to보다 뒤면 400', async () => {
    const { service } = makeService({ members: MEMBER_ROWS });

    await expect(
      service.summary('u1', { from: '2026-02-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }),
    ).rejects.toThrow(ApiException);
  });

  it('DORA는 요청 구간이 아니라 to 기준 고정 관측 창(90일)을 본다', async () => {
    const { service, capture } = makeService({ members: MEMBER_ROWS });

    const result = await service.summary('u1', {
      from: '2026-01-25T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    });

    expect(result.dora.window_days).toBe(WINDOW_DAYS);
    // 7일을 요청했어도 배포 이벤트는 90일치를 긁는다 — 등급 구간이 90일을 전제하기 때문.
    const days = (capture.to!.getTime() - capture.since!.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(WINDOW_DAYS);
  });
});

describe('ReportsService.summary — 집계 조립', () => {
  it('DORA 등급을 배포 이벤트에서 산출한다', async () => {
    const to = new Date('2026-02-01T00:00:00.000Z');
    // 90일 창 안에 성공 배포 20건 → 평균 간격이 1주 미만이라 배포 빈도 Elite(4).
    const events = Array.from({ length: 20 }, (_, i) => ({
      status: 'success' as const,
      committed_at: new Date(to.getTime() - (i + 1) * 3 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000),
      occurred_at: new Date(to.getTime() - (i + 1) * 3 * 24 * 60 * 60 * 1000),
    }));
    const { service } = makeService({ members: MEMBER_ROWS, events });

    const result = await service.summary('u1', { to: to.toISOString() });

    expect(result.dora.deploy_freq_score).toBe(4);
    expect(result.dora.change_fail_score).toBe(4);
    expect(result.dora.projects_counted).toBe(2);
  });

  it('비용 합계는 SQL이 준 문자열을 그대로 다룬다 (부동소수점 경유 없음)', async () => {
    const { service } = makeService({
      members: MEMBER_ROWS,
      costRows: [
        { project_id: 'p1', cost: '0.1000' },
        { project_id: 'p2', cost: '0.2000' },
      ],
    });

    const result = await service.summary('u1', {});

    expect(result.cost_by_project.total).toBe('0.3000');
    expect(result.cost_by_project.items[0]).toEqual({
      project_id: 'p2',
      name: '내 프로젝트 2',
      cost: '0.2000',
    });
  });
});
