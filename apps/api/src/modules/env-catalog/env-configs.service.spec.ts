import type { DataSource, EntityManager, Repository } from 'typeorm';
import { EnvConfigsService } from './env-configs.service';
import type { DockerConfigGenerator } from './docker-config-generator';
import type { PolicyCheck, PolicyGate } from './policy-gate';
import type {
  EnvConfigTransition,
  PolicyCheckResult,
  ProjectEnvConfig,
} from '../../database/entities';
import type { BuildStatus } from '../../database/entities/enums';
import type { EnvTemplatesService } from './env-templates.service';
import { AuditService } from '../audit/audit.service';
import type { EnvConfigExecutor, StartExecutionParams } from './env-config-executor';

/**
 * Policy Gate 판정과 상태 전이를 고정한다.
 * 여기가 새면 "사람의 승인 여부와 무관하게 원천 차단"(Part 1 §3.2.1)이 무너진다.
 */

const PROJECT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const CONFIG = '33333333-3333-4333-8333-333333333333';

const configRow = (status: BuildStatus): ProjectEnvConfig =>
  ({
    id: CONFIG,
    project_id: PROJECT,
    template_id: null,
    stack_config: {},
    docker_config: { dockerfile: 'FROM node:22-alpine', compose: null },
    build_status: status,
    created_at: new Date('2026-01-01T00:00:00Z'),
  }) as unknown as ProjectEnvConfig;

const make = (opts: {
  stored?: ProjectEnvConfig | null;
  checks?: PolicyCheck[];
  isMember?: boolean;
  /** 실행 어댑터가 시작조차 못 하는 경우 (워크플로 없음·권한 없음). */
  executorFails?: boolean;
}) => {
  const savedResults: Partial<PolicyCheckResult>[] = [];

  const configs = {
    findOneBy: async () => opts.stored ?? null,
    create: (v: Partial<ProjectEnvConfig>) => ({ ...configRow('generated'), ...v }),
    save: async (v: ProjectEnvConfig) => v,
  } as unknown as Repository<ProjectEnvConfig>;

  const results = {
    create: (v: Partial<PolicyCheckResult>) => v,
    save: async (v: Partial<PolicyCheckResult>[]) => {
      savedResults.push(...v);
      return v;
    },
    find: async () => [],
  } as unknown as Repository<PolicyCheckResult>;

  const members = {
    countBy: async () => (opts.isMember === false ? 0 : 1),
  } as unknown as Repository<never>;

  const generator: DockerConfigGenerator = {
    generate: async () => ({
      dockerfile: 'FROM node:22-alpine',
      compose: 'services:\n  app:\n    image: node:22-alpine',
      rationale: '설명',
    }),
  };

  const gate: PolicyGate = { run: async () => opts.checks ?? [] };

  const templates = {
    presetFor: async () => ({ language: 'node' }),
  } as unknown as EnvTemplatesService;

  /**
   * 전이 이력을 담는 가짜 트랜잭션.
   *
   * 실제 DataSource 없이도 "상태가 바뀔 때 이력이 함께 쓰이는가"를 볼 수 있어야 한다 —
   * 그게 이 기능에서 실제로 깨지는 지점이다(상태만 바뀌고 이력이 빠지는 것).
   */
  const transitions: Partial<EnvConfigTransition>[] = [];
  const dataSource = {
    transaction: async <T>(cb: (m: EntityManager) => Promise<T>): Promise<T> => {
      const manager = {
        create: (_entity: unknown, v: Record<string, unknown>) => v,
        save: async (v: unknown) => {
          // 전이 행만 골라 담는다. 구성 저장도 같은 manager를 지난다.
          if (v !== null && typeof v === 'object' && 'to_status' in v) {
            transitions.push(v as Partial<EnvConfigTransition>);
          }
          return v;
        },
      } as unknown as EntityManager;
      return cb(manager);
    },
  } as unknown as DataSource;

  const transitionRepo = {
    find: async () => [],
  } as unknown as Repository<EnvConfigTransition>;

  /** 실행 시작 기록. 시작시켰는지, 무엇으로 시작시켰는지를 본다. */
  const started: StartExecutionParams[] = [];
  const executor: EnvConfigExecutor = {
    start: async (params) => {
      started.push(params);
      if (opts.executorFails) throw new Error('워크플로가 없습니다');
    },
  };

  const service = new EnvConfigsService(
    configs,
    results,
    members,
    transitionRepo,
    generator,
    gate,
    executor,
    templates,
    { record: async () => undefined } as unknown as AuditService,
    dataSource,
  );
  return { service, savedResults, transitions, started };
};

const pass = (tool: 'trivy' | 'conftest'): PolicyCheck => ({
  tool,
  verdict: 'pass',
  risk_notes: null,
});
const fail = (tool: 'trivy' | 'conftest'): PolicyCheck => ({
  tool,
  verdict: 'fail',
  risk_notes: '위험',
});

