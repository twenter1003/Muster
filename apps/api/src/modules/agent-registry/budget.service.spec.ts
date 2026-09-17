import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { BudgetService } from './budget.service';
import { DomainEvent } from '../../common/events/domain-events';
import type { ProjectBudget, AgentRun } from '../../database/entities';

/** 예산 판정의 결정들을 고정한다. */

const PROJECT = '11111111-1111-4111-8111-111111111111';

const budgetRow = (over: Partial<ProjectBudget> = {}): ProjectBudget =>
  ({
    id: 'b1',
    project_id: PROJECT,
    token_limit: null,
    cost_limit: null,
    alert_threshold_pct: '80',
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }) as ProjectBudget;

const make = (budget: ProjectBudget | null, usage: { tokens: string; cost: string }) => {
  const events = new EventEmitter2();
  const budgets = {
    findOneBy: async () => budget,
    create: (v: Partial<ProjectBudget>) => budgetRow(v),
    save: async (v: ProjectBudget) => v,
  } as unknown as Repository<ProjectBudget>;

  const service = new BudgetService(budgets, {} as never, events);
  // sumUsage는 SQL 집계라 여기서는 대역으로 바꾼다.
  jest.spyOn(service, 'sumUsage').mockResolvedValue(usage);
  return { service, events };
};

