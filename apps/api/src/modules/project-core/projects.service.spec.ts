import type { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import type {
  Agent,
  AgentRun,
  DeploymentEvent,
  GitIntegration,
  HealthSnapshot,
  LogEntry,
  Project,
  ProjectMember,
} from '../../database/entities';
import type { AuditService } from '../audit/audit.service';
import type { PageRequest } from '../../common/pagination/paginate';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';

function createMockQb(results: { raw?: unknown[]; many?: unknown[] }) {
  const qb: Record<string, unknown> = {};
  const chain = () => qb;
  for (const method of [
    'innerJoin',
    'distinctOn',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'groupBy',
    'addGroupBy',
    'take',
    'limit',
    'setParameters',
  ]) {
    qb[method] = jest.fn().mockImplementation(chain);
  }
  qb.getMany = jest.fn().mockResolvedValue(results.many ?? []);
  qb.getRawMany = jest.fn().mockResolvedValue(results.raw ?? []);
  qb.getRawOne = jest.fn().mockResolvedValue(results.raw?.[0] ?? null);
  return qb;
}

interface MockContext {
  projectsQb: ReturnType<typeof createMockQb>;
  gitQb: ReturnType<typeof createMockQb>;
  healthQb: ReturnType<typeof createMockQb>;
  deployQb: ReturnType<typeof createMockQb>;
  logQb: ReturnType<typeof createMockQb>;
  agentsQb: ReturnType<typeof createMockQb>;
  agentRunQb: ReturnType<typeof createMockQb>;
  service: ProjectsService;
}

function setupTest(opts: {
  projects?: unknown[];
  gitIntegrations?: unknown[];
  healthSnapshots?: unknown[];
  deployments?: unknown[];
  logs?: unknown[];
  activeAgents?: unknown[];
  tokens?: unknown[];
}): MockContext {
  const projectsQb = createMockQb({ many: opts.projects ?? [] });
  const gitQb = createMockQb({ raw: opts.gitIntegrations ?? [] });
  const healthQb = createMockQb({ raw: opts.healthSnapshots ?? [] });
  const deployQb = createMockQb({ raw: opts.deployments ?? [] });
  const logQb = createMockQb({ raw: opts.logs ?? [] });
  const agentsQb = createMockQb({ raw: opts.activeAgents ?? [] });
  const agentRunQb = createMockQb({ raw: opts.tokens ?? [] });

  const projectsRepo = { createQueryBuilder: () => projectsQb } as unknown as Repository<Project>;
  const membersRepo = {} as unknown as Repository<ProjectMember>;
  const gitRepo = { createQueryBuilder: () => gitQb } as unknown as Repository<GitIntegration>;
  const healthRepo = {
    createQueryBuilder: () => healthQb,
  } as unknown as Repository<HealthSnapshot>;
  const deployRepo = {
    createQueryBuilder: () => deployQb,
  } as unknown as Repository<DeploymentEvent>;
  const logRepo = { createQueryBuilder: () => logQb } as unknown as Repository<LogEntry>;
  const agentRunRepo = { createQueryBuilder: () => agentRunQb } as unknown as Repository<AgentRun>;
  const agentRepo = { createQueryBuilder: () => agentsQb } as unknown as Repository<Agent>;
  const dataSource = {} as never;
  const events = new EventEmitter2();
  const audit = { record: jest.fn() } as unknown as AuditService;

  const service = new ProjectsService(
    projectsRepo,
    membersRepo,
    gitRepo,
    healthRepo,
    deployRepo,
    logRepo,
    agentRunRepo,
    agentRepo,
    dataSource,
    events,
    audit,
  );

  return { projectsQb, gitQb, healthQb, deployQb, logQb, agentsQb, agentRunQb, service };
}

describe('ProjectsService.listSummariesForUser', () => {
  const pageReq: PageRequest = { limit: 10, after: null };

  it('사용자가 속한 프로젝트가 없으면 자식 테이블 조회 없이 빈 배열을 반환한다', async () => {
    const { service, gitQb, healthQb, deployQb, logQb, agentsQb, agentRunQb } = setupTest({
      projects: [],
    });

    const result = await service.listSummariesForUser('user-1', pageReq);

    expect(result).toEqual({ items: [], next_cursor: null });
    expect(gitQb.getRawMany).not.toHaveBeenCalled();
    expect(healthQb.getRawMany).not.toHaveBeenCalled();
    expect(deployQb.getRawMany).not.toHaveBeenCalled();
    expect(logQb.getRawMany).not.toHaveBeenCalled();
    expect(agentsQb.getRawMany).not.toHaveBeenCalled();
    expect(agentRunQb.getRawMany).not.toHaveBeenCalled();
  });

  it('모든 연관 데이터가 존재하는 프로젝트의 요약을 올바르게 집계한다', async () => {
    const createdAt = new Date('2026-03-01T10:00:00Z');
    const updatedAt = new Date('2026-03-02T15:30:00Z');

    const { service } = setupTest({
      projects: [
        {
          id: 'proj-1',
          name: 'Muster Core',
          current_stage: 'development',
          created_at: createdAt,
          updated_at: updatedAt,
        },
      ],
      gitIntegrations: [{ project_id: 'proj-1', repo_url: 'https://github.com/muster/core' }],
      healthSnapshots: [{ project_id: 'proj-1', composite_score: '3.75' }],
      deployments: [{ project_id: 'proj-1', status: 'success' }],
      logs: [{ project_id: 'proj-1', message: 'Deployment completed successfully' }],
      activeAgents: [
        { project_id: 'proj-1', agent_name: 'claude-code' },
        { project_id: 'proj-1', agent_name: 'test-agent' },
      ],
      tokens: [
        {
          project_id: 'proj-1',
          today_tokens: '12500',
          today_cost: '0.0450',
          month_tokens: '350000',
          month_cost: '1.2400',
          total_tokens: '1200000',
          total_cost: '4.5000',
        },
      ],
    });

    const result = await service.listSummariesForUser('user-1', pageReq);

    expect(result.items).toHaveLength(1);
    const summary = result.items[0];
    expect(summary).toEqual({
      id: 'proj-1',
      name: 'Muster Core',
      current_stage: 'development',
      created_at: createdAt.toISOString(),
      updated_at: updatedAt.toISOString(),
      repo_url: 'https://github.com/muster/core',
      health_score: 3.75,
      latest_deploy_status: 'success',
      latest_log_message: 'Deployment completed successfully',
      active_agents: ['claude-code', 'test-agent'],
      tokens: {
        today: '12500',
        month: '350000',
        total: '1200000',
        today_cost: '0.0450',
        month_cost: '1.2400',
        total_cost: '4.5000',
      },
    });
    expect(result.next_cursor).toBeNull();
  });

  it('연관 데이터가 없는 경우 안전한 기본값(null, [], 0)을 반환한다', async () => {
    const createdAt = new Date('2026-03-01T10:00:00Z');
    const updatedAt = new Date('2026-03-01T10:00:00Z');

    const { service } = setupTest({
      projects: [
        {
          id: 'proj-empty',
          name: 'Empty Project',
          current_stage: 'idea',
          created_at: createdAt,
          updated_at: updatedAt,
        },
      ],
      gitIntegrations: [],
      healthSnapshots: [],
      deployments: [],
      logs: [],
      activeAgents: [],
      tokens: [],
    });

    const result = await service.listSummariesForUser('user-1', pageReq);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      id: 'proj-empty',
      name: 'Empty Project',
      current_stage: 'idea',
      created_at: createdAt.toISOString(),
      updated_at: updatedAt.toISOString(),
      repo_url: null,
      health_score: null,
      latest_deploy_status: null,
      latest_log_message: null,
      active_agents: [],
      tokens: {
        today: '0',
        month: '0',
        total: '0',
        today_cost: '0',
        month_cost: '0',
        total_cost: '0',
      },
    });
  });

  it('동일한 실행 중인 에이전트 이름이 중복 집계되지 않고 정렬된다', async () => {
    const { service } = setupTest({
      projects: [
        {
          id: 'proj-1',
          name: 'Multi Agent Project',
          current_stage: 'development',
          created_at: new Date('2026-01-01T00:00:00Z'),
          updated_at: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      activeAgents: [
        { project_id: 'proj-1', agent_name: 'zebra-agent' },
        { project_id: 'proj-1', agent_name: 'alpha-agent' },
        { project_id: 'proj-1', agent_name: 'zebra-agent' }, // duplicate
      ],
    });

    const result = await service.listSummariesForUser('user-1', pageReq);

    expect(result.items[0].active_agents).toEqual(['alpha-agent', 'zebra-agent']);
  });

  it('유효하지 않은 health_score(NaN/Infinity)는 null로 처리한다', async () => {
    const { service } = setupTest({
      projects: [
        {
          id: 'proj-1',
          name: 'Invalid Health Project',
          current_stage: 'planning',
          created_at: new Date('2026-01-01T00:00:00Z'),
          updated_at: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      healthSnapshots: [{ project_id: 'proj-1', composite_score: 'invalid-number' }],
    });

    const result = await service.listSummariesForUser('user-1', pageReq);

    expect(result.items[0].health_score).toBeNull();
  });

  it('다음 페이지가 있는 경우 next_cursor를 정확히 반환한다', async () => {
    const p1 = {
      id: 'p1',
      name: 'Project 1',
      current_stage: 'idea',
      created_at: new Date('2026-01-02T00:00:00Z'),
      updated_at: new Date('2026-01-02T00:00:00Z'),
    };
    const p2 = {
      id: 'p2',
      name: 'Project 2',
      current_stage: 'idea',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
    };

    // limit is 1, but getMany returns 2 rows (limit + 1)
    const { service } = setupTest({
      projects: [p1, p2],
    });

    const result = await service.listSummariesForUser('user-1', { limit: 1, after: null });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('p1');
    expect(result.next_cursor).not.toBeNull();
  });

  it('커스텀 타임존 tz가 전달되면 해당 파라미터가 쿼리에 반영된다', async () => {
    const { service, agentRunQb } = setupTest({
      projects: [
        {
          id: 'proj-1',
          name: 'TZ Project',
          current_stage: 'planning',
          created_at: new Date('2026-01-01T00:00:00Z'),
          updated_at: new Date('2026-01-01T00:00:00Z'),
        },
      ],
    });

    await service.listSummariesForUser('user-1', pageReq, 'America/New_York');

    expect(agentRunQb.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        tz: 'America/New_York',
      }),
    );
  });
});

describe('ProjectsController.list — summary 플래그 분기', () => {
  const dummyUser: AuthenticatedUser = {
    id: 'user-123',
    github_login: 'octocat',
    email: 'octo@github.com',
  };

  it('summaryFlag가 "true"이면 listSummariesForUser를 호출한다', async () => {
    const listSummariesForUser = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'p1',
          name: 'Summary Proj',
          current_stage: 'idea',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          repo_url: null,
          health_score: null,
          latest_deploy_status: null,
          latest_log_message: null,
          active_agents: [],
          tokens: {
            today: '0',
            month: '0',
            total: '0',
            today_cost: '0',
            month_cost: '0',
            total_cost: '0',
          },
        },
      ],
      next_cursor: null,
    });
    const listForUser = jest.fn();

    const controller = new ProjectsController(
      { listSummariesForUser, listForUser } as unknown as ProjectsService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const res = await controller.list(dummyUser, { limit: 20 }, 'true', 'Asia/Seoul');

    expect(listSummariesForUser).toHaveBeenCalledWith(
      'user-123',
      { limit: 20, after: null },
      'Asia/Seoul',
    );
    expect(listForUser).not.toHaveBeenCalled();
    expect(res.items[0]).toHaveProperty('tokens');
  });

  it('summaryFlag가 없거나 "false"이면 기존 listForUser를 호출하고 ProjectView를 반환한다', async () => {
    const listSummariesForUser = jest.fn();
    const listForUser = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'p1',
          name: 'Standard Proj',
          current_stage: 'development',
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          updated_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      next_cursor: null,
    });

    const controller = new ProjectsController(
      { listSummariesForUser, listForUser } as unknown as ProjectsService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const res = await controller.list(dummyUser, { limit: 20 }, 'false');

    expect(listForUser).toHaveBeenCalledWith('user-123', { limit: 20, after: null });
    expect(listSummariesForUser).not.toHaveBeenCalled();
    expect(res.items[0]).toEqual({
      id: 'p1',
      name: 'Standard Proj',
      current_stage: 'development',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    expect('tokens' in res.items[0]).toBe(false);
  });
});
