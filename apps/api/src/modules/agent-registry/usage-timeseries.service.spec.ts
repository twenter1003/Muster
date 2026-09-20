import { Repository } from 'typeorm';
import { UsageTimeseriesService } from './usage-timeseries.service';
import type { AgentRun } from '../../database/entities';

const PROJECT = '11111111-1111-4111-8111-111111111111';

describe('UsageTimeseriesService', () => {
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

      const service = new UsageTimeseriesService(runsRepo);

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

      const service = new UsageTimeseriesService(runsRepo);

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

      const service = new UsageTimeseriesService(runsRepo);

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

      const service = new UsageTimeseriesService(runsRepo);

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

      const service = new UsageTimeseriesService(runsRepo);

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

      const service = new UsageTimeseriesService(runsRepo);

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

      const service = new UsageTimeseriesService(runsRepo);

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
            {
              agent_name: 'claude-code',
              model_code: 'claude-sonnet-5',
              tokens: '70000',
              cost: '0.2520',
              run_count: 5,
            },
            {
              agent_name: 'antigravity',
              model_code: 'gemini-3.6-flash',
              tokens: '30000',
              cost: '0.0270',
              run_count: 3,
            },
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

      const service = new UsageTimeseriesService(runsRepo);

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

    it('model_code가 없는(예전 실행이거나 훅이 못 보낸) 실행은 "모름"으로 표시하고 특정 모델을 지어내지 않는다', async () => {
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
            // model_code가 없다 — 예전엔 agent_name만 보고 'gemini-3.6-flash'를 지어냈다
            // (DESIGN_DRIFT 19번). antigravity가 그 모델을 쓴 적이 없어도 찍혀 나왔다.
            { agent_name: 'antigravity', tokens: '30000', cost: '0.0270', run_count: 3 },
          ]),
        getRawOne: jest
          .fn()
          .mockResolvedValueOnce({ tokens: '30000', cost: '0.0270' })
          .mockResolvedValueOnce({ tokens: '30000', cost: '0.0270' }),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const runsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      } as unknown as Repository<AgentRun>;

      const service = new UsageTimeseriesService(runsRepo);
      const result = await service.dailyUsage(PROJECT);

      const row = result.model_breakdown![0];
      expect(row.model_name).toBe('unknown');
      expect(row.display_name).toBe('모름');
      // provider는 agent_name(실제 사실)만으로 추론하는 것까지는 허용한다 — 특정 모델을 짓는 게 아니다.
      expect(row.provider).toBe('google');
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

      const service = new UsageTimeseriesService(runsRepo);

      const burnRate = await service.calculateBurnRate(PROJECT, 15);

      expect(burnRate).toBeDefined();
      expect(burnRate.current_tokens_per_min).toBeGreaterThanOrEqual(100_000);
      expect(burnRate.spike_level).toBe('critical');
      expect(burnRate.is_spike).toBe(true);
      expect(burnRate.dominant_agent).toBe('claude-code');
      expect(burnRate.recommendation).toContain('무한 루프 또는 컨텍스트 폭주');
    });
  });
});