describe('BudgetService', () => {
  describe('사용률 계산', () => {
    it('한도가 없으면 사용률은 null이다 — 0%가 아니다', async () => {
      const { service } = make(budgetRow(), { tokens: '5000', cost: '1.23' });

      const usage = await service.get(PROJECT);
      expect(usage.token_usage_pct).toBeNull();
      expect(usage.cost_usage_pct).toBeNull();
      // 한도가 없어도 실제 사용량은 그대로 보인다.
      expect(usage.used_tokens).toBe('5000');
    });

    it('예산 레코드가 없어도 조회는 성공한다', async () => {
      const { service } = make(null, { tokens: '0', cost: '0' });

      const usage = await service.get(PROJECT);
      expect(usage.alert_threshold_pct).toBe('80');
      expect(usage.updated_at).toBeNull();
    });

    it('한도가 0이면 사용률은 null이다 — 0으로 나눈 값을 백분율이라 할 수 없다', async () => {
      const { service } = make(budgetRow({ token_limit: '0' }), { tokens: '10', cost: '0' });

      expect((await service.get(PROJECT)).token_usage_pct).toBeNull();
    });

    it('백분율은 소수 둘째 자리까지 낸다', async () => {
      const { service } = make(budgetRow({ token_limit: '3' }), { tokens: '1', cost: '0' });

      expect((await service.get(PROJECT)).token_usage_pct).toBe(33.33);
    });
  });

  describe('임계치 알림', () => {
    const listen = (events: EventEmitter2) => {
      const seen: unknown[] = [];
      events.on(DomainEvent.BUDGET_THRESHOLD_EXCEEDED, (p) => seen.push(p));
      return seen;
    };

    it('임계치를 넘어서는 순간에 발행한다', async () => {
      const { service, events } = make(budgetRow({ token_limit: '1000' }), {
        tokens: '850',
        cost: '0',
      });
      const seen = listen(events);

      await service.recalculateAndAlert(PROJECT, { tokens: '700', cost: '0' });

      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ metric: 'tokens', usage_pct: 85, threshold_pct: 80 });
    });

    it('이미 넘어 있었으면 다시 발행하지 않는다 — 같은 알림이 반복되면 안 된다', async () => {
      const { service, events } = make(budgetRow({ token_limit: '1000' }), {
        tokens: '950',
        cost: '0',
      });
      const seen = listen(events);

      await service.recalculateAndAlert(PROJECT, { tokens: '900', cost: '0' });

      expect(seen).toHaveLength(0);
    });

    it('임계치 미만이면 발행하지 않는다', async () => {
      const { service, events } = make(budgetRow({ token_limit: '1000' }), {
        tokens: '500',
        cost: '0',
      });
      const seen = listen(events);

      await service.recalculateAndAlert(PROJECT, { tokens: '400', cost: '0' });

      expect(seen).toHaveLength(0);
    });

    it('토큰과 비용이 동시에 넘으면 각각 발행한다', async () => {
      const { service, events } = make(budgetRow({ token_limit: '1000', cost_limit: '10' }), {
        tokens: '900',
        cost: '9',
      });
      const seen = listen(events);

      await service.recalculateAndAlert(PROJECT, { tokens: '100', cost: '1' });

      expect(seen).toHaveLength(2);
      expect(seen.map((s) => (s as { metric: string }).metric).sort()).toEqual(['cost', 'tokens']);
    });

    it('예산을 안 정했으면 알리지 않는다', async () => {
      const { service, events } = make(null, { tokens: '999999', cost: '0' });
      const seen = listen(events);

      await service.recalculateAndAlert(PROJECT, { tokens: '0', cost: '0' });

      expect(seen).toHaveLength(0);
    });

    it('한도가 없는 지표는 알림 대상이 아니다', async () => {
      // 토큰 한도만 있고 비용 한도는 없다.
      const { service, events } = make(budgetRow({ token_limit: '1000' }), {
        tokens: '100',
        cost: '99999',
      });
      const seen = listen(events);

      await service.recalculateAndAlert(PROJECT, { tokens: '0', cost: '0' });

      expect(seen).toHaveLength(0);
    });
  });

  describe('PUT — 전체 교체', () => {
    it('생략한 한도는 "한도 없음"이 된다', async () => {
      const existing = budgetRow({ token_limit: '1000', cost_limit: '50' });
      const { service } = make(existing, { tokens: '0', cost: '0' });

      await service.put(PROJECT, { token_limit: '2000' });

      expect(existing.token_limit).toBe('2000');
      expect(existing.cost_limit).toBeNull();
    });

    it('임계치를 생략하면 기본값 80으로 돌아간다', async () => {
      const existing = budgetRow({ alert_threshold_pct: '50' });
      const { service } = make(existing, { tokens: '0', cost: '0' });

      await service.put(PROJECT, {});

      expect(existing.alert_threshold_pct).toBe('80');
    });
  });

  describe('dailyUsage 에이전트 필터링', () => {
    it('agentName이 주어지면 쿼리에 a.name 조건을 바인딩한다', async () => {
      const qbMock = {
        innerJoin: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ tokens: '1500' }),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const runsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      } as unknown as Repository<AgentRun>;

      const service = new BudgetService({} as never, runsRepo, new EventEmitter2());

      const result = await service.dailyUsage(PROJECT, 'claude-code');

      expect(result.month_tokens).toBe('1500');
      // andWhere('a.name = :agentName', { agentName: 'claude-code' }) 호출 확인
      expect(qbMock.andWhere).toHaveBeenCalledWith('a.name = :agentName', {
        agentName: 'claude-code',
      });
    });

    it('agentName이 없거나 all이면 a.name 조건을 추가하지 않는다', async () => {
      const qbMock = {
        innerJoin: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ tokens: '3000' }),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const runsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      } as unknown as Repository<AgentRun>;

      const service = new BudgetService({} as never, runsRepo, new EventEmitter2());

      await service.dailyUsage(PROJECT, 'all');

      const calledWithAgentName = qbMock.andWhere.mock.calls.some(
        (args: unknown[]) => args[0] === 'a.name = :agentName',
      );
      expect(calledWithAgentName).toBe(false);
    });

    it('agentName에 쉼표로 복수 에이전트가 주어지면 a.name IN 조건을 바인딩한다', async () => {
      const qbMock = {
        innerJoin: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ tokens: '4500' }),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const runsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      } as unknown as Repository<AgentRun>;

      const service = new BudgetService({} as never, runsRepo, new EventEmitter2());

      const result = await service.dailyUsage(PROJECT, 'claude-code,cursor');

      expect(result.month_tokens).toBe('4500');
      expect(qbMock.andWhere).toHaveBeenCalledWith('a.name IN (:...agentNames)', {
        agentNames: ['claude-code', 'cursor'],
      });
    });

    it('timeSeriesRows로부터 agent_series, available_agents, agent_tokens가 올바르게 분할 집계된다', async () => {
      const qbMock = {
        innerJoin: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              bucket: '2026-09-17',
              agent_name: 'claude-code',
              tokens: '12000',
              cost: '0.0432',
            },
            {
              bucket: '2026-09-17',
              agent_name: 'antigravity',
              tokens: '8000',
              cost: '0.0072',
            },
            {
              bucket: '2026-09-17',
              agent_name: 'cursor',
              tokens: '5000',
              cost: '0.0150',
            },
          ])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { agent_name: 'claude-code', tokens: '12000', cost: '0.0432', run_count: 2 },
            { agent_name: 'antigravity', tokens: '8000', cost: '0.0072', run_count: 1 },
            { agent_name: 'cursor', tokens: '5000', cost: '0.0150', run_count: 1 },
          ]),
        getRawOne: jest.fn().mockResolvedValue({ tokens: '25000', cost: '0.0654' }),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const runsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      } as unknown as Repository<AgentRun>;

      const service = new BudgetService({} as never, runsRepo, new EventEmitter2());

      const result = await service.dailyUsage(PROJECT, 'all');

      expect(result.available_agents).toEqual(
        expect.arrayContaining(['claude-code', 'antigravity', 'cursor']),
      );
      expect(result.agent_series).toBeDefined();
      expect(result.agent_series!['claude-code']).toBeDefined();
      expect(result.agent_series!['antigravity']).toBeDefined();
      expect(result.agent_series!['cursor']).toBeDefined();

      const point0917 = result.time_series?.find((p) => p.key === '2026-09-17');
      expect(point0917).toBeDefined();
      expect(point0917?.tokens).toBe('25000'); // 12000 + 8000 + 5000 합산
      expect(point0917?.agent_tokens).toEqual({
        'claude-code': '12000',
        antigravity: '8000',
        cursor: '5000',
      });
    });

    it('dailyUsage 결과에 today_cost, month_cost, total_cost가 올바르게 매핑된다', async () => {
      const qbMock = {
        innerJoin: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ tokens: '50000', cost: '0.1800' }),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const runsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      } as unknown as Repository<AgentRun>;

      const service = new BudgetService({} as never, runsRepo, new EventEmitter2());

      const result = await service.dailyUsage(PROJECT);

      expect(result.month_cost).toBe('0.1800');
      expect(result.total_cost).toBe('0.1800');
    });

    it('granularity=hour 요청 시 24개 시간별 버킷과 HH:00 라벨을 반환한다', async () => {
      const qbMock = {
        innerJoin: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ tokens: '1000', cost: '0.0050' }),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const runsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      } as unknown as Repository<AgentRun>;

      const service = new BudgetService({} as never, runsRepo, new EventEmitter2());

      const result = await service.dailyUsage(PROJECT, undefined, 'Asia/Seoul', 'hour');

      expect(result.granularity).toBe('hour');
      expect(result.time_series).toBeDefined();
      expect(result.time_series).toHaveLength(24);
      expect(result.time_series![0].label).toMatch(/^\d{2}:00$/);
      expect(result.time_series![23].label).toMatch(/^\d{2}:00$/);
    });

    it('granularity=month 요청 시 6개 월별 버킷과 YY.MM 라벨을 반환한다', async () => {
      const qbMock = {
        innerJoin: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ tokens: '5000', cost: '0.0200' }),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const runsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      } as unknown as Repository<AgentRun>;

      const service = new BudgetService({} as never, runsRepo, new EventEmitter2());

      const result = await service.dailyUsage(PROJECT, undefined, 'Asia/Seoul', 'month');

      expect(result.granularity).toBe('month');
      expect(result.time_series).toBeDefined();
      expect(result.time_series).toHaveLength(6);
      expect(result.time_series![0].label).toMatch(/^\d{2}\.\d{2}$/);
      expect(result.time_series![5].label).toMatch(/^\d{2}\.\d{2}$/);
    });

    it('model_breakdown이 에이전트별 토큰, 비용, 점유율(%)을 올바르게 집계한다', async () => {
      const qbMock = {
        innerJoin: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { agent_name: 'claude-code', tokens: '70000', cost: '0.2520', run_count: 5 },
            { agent_name: 'antigravity', tokens: '30000', cost: '0.0270', run_count: 3 },
          ]),
        getRawOne: jest
          .fn()
          .mockResolvedValueOnce({ tokens: '100000', cost: '0.2790' })
          .mockResolvedValueOnce({ tokens: '100000', cost: '0.2790' }),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const runsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      } as unknown as Repository<AgentRun>;

      const service = new BudgetService({} as never, runsRepo, new EventEmitter2());

      const result = await service.dailyUsage(PROJECT);

      expect(result.model_breakdown).toBeDefined();
      expect(result.model_breakdown).toHaveLength(2);

      const claude = result.model_breakdown![0];
      expect(claude.model_name).toBe('claude-sonnet-5');
      expect(claude.provider).toBe('anthropic');
      expect(claude.tokens).toBe('70000');
      expect(claude.percentage).toBe(70);
      expect(claude.run_count).toBe(5);

      const antigravity = result.model_breakdown![1];
      expect(antigravity.model_name).toBe('gemini-3.6-flash');
      expect(antigravity.provider).toBe('google');
      expect(antigravity.tokens).toBe('30000');
      expect(antigravity.percentage).toBe(30);
      expect(antigravity.run_count).toBe(3);

      expect(claude.percentage + antigravity.percentage).toBe(100);
      expect(result.burn_rate).toBeDefined();
      expect(result.burn_rate?.spike_level).toBe('normal');
    });

    it('calculateBurnRate가 최근 세션 데이터를 기반으로 스파이크 상태를 정상 계산한다', async () => {
      const qbMock = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            agent: { name: 'claude-code' },
            tokens_used: 120_000,
            cost: '0.4500',
            status: 'running',
            started_at: new Date(Date.now() - 60_000), // 1분 전 시작
            ended_at: null,
          },
        ]),
      };

      const runsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      } as unknown as Repository<AgentRun>;

      const service = new BudgetService({} as never, runsRepo, new EventEmitter2());

      const burnRate = await service.calculateBurnRate(PROJECT, 15);

      expect(burnRate).toBeDefined();
      expect(burnRate.current_tokens_per_min).toBeGreaterThanOrEqual(100_000);
      expect(burnRate.spike_level).toBe('critical');
      expect(burnRate.is_spike).toBe(true);
      expect(burnRate.dominant_agent).toBe('claude-code');
      expect(burnRate.recommendation).toContain('무한 루프 또는 컨텍스트 폭주');
    });
  });

  describe('Waste Report Export (CSV & JSON)', () => {
    const mockRuns = [
      {
        id: 'run-1',
        agent: { name: 'claude-code' },
        status: 'completed',
        tokens_used: 60_000_000,
        cost: '18.0000',
        started_at: new Date('2026-09-18T00:00:00Z'),
        ended_at: new Date('2026-09-18T01:00:00Z'), // 3600초 (60분)
      },
      {
        id: 'run-2',
        agent: { name: 'gemini-3.6-flash' },
        status: 'running',
        tokens_used: 5_000,
        cost: '0.0050',
        started_at: new Date('2026-09-18T02:00:00Z'),
        ended_at: null,
      },
    ];

    it('generateWasteReportJson이 세션별 낭비 메트릭과 ROI 시뮬레이션을 구조화하여 반환한다', async () => {
      const qbMock = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockRuns),
      };

      const runsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      } as unknown as Repository<AgentRun>;

      const service = new BudgetService({} as never, runsRepo, new EventEmitter2());
      const report = await service.generateWasteReportJson(PROJECT);

      expect(report.project_id).toBe(PROJECT);
      expect(report.summary.total_sessions).toBe(2);
      expect(report.summary.total_tokens).toBe(60_005_000);
      expect(report.summary.total_wasted_tokens).toBeGreaterThan(0);
      expect(report.cache_roi_simulation).toBeDefined();
      expect(report.sessions).toHaveLength(2);

      const session1 = report.sessions.find((s) => s.session_id === 'run-1');
      expect(session1).toBeDefined();
      expect(session1?.waste_level).toBe('HIGH_WASTE');
      expect(session1?.duration_seconds).toBe(3600);
      expect(session1?.burn_rate_tokens_per_min).toBe(1_000_000); // 6천만 / 60분
    });

    it('generateWasteReportCsv가 UTF-8 BOM과 RFC 4180 호환 CSV 문자열을 반환한다', async () => {
      const qbMock = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockRuns),
      };

      const runsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      } as unknown as Repository<AgentRun>;

      const service = new BudgetService({} as never, runsRepo, new EventEmitter2());
      const csv = await service.generateWasteReportCsv(PROJECT);

      // BOM 검증
      expect(csv.startsWith('\uFEFF')).toBe(true);

      // 헤더 검증
      expect(csv).toContain('"session_id","agent_name","status","started_at"');
      expect(csv).toContain('"claude-code"');
      expect(csv).toContain('"gemini-3.6-flash"');
      expect(csv).toContain('"PROJECT_SUMMARY"');
      expect(csv).toContain('"HIGH_WASTE"');
    });
  });
});
