import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source';
import { ALL_ENTITIES } from '../src/database/entities';

/**
 * 마이그레이션이 만든 실제 DB 스키마가 설계서 Part 3(ERD)과 일치하는지 검증한다.
 * 엔티티 정의를 그대로 다시 읽는 게 아니라 information_schema를 조회해,
 * "엔티티는 맞는데 마이그레이션이 빠졌다"는 어긋남까지 잡는다.
 *
 * 실행 전제: docker compose up -d db + pnpm migration:run
 */
describe('DB 스키마 ↔ ERD 일치 검증', () => {
  let ds: DataSource;

  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> =>
    ds.query(sql, params);

  beforeAll(async () => {
    ds = new DataSource({ ...dataSourceOptions, logging: false });
    await ds.initialize();
  }, 30_000);

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  /** 설계서 Part 3의 16개 + 웹훅 멱등성용 WEBHOOK_DELIVERIES(17번째). */
  const EXPECTED_TABLES = [
    'users',
    'sessions',
    'projects',
    'project_members',
    'git_integrations',
    'documents',
    'env_templates',
    'project_env_configs',
    'policy_check_results',
    'agents',
    'agent_runs',
    'project_budgets',
    'log_entries',
    'project_stage_history',
    'health_snapshots',
    'audit_logs',
    'webhook_deliveries',
  ];

  it('엔티티 17개가 모두 등록되어 있다', () => {
    expect(ALL_ENTITIES).toHaveLength(17);
  });

  it('테이블 17개가 정확히 존재한다 (migrations 테이블 제외)', async () => {
    const rows = await q<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'migrations'
       ORDER BY table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([...EXPECTED_TABLES].sort());
  });

  it('PROJECTS에 owner_id가 없다 — 소유권은 PROJECT_MEMBERS.role로 표현한다', async () => {
    const rows = await q(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'projects' AND column_name = 'owner_id'`,
    );
    expect(rows).toHaveLength(0);
  });

  it('PROJECTS.deleted_at이 존재한다 (soft delete)', async () => {
    const rows = await q<{ is_nullable: string; data_type: string }>(
      `SELECT is_nullable, data_type FROM information_schema.columns
       WHERE table_name = 'projects' AND column_name = 'deleted_at'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('YES');
    expect(rows[0].data_type).toBe('timestamp with time zone');
  });

  it('AUDIT_LOGS.project_id는 nullable, user_id는 not null이다', async () => {
    const rows = await q<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'audit_logs' AND column_name IN ('project_id', 'user_id')
       ORDER BY column_name`,
    );
    expect(rows).toEqual([
      { column_name: 'project_id', is_nullable: 'YES' },
      { column_name: 'user_id', is_nullable: 'NO' },
    ]);
  });

  it('ENV_TEMPLATES.owner_id가 USERS를 참조한다', async () => {
    const rows = await q<{ foreign_table: string }>(
      `SELECT ccu.table_name AS foreign_table
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_name = 'env_templates' AND kcu.column_name = 'owner_id'`,
    );
    expect(rows.map((r) => r.foreign_table)).toEqual(['users']);
  });

  it('모든 타임스탬프 컬럼이 timestamptz다 (타임존 없는 컬럼 0개)', async () => {
    const rows = await q<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'`,
    );
    expect(rows).toEqual([]);
  });

  it('금액 컬럼이 부동소수점이 아닌 numeric이다', async () => {
    const rows = await q<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name IN ('cost', 'cost_limit')
       ORDER BY table_name`,
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.data_type).toBe('numeric');
  });

  it('1:1 관계 컬럼에 유니크 제약이 정확히 하나씩만 걸려 있다', async () => {
    for (const table of ['git_integrations', 'project_budgets']) {
      const rows = await q(
        `SELECT tc.constraint_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
         WHERE tc.table_name = $1 AND tc.constraint_type = 'UNIQUE' AND kcu.column_name = 'project_id'`,
        [table],
      );
      expect({ table, count: rows.length }).toEqual({ table, count: 1 });
    }
  });

  it('PROJECT_MEMBERS(project_id, user_id)에 복합 유니크가 있다', async () => {
    const rows = await q<{ cols: string }>(
      `SELECT string_agg(kcu.column_name, ',' ORDER BY kcu.column_name) AS cols
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       WHERE tc.table_name = 'project_members' AND tc.constraint_type = 'UNIQUE'
       GROUP BY tc.constraint_name`,
    );
    expect(rows.map((r) => r.cols)).toContain('project_id,user_id');
  });

  it('WEBHOOK_DELIVERIES.delivery_id에 유니크가 있다 (멱등성 집행 지점)', async () => {
    const rows = await q(
      `SELECT tc.constraint_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       WHERE tc.table_name = 'webhook_deliveries' AND tc.constraint_type = 'UNIQUE'
         AND kcu.column_name = 'delivery_id'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('감사 로그는 프로젝트 삭제로 연쇄 삭제되지 않는다 (SET NULL)', async () => {
    const rows = await q<{ delete_rule: string }>(
      `SELECT rc.delete_rule
       FROM information_schema.referential_constraints rc
       JOIN information_schema.key_column_usage kcu ON rc.constraint_name = kcu.constraint_name
       WHERE kcu.table_name = 'audit_logs' AND kcu.column_name = 'project_id'`,
    );
    expect(rows.map((r) => r.delete_rule)).toEqual(['SET NULL']);
  });

  it('템플릿을 지워도 환경 구성 이력은 남는다 (template_id SET NULL)', async () => {
    const rows = await q<{ delete_rule: string }>(
      `SELECT rc.delete_rule
       FROM information_schema.referential_constraints rc
       JOIN information_schema.key_column_usage kcu ON rc.constraint_name = kcu.constraint_name
       WHERE kcu.table_name = 'project_env_configs' AND kcu.column_name = 'template_id'`,
    );
    expect(rows.map((r) => r.delete_rule)).toEqual(['SET NULL']);
  });
});
