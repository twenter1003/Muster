import { Repository } from 'typeorm';
import { AgentRunsService } from './agent-runs.service';
import { BudgetService } from './budget.service';
import type { Agent, AgentRun, ProjectMember } from '../../database/entities';

describe('AgentRunsService', () => {
  let service: AgentRunsService;
  let runsRepo: Partial<Repository<AgentRun>>;
  let agentsRepo: Partial<Repository<Agent>>;
  let membersRepo: Partial<Repository<ProjectMember>>;
  let budgetService: Partial<BudgetService>;

  beforeEach(() => {
    runsRepo = {
      create: jest.fn().mockImplementation((val) => val),
      save: jest.fn().mockImplementation(async (val) => ({ id: 'run-1', ...val })),
      findOneBy: jest.fn(),
    };
    agentsRepo = {
      findOneBy: jest.fn().mockResolvedValue({ id: 'agent-1', project_id: 'proj-1' } as Agent),
    };
    membersRepo = {};
    budgetService = {
      sumUsage: jest.fn().mockResolvedValue({ tokens: '100', cost: '0' }),
      recalculateAndAlert: jest.fn().mockResolvedValue(undefined),
    };

    service = new AgentRunsService(
      runsRepo as Repository<AgentRun>,
      agentsRepo as Repository<Agent>,
      membersRepo as Repository<ProjectMember>,
      budgetService as BudgetService,
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
  });
});
