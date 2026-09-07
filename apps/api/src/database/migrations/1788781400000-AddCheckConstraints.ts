import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 문자열 컬럼의 허용값을 DB 레벨에서 강제한다.
 *
 * 네이티브 PG enum 대신 varchar + CHECK를 쓰는 이유는 database/entities/enums.ts 참조.
 * 애플리케이션이 검증을 빠뜨려도 잘못된 상태값이 저장되지 않아야 한다 —
 * 특히 build_status는 Policy Gate의 상태 전이 계약(Part 4 §5.2)을 지탱하는 값이라
 * 임의 문자열이 들어가면 승인 게이트가 무력화될 수 있다.
 */
export class AddCheckConstraints1788781400000 implements MigrationInterface {
  name = 'AddCheckConstraints1788781400000';

  private readonly checks: ReadonlyArray<[table: string, name: string, expression: string]> = [
    [
      'projects',
      'chk_projects_current_stage',
      `"current_stage" IN ('planning','development','testing','deployment')`,
    ],
    ['project_members', 'chk_project_members_role', `"role" IN ('owner','member')`],
    ['documents', 'chk_documents_type', `"type" IN ('prd','srs','tech_spec','other')`],
    [
      'project_env_configs',
      'chk_env_configs_build_status',
      `"build_status" IN ('generated','policy_passed','policy_blocked','approved','rejected','running','succeeded','failed')`,
    ],
    ['policy_check_results', 'chk_policy_results_tool', `"tool" IN ('trivy','conftest')`],
    ['policy_check_results', 'chk_policy_results_verdict', `"verdict" IN ('pass','fail')`],
    ['agent_runs', 'chk_agent_runs_status', `"status" IN ('running','succeeded','failed')`],
    ['log_entries', 'chk_log_entries_level', `"level" IN ('error','warn','info')`],
    [
      'project_stage_history',
      'chk_stage_history_stage',
      `"stage" IN ('planning','development','testing','deployment')`,
    ],
    // DORA 등급 점수는 Elite/High/Medium/Low를 4/3/2/1로 매핑한 값이므로 1~4를 벗어날 수 없다.
    ['health_snapshots', 'chk_health_deploy_freq_score', `"deploy_freq_score" BETWEEN 1 AND 4`],
    ['health_snapshots', 'chk_health_lead_time_score', `"lead_time_score" BETWEEN 1 AND 4`],
    ['health_snapshots', 'chk_health_change_fail_score', `"change_fail_score" BETWEEN 1 AND 4`],
    ['health_snapshots', 'chk_health_mttr_score', `"mttr_score" BETWEEN 1 AND 4`],
    ['health_snapshots', 'chk_health_composite_score', `"composite_score" BETWEEN 1 AND 4`],
    // 예산은 음수일 수 없고, 알림 임계치는 백분율이다.
    ['project_budgets', 'chk_budgets_token_limit', `"token_limit" IS NULL OR "token_limit" >= 0`],
    ['project_budgets', 'chk_budgets_cost_limit', `"cost_limit" IS NULL OR "cost_limit" >= 0`],
    [
      'project_budgets',
      'chk_budgets_alert_threshold',
      `"alert_threshold_pct" > 0 AND "alert_threshold_pct" <= 100`,
    ],
    ['agent_runs', 'chk_agent_runs_tokens_used', `"tokens_used" >= 0`],
    ['agent_runs', 'chk_agent_runs_cost', `"cost" >= 0`],
    // 종료 시각은 시작 시각보다 앞설 수 없다.
    ['agent_runs', 'chk_agent_runs_time_order', `"ended_at" IS NULL OR "ended_at" >= "started_at"`],
    // 실행이 끝났으면 running일 수 없고, running이면 종료 시각이 없어야 한다.
    [
      'agent_runs',
      'chk_agent_runs_status_matches_ended_at',
      `("status" = 'running') = ("ended_at" IS NULL)`,
    ],
    [
      'sessions',
      'chk_sessions_revoked_after_created',
      `"revoked_at" IS NULL OR "revoked_at" >= "created_at"`,
    ],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, name, expression] of this.checks) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" CHECK (${expression})`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, name] of [...this.checks].reverse()) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${name}"`);
    }
  }
}
