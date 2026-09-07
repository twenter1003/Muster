import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source';
import { Project, ProjectMember, User } from '../src/database/entities';

/**
 * CHECK 제약이 실제로 잘못된 값을 거부하는지 확인한다.
 * "제약을 걸었다"가 아니라 "제약이 막는다"를 검증하는 것이 목적이다.
 */
describe('DB 제약 집행 검증', () => {
  let ds: DataSource;
  const created: Array<[table: string, id: string]> = [];

  const insert = async (sql: string, params: unknown[]): Promise<string> => {
    const [row] = (await ds.query(sql, params)) as Array<{ id: string }>;
    return row.id;
  };

  beforeAll(async () => {
    ds = new DataSource({ ...dataSourceOptions, logging: false });
    await ds.initialize();
  }, 30_000);

  afterAll(async () => {
    for (const [table, id] of created.reverse()) {
      await ds.query(`DELETE FROM "${table}" WHERE id = $1`, [id]);
    }
    if (ds?.isInitialized) await ds.destroy();
  });

  const newUser = async () => {
    const id = await insert(
      `INSERT INTO users (github_login, email) VALUES ($1, $2) RETURNING id`,
      [`probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, null],
    );
    created.push(['users', id]);
    return id;
  };

  const newProject = async () => {
    const id = await insert(`INSERT INTO projects (name) VALUES ($1) RETURNING id`, ['probe']);
    created.push(['projects', id]);
    return id;
  };

  it('current_stage 기본값은 planning이다', async () => {
    const id = await newProject();
    const [row] = (await ds.query(`SELECT current_stage FROM projects WHERE id = $1`, [id])) as Array<{
      current_stage: string;
    }>;
    expect(row.current_stage).toBe('planning');
  });

  it('정의되지 않은 current_stage는 거부된다', async () => {
    await expect(
      ds.query(`INSERT INTO projects (name, current_stage) VALUES ('bad', 'shipped')`),
    ).rejects.toThrow(/chk_projects_current_stage/);
  });

  it('정의되지 않은 build_status는 거부된다 — 승인 게이트를 우회할 수 없다', async () => {
    const projectId = await newProject();
    await expect(
      ds.query(
        `INSERT INTO project_env_configs (project_id, stack_config, docker_config, build_status)
         VALUES ($1, '{}', '{}', 'totally_approved')`,
        [projectId],
      ),
    ).rejects.toThrow(/chk_env_configs_build_status/);
  });

  it('rejected와 succeeded는 유효한 상태다 (설계서 6개에서 확장한 값)', async () => {
    const projectId = await newProject();
    for (const status of ['rejected', 'succeeded']) {
      const id = await insert(
        `INSERT INTO project_env_configs (project_id, stack_config, docker_config, build_status)
         VALUES ($1, '{}', '{}', $2) RETURNING id`,
        [projectId, status],
      );
      expect(id).toBeTruthy();
    }
  });

  it('DORA 등급 점수는 1~4를 벗어날 수 없다', async () => {
    const projectId = await newProject();
    await expect(
      ds.query(
        `INSERT INTO health_snapshots
           (project_id, deploy_freq_score, lead_time_score, change_fail_score, mttr_score, composite_score)
         VALUES ($1, 5, 4, 4, 4, 4.00)`,
        [projectId],
      ),
    ).rejects.toThrow(/chk_health_deploy_freq_score/);
  });

  it('실행 종료 시각은 시작 시각보다 앞설 수 없다', async () => {
    const projectId = await newProject();
    const agentId = await insert(
      `INSERT INTO agents (project_id, name, config_md) VALUES ($1, 'a', '') RETURNING id`,
      [projectId],
    );
    created.push(['agents', agentId]);

    await expect(
      ds.query(
        `INSERT INTO agent_runs (agent_id, status, started_at, ended_at)
         VALUES ($1, 'succeeded', now(), now() - interval '1 hour')`,
        [agentId],
      ),
    ).rejects.toThrow(/chk_agent_runs_time_order/);
  });

  it('running인데 종료 시각이 있는 모순된 실행은 거부된다', async () => {
    const projectId = await newProject();
    const agentId = await insert(
      `INSERT INTO agents (project_id, name, config_md) VALUES ($1, 'a', '') RETURNING id`,
      [projectId],
    );
    created.push(['agents', agentId]);

    await expect(
      ds.query(
        `INSERT INTO agent_runs (agent_id, status, started_at, ended_at)
         VALUES ($1, 'running', now(), now())`,
        [agentId],
      ),
    ).rejects.toThrow(/chk_agent_runs_status_matches_ended_at/);
  });

  it('같은 사용자를 같은 프로젝트에 두 번 넣을 수 없다', async () => {
    const userId = await newUser();
    const projectId = await newProject();

    await ds.query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')`, [
      projectId,
      userId,
    ]);
    await expect(
      ds.query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'member')`, [
        projectId,
        userId,
      ]),
    ).rejects.toThrow(/uq_project_members_project_user/);
  });

  it('같은 웹훅 배달 ID는 두 번 저장되지 않는다 (멱등성)', async () => {
    const deliveryId = `probe-${Date.now()}`;
    const id = await insert(
      `INSERT INTO webhook_deliveries (delivery_id) VALUES ($1) RETURNING id`,
      [deliveryId],
    );
    created.push(['webhook_deliveries', id]);

    await expect(
      ds.query(`INSERT INTO webhook_deliveries (delivery_id) VALUES ($1)`, [deliveryId]),
    ).rejects.toThrow(/duplicate key|delivery_id/i);
  });

  it('soft delete된 프로젝트는 TypeORM 조회에서 자동으로 빠진다', async () => {
    const repo = ds.getRepository(Project);
    const project = await repo.save(repo.create({ name: 'to-be-deleted' }));
    created.push(['projects', project.id]);

    expect(await repo.findOneBy({ id: project.id })).not.toBeNull();

    await repo.softDelete(project.id);

    // 필터를 따로 쓰지 않아도 제외된다 — 이게 TypeORM을 고른 이유다.
    expect(await repo.findOneBy({ id: project.id })).toBeNull();
    // 행 자체는 남아 있어 감사 추적이 끊기지 않는다.
    const [raw] = (await ds.query(`SELECT deleted_at FROM projects WHERE id = $1`, [
      project.id,
    ])) as Array<{ deleted_at: string | null }>;
    expect(raw.deleted_at).not.toBeNull();
  });

  it('프로젝트를 지워도 감사 로그는 남는다 (project_id만 null이 된다)', async () => {
    const userId = await newUser();
    const projectId = await newProject();
    const logId = await insert(
      `INSERT INTO audit_logs (user_id, project_id, action) VALUES ($1, $2, 'project.create') RETURNING id`,
      [userId, projectId],
    );
    created.push(['audit_logs', logId]);

    // soft delete가 정책이지만, 물리 삭제가 일어나더라도 감사 기록은 보존되어야 한다.
    await ds.query(`DELETE FROM projects WHERE id = $1`, [projectId]);

    const [row] = (await ds.query(`SELECT project_id, action FROM audit_logs WHERE id = $1`, [
      logId,
    ])) as Array<{ project_id: string | null; action: string }>;
    expect(row).toBeDefined();
    expect(row.project_id).toBeNull();
    expect(row.action).toBe('project.create');
  });

  it('프로젝트 멤버십은 프로젝트 물리 삭제 시 함께 정리된다 (CASCADE)', async () => {
    const userId = await newUser();
    const projectId = await newProject();
    await ds.query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')`, [
      projectId,
      userId,
    ]);

    await ds.query(`DELETE FROM projects WHERE id = $1`, [projectId]);

    const rows = (await ds.getRepository(ProjectMember).find({
      where: { project_id: projectId },
    })) as ProjectMember[];
    expect(rows).toHaveLength(0);
  });

  it('github_login은 중복될 수 없다', async () => {
    const login = `probe-dup-${Date.now()}`;
    const id = await insert(`INSERT INTO users (github_login) VALUES ($1) RETURNING id`, [login]);
    created.push(['users', id]);

    await expect(
      ds.getRepository(User).save(ds.getRepository(User).create({ github_login: login, email: null })),
    ).rejects.toThrow(/duplicate key|github_login/i);
  });
});
