import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { AgentRunsService } from './agent-runs.service';
import { BudgetService } from './budget.service';
import { ModelPricingService } from './model-pricing.service';
import { DomainEvent } from '../../common/events/domain-events';
import { ApiException } from '../../common/errors/api.exception';
import type { Agent, AgentRun, GitIntegration, ProjectMember } from '../../database/entities';

describe('AgentRunsService', () => {
  let service: AgentRunsService;
  let runsRepo: Partial<Repository<AgentRun>>;
  let agentsRepo: Partial<Repository<Agent>>;
  let membersRepo: Partial<Repository<ProjectMember>>;
  let gitIntegrationsRepo: Partial<Repository<GitIntegration>>;
  let budgetService: Partial<BudgetService>;
  let modelPricingService: ModelPricingService;
  let events: EventEmitter2;

  beforeEach(() => {
    runsRepo = {
      create: jest.fn().mockImplementation((val) => val),
      save: jest.fn().mockImplementation(async (val) => ({ id: 'run-1', ...val })),
      findOneBy: jest.fn(),
    };
    agentsRepo = {
      create: jest.fn().mockImplementation((val) => val),
      save: jest.fn().mockImplementation(async (val) => ({ id: 'agent-new', ...val })),
      findOneBy: jest
        .fn()
        .mockResolvedValue({ id: 'agent-1', name: 'claude-code', project_id: 'proj-1' } as Agent),
    };
    membersRepo = {
      find: jest.fn().mockResolvedValue([{ user_id: 'user-1', role: 'owner' }] as ProjectMember[]),
      countBy: jest.fn().mockResolvedValue(1),
    };

    gitIntegrationsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          project_id: 'proj-target',
          repo_url: 'https://github.com/owner/repo',
        }),
      }),
    };
    budgetService = {
      sumUsage: jest.fn().mockResolvedValue({ tokens: '100', cost: '0' }),
      recalculateAndAlert: jest.fn().mockResolvedValue(undefined),
    };
    modelPricingService = new ModelPricingService();
    events = new EventEmitter2();
    jest.spyOn(events, 'emit');

    service = new AgentRunsService(
      runsRepo as Repository<AgentRun>,
      agentsRepo as Repository<Agent>,
      membersRepo as Repository<ProjectMember>,
      gitIntegrationsRepo as Repository<GitIntegration>,
      budgetService as BudgetService,
      modelPricingService,
      events,
    );
  });

  describe('start', () => {
    it('dto 없이 호출하면 running 상태의 기본 실행을 생성한다', async () => {
      const run = await service.start('agent-1');

      expect(runsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-1',
          status: 'running',
          tokens_used: 0,
          cost: '0',
          ended_at: null,
        }),
      );
      expect(budgetService.recalculateAndAlert).not.toHaveBeenCalled();
      expect(run.id).toBe('run-1');
    });

    it('dto에 과거 세션 데이터가 주어지면 해당 값으로 생성하고 예산 재계산을 트리거한다', async () => {
      const startedAt = '2026-09-01T10:00:00.000Z';
      const endedAt = '2026-09-01T11:00:00.000Z';

      const run = await service.start('agent-1', {
        status: 'succeeded',
        tokens_used: 50000,
        cost: '0.12',
        started_at: startedAt,
        ended_at: endedAt,
      });

      expect(runsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-1',
          status: 'succeeded',
          tokens_used: 50000,
          cost: '0.12',
          started_at: new Date(startedAt),
          ended_at: new Date(endedAt),
        }),
      );
      expect(budgetService.recalculateAndAlert).toHaveBeenCalledWith('proj-1', {
        tokens: '100',
        cost: '0',
      });
      expect(run.id).toBe('run-1');
    });

    it('tokens_used가 주어졌으나 cost가 누락된 경우 모델 단가를 적용하여 cost를 자동 계산한다', async () => {
      // agent-1은 claude-code이므로 claude-sonnet-5 (blended $3.60/1M)
      // 100,000 토큰 = $0.3600
      await service.start('agent-1', {
        status: 'succeeded',
        tokens_used: 100_000,
      });

      expect(runsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-1',
          tokens_used: 100_000,
          cost: '0.3600',
        }),
      );
    });

    it('running 상태로 실행을 시작하면 AGENT_RUN_STARTED 이벤트를 발행한다', async () => {
      await service.start('agent-1', { status: 'running' });

      expect(events.emit).toHaveBeenCalledWith(
        DomainEvent.AGENT_RUN_STARTED,
        expect.objectContaining({
          project_id: 'proj-1',
          agent_name: 'claude-code',
          status: 'running',
        }),
      );
    });

    it('model이 전달되면 model 필드를 저장하고 AGENT_RUN_STARTED에 포함한다', async () => {
      await service.start('agent-1', { status: 'running', model: 'claude-3-5-sonnet' });

      expect(runsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-1',
          model: 'claude-3-5-sonnet',
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        DomainEvent.AGENT_RUN_STARTED,
        expect.objectContaining({
          agent_name: 'claude-code',
          model: 'claude-3-5-sonnet',
        }),
      );
    });
  });

  describe('recordByRepo', () => {
    it('프로젝트 소유자가 없으면 404를 던진다', async () => {
      (membersRepo.find as jest.Mock).mockResolvedValueOnce([]);

      await expect(
        service.recordByRepo('proj-key', {
          repo_url: 'https://github.com/owner/repo',
          agent_name: 'antigravity',
          tokens_used: 1000,
        }),
      ).rejects.toThrow(ApiException);
    });

    it('연동되지 않은 레포지토리 URL이면 404를 던진다', async () => {
      (gitIntegrationsRepo.createQueryBuilder as jest.Mock).mockReturnValueOnce({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.recordByRepo('proj-key', {
          repo_url: 'https://github.com/owner/unknown',
          agent_name: 'antigravity',
          tokens_used: 1000,
        }),
      ).rejects.toThrow(ApiException);
    });

    it('레포 매핑 성공 시 기존 에이전트를 찾아 실행을 기록한다', async () => {
      const run = await service.recordByRepo('proj-key', {
        repo_url: 'git@github.com:owner/repo.git',
        agent_name: 'antigravity',
        tokens_used: 15000,
      });

      expect(agentsRepo.findOneBy).toHaveBeenCalledWith({
        project_id: 'proj-target',
        name: 'antigravity',
      });
      expect(runsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-1',
          tokens_used: 15000,
          status: 'succeeded',
        }),
      );
      expect(run.id).toBe('run-1');
    });

    it('에이전트가 없으면 자동으로 생성하고 실행을 기록한다', async () => {
      (agentsRepo.findOneBy as jest.Mock).mockResolvedValueOnce(null);

      const run = await service.recordByRepo('proj-key', {
        repo_url: 'https://github.com/owner/repo',
        agent_name: 'claude-code',
        tokens_used: 25000,
      });

      expect(agentsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'proj-target',
          name: 'claude-code',
        }),
      );
      expect(agentsRepo.save).toHaveBeenCalled();
      expect(run.id).toBe('run-1');
    });
  });

  describe('heartbeat', () => {
    it('중간 누적 토큰을 갱신하고 delta_tokens와 함께 AGENT_RUN_HEARTBEAT 이벤트를 발행한다', async () => {
      const existingRun = {
        id: 'run-hb-1',
        agent_id: 'agent-1',
        status: 'running',
        tokens_used: 10000,
        cost: '0.0360',
        started_at: new Date('2026-09-17T03:00:00.000Z'),
        ended_at: null,
      } as AgentRun;

      (runsRepo.findOneBy as jest.Mock).mockResolvedValue(existingRun);
      (membersRepo.countBy as jest.Mock).mockResolvedValue(1);

      const result = await service.heartbeat(
        'run-hb-1',
        { userId: 'user-1' },
        {
          tokens_used: 15000,
          model: 'claude-3-5-sonnet',
        },
      );

      expect(result.tokens_used).toBe(15000);
      expect(result.status).toBe('running');
      expect(result.ended_at).toBeNull();
      expect(runsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'run-hb-1',
          tokens_used: 15000,
          status: 'running',
        }),
      );

      expect(events.emit).toHaveBeenCalledWith(
        DomainEvent.AGENT_RUN_HEARTBEAT,
        expect.objectContaining({
          project_id: 'proj-1',
          agent_name: 'claude-code',
          run_id: 'run-hb-1',
          tokens_used: 15000,
          delta_tokens: 5000,
        }),
      );
    });

    it('API 키 신원(apiKeyProjectId)으로도 하트비트를 안전하게 갱신한다', async () => {
      const existingRun = {
        id: 'run-hb-2',
        agent_id: 'agent-1',
        status: 'running',
        tokens_used: 5000,
        cost: '0.0180',
        started_at: new Date('2026-09-17T03:00:00.000Z'),
        ended_at: null,
      } as AgentRun;

      (runsRepo.findOneBy as jest.Mock).mockResolvedValue(existingRun);

      const result = await service.heartbeat(
        'run-hb-2',
        { apiKeyProjectId: 'proj-1' },
        {
          tokens_used: 8000,
          model: 'gemini-3.8-flash',
        },
      );

      expect(result.tokens_used).toBe(8000);
      expect(result.model).toBe('gemini-3.8-flash');
      expect(events.emit).toHaveBeenCalledWith(
        DomainEvent.AGENT_RUN_HEARTBEAT,
        expect.objectContaining({
          project_id: 'proj-1',
          model: 'gemini-3.8-flash',
          delta_tokens: 3000,
        }),
      );
    });

    it('이미 cancelled 상태인 세션에 heartbeat 요청 시 409 Conflict 예외를 던진다', async () => {
      const cancelledRun = {
        id: 'run-hb-3',
        agent_id: 'agent-1',
        status: 'cancelled',
        tokens_used: 5000,
        cost: '0.0180',
        started_at: new Date('2026-09-17T03:00:00.000Z'),
        ended_at: new Date('2026-09-17T03:05:00.000Z'),
      } as AgentRun;

      (runsRepo.findOneBy as jest.Mock).mockResolvedValue(cancelledRun);
      (membersRepo.countBy as jest.Mock).mockResolvedValue(1);

      await expect(
        service.heartbeat('run-hb-3', { userId: 'user-1' }, { tokens_used: 6000 }),
      ).rejects.toThrow(ApiException);
    });
  });

  describe('detail', () => {
    it('세션 단건 상세 및 캐시 효율 데이터(cache, duration_seconds, model)를 정확히 반환한다', async () => {
      const run = {
        id: 'run-detail-1',
        agent_id: 'agent-1',
        model: 'claude-sonnet-5',
        status: 'running',
        tokens_used: 45000,
        cost: '0.1500',
        input_tokens: 5000,
        cache_read_tokens: 40000,
        cache_write_tokens: 0,
        started_at: new Date(Date.now() - 30000),
        ended_at: null,
      } as AgentRun;

      (runsRepo.findOneBy as jest.Mock).mockResolvedValue(run);
      (membersRepo.countBy as jest.Mock).mockResolvedValue(1);

      const detail = await service.detail('run-detail-1', { userId: 'user-1' });

      expect(detail.id).toBe('run-detail-1');
      expect(detail.agent_id).toBe('agent-1');
      expect(detail.agent_name).toBe('claude-code');
      expect(detail.project_id).toBe('proj-1');
      expect(detail.model).toBe('claude-sonnet-5');
      expect(detail.tokens_used).toBe(45000);
      expect(detail.duration_seconds).toBeGreaterThanOrEqual(30);
      expect(detail.cache).toBeDefined();
      expect(detail.cache.has_breakdown).toBe(true);
      expect(detail.cache.hit_rate_percentage).toBe(89); // round(40000/45000*100)
    });
  });
});