describe('EnvConfigsService', () => {
  describe('Policy Gate 판정 (AND)', () => {
    it('둘 다 pass여야 policy_passed다', async () => {
      const { service } = make({ checks: [pass('trivy'), pass('conftest')] });

      const config = await service.create(PROJECT, USER, {
        input_mode: 'ui',
        stack_input: { language: 'node' },
      });

      expect(config.build_status).toBe('policy_passed');
    });

    it('하나만 fail이어도 policy_blocked다', async () => {
      const { service } = make({ checks: [pass('trivy'), fail('conftest')] });

      const config = await service.create(PROJECT, USER, {
        input_mode: 'ui',
        stack_input: {},
      });

      expect(config.build_status).toBe('policy_blocked');
    });

    it('검사 결과가 하나도 없으면 통과시키지 않는다', async () => {
      // 도구가 전부 죽어 결과가 비었을 때 "위반 없음"으로 읽으면 게이트가 뚫린다.
      const { service } = make({ checks: [] });

      const config = await service.create(PROJECT, USER, {
        input_mode: 'ui',
        stack_input: {},
      });

      expect(config.build_status).toBe('policy_blocked');
    });

    it('도구별 결과를 각각 기록한다 — 무엇이 잡았는지 추적해야 한다', async () => {
      const { service, savedResults } = make({ checks: [pass('trivy'), fail('conftest')] });

      await service.create(PROJECT, USER, { input_mode: 'ui', stack_input: {} });

      expect(savedResults).toHaveLength(2);
      expect(savedResults.map((r) => r.tool).sort()).toEqual(['conftest', 'trivy']);
    });
  });

  describe('승인 — 상태만 본다', () => {
    it('policy_passed에서만 승인된다', async () => {
      const { service } = make({ stored: configRow('policy_passed') });

      expect((await service.approve(CONFIG, USER)).build_status).toBe('approved');
    });

    it('policy_blocked는 사람이 승인하려 해도 409다', async () => {
      const { service } = make({ stored: configRow('policy_blocked') });

      await expect(service.approve(CONFIG, USER)).rejects.toMatchObject({
        code: 'INVALID_STATE_TRANSITION',
        status: 409,
      });
    });

    it('generated 상태에서는 승인할 수 없다 — 아직 검사 전이다', async () => {
      const { service } = make({ stored: configRow('generated') });

      await expect(service.approve(CONFIG, USER)).rejects.toMatchObject({ status: 409 });
    });

    it('이미 승인된 것을 또 승인하지 않는다', async () => {
      const { service } = make({ stored: configRow('approved') });

      await expect(service.approve(CONFIG, USER)).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('실행', () => {
    it('approved에서만 실행된다', async () => {
      const { service } = make({ stored: configRow('approved') });

      expect((await service.execute(CONFIG, USER)).build_status).toBe('running');
    });

    it('policy_passed만으로는 실행할 수 없다 — 사람 승인이 빠졌다', async () => {
      const { service } = make({ stored: configRow('policy_passed') });

      await expect(service.execute(CONFIG, USER)).rejects.toMatchObject({ status: 409 });
    });

    it('실행 어댑터에 구성과 프로젝트를 넘겨 시작시킨다', async () => {
      const { service, started } = make({ stored: configRow('approved') });
      await service.execute(CONFIG, USER);

      // 생성된 Dockerfile을 함께 넘긴다 — 실행 측이 검증할 것은 레포의 파일이 아니라
      // 이 구성의 내용이다. 빠지면 사용자가 손으로 옮겨 적어야만 실행이 성립한다.
      expect(started).toEqual([
        {
          envConfigId: CONFIG,
          projectId: PROJECT,
          userId: USER,
          dockerfile: 'FROM node:22-alpine',
        },
      ]);
    });

    it('running으로 옮긴 뒤에 시작시킨다', async () => {
      // 순서를 뒤집으면 실행 측이 우리보다 먼저 끝나 결과 웹훅이 approved 상태의 구성에
      // 도착하고, 그 결과는 버려진다.
      const { service, transitions, started } = make({ stored: configRow('approved') });
      await service.execute(CONFIG, USER);

      expect(transitions.map((t) => t.to_status)).toEqual(['running']);
      expect(started).toHaveLength(1);
    });

    it('시작조차 못 하면 failed로 되돌리고 오류를 올린다', async () => {
      // running에 두면 아무것도 안 도는데 화면에는 도는 것으로 보인다.
      const { service, transitions } = make({
        stored: configRow('approved'),
        executorFails: true,
      });

      await expect(service.execute(CONFIG, USER)).rejects.toThrow('워크플로가 없습니다');
      expect(transitions.map((t) => t.to_status)).toEqual(['running', 'failed']);
      expect(transitions[1].reason).toContain('실행을 시작하지 못했습니다');
    });
  });

  describe('실행 결과 수신', () => {
    const event = (over: Partial<Parameters<EnvConfigsService['onWorkflowRunCompleted']>[0]>) => ({
      project_id: PROJECT,
      run_name: `muster-env ${CONFIG}`,
      conclusion: 'success',
      run_url: 'https://github.com/o/r/actions/runs/1',
      occurred_at: '2026-09-13T00:00:00.000Z',
      ...over,
    });

    it('성공이면 succeeded로 전이하고 실행 주소를 사유에 남긴다', async () => {
      const { service, transitions } = make({ stored: configRow('running') });
      await service.onWorkflowRunCompleted(event({}));

      expect(transitions[0]).toMatchObject({ to_status: 'succeeded', actor_user_id: null });
      expect(transitions[0].reason).toContain('https://github.com/o/r/actions/runs/1');
    });

    it('실패는 failed로 전이한다', async () => {
      const { service, transitions } = make({ stored: configRow('running') });
      await service.onWorkflowRunCompleted(event({ conclusion: 'failure' }));

      expect(transitions[0]).toMatchObject({ to_status: 'failed' });
    });

    it('취소·타임아웃도 끝난 것으로 본다 — 아니면 running에 영영 머문다', async () => {
      for (const conclusion of ['cancelled', 'timed_out', null]) {
        const { service, transitions } = make({ stored: configRow('running') });
        await service.onWorkflowRunCompleted(event({ conclusion }));

        expect(transitions[0]).toMatchObject({ to_status: 'failed' });
      }
    });

    it('사용자 레포의 다른 워크플로는 무시한다', async () => {
      const { service, transitions } = make({ stored: configRow('running') });
      await service.onWorkflowRunCompleted(event({ run_name: 'CI' }));

      expect(transitions).toHaveLength(0);
    });

    it('다른 프로젝트에서 온 결과로는 전이하지 않는다', async () => {
      // 같은 레포가 두 프로젝트에 연동돼 있어도 남의 구성을 건드리지 않는다.
      const { service, transitions } = make({ stored: configRow('running') });
      await service.onWorkflowRunCompleted(
        event({ project_id: '44444444-4444-4444-8444-444444444444' }),
      );

      expect(transitions).toHaveLength(0);
    });

    it('이미 끝난 구성은 되살리지 않는다 — 웹훅은 재전송된다', async () => {
      const { service, transitions } = make({ stored: configRow('succeeded') });
      await service.onWorkflowRunCompleted(event({ conclusion: 'failure' }));

      expect(transitions).toHaveLength(0);
    });
  });

  describe('접근 제어', () => {
    it('비멤버에게는 404다', async () => {
      const { service } = make({ stored: configRow('policy_passed'), isMember: false });

      await expect(service.detail(CONFIG, USER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
  describe('상태 전이 이력', () => {
    it('생성은 generated 한 줄을 남기고, 직전 상태가 없으므로 from은 null이다', async () => {
      const { service, transitions } = make({ checks: [pass('trivy'), pass('conftest')] });
      await service.create(PROJECT, USER, { stack_input: {}, input_mode: 'ui' } as never);

      expect(transitions[0]).toMatchObject({
        from_status: null,
        to_status: 'generated',
        actor_user_id: USER,
      });
    });

    it('Policy Gate 판정의 행위자는 null이다 — 기계가 한 일에 사람 이름을 적지 않는다', async () => {
      const { service, transitions } = make({ checks: [pass('trivy'), fail('conftest')] });
      await service.create(PROJECT, USER, { stack_input: {}, input_mode: 'ui' } as never);

      const gate = transitions[1];
      expect(gate).toMatchObject({
        from_status: 'generated',
        to_status: 'policy_blocked',
        actor_user_id: null,
      });
      // 왜 막혔는지가 이력만 보고도 읽혀야 한다.
      expect(gate.reason).toContain('conftest');
    });

    it('통과한 판정에는 사유가 없다 — 없는 사유를 지어내지 않는다', async () => {
      const { service, transitions } = make({ checks: [pass('trivy'), pass('conftest')] });
      await service.create(PROJECT, USER, { stack_input: {}, input_mode: 'ui' } as never);

      expect(transitions[1]).toMatchObject({ to_status: 'policy_passed', reason: null });
    });

    it('승인은 누가 했는지를 남긴다 — 승인은 사람의 판단이다', async () => {
      const { service, transitions } = make({ stored: configRow('policy_passed') });
      await service.approve(CONFIG, USER);

      expect(transitions).toEqual([
        expect.objectContaining({
          from_status: 'policy_passed',
          to_status: 'approved',
          actor_user_id: USER,
        }),
      ]);
    });

    it('전이가 거부되면 이력도 남지 않는다', async () => {
      const { service, transitions } = make({ stored: configRow('policy_blocked') });
      await expect(service.approve(CONFIG, USER)).rejects.toMatchObject({ status: 409 });

      expect(transitions).toHaveLength(0);
    });
  });
});
