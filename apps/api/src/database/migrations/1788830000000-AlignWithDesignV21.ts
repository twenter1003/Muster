import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 통합설계서 v2.1과 스키마를 정렬한다.
 *
 * 1. current_stage에 design/operation 추가 (4개 → 6개)
 * 2. agent_runs.status에 cancelled 추가
 * 3. audit_logs.action을 닫힌 값 집합으로 강제
 * 4. health_snapshots 지표 점수를 nullable로 — Part 2 §6.4가 "데이터가 부족한 지표는
 *    점수 산정에서 제외하고 남은 지표만으로 평균한다"고 정했는데, NOT NULL이면 그 규칙을
 *    표현할 수 없다. CHECK(BETWEEN 1 AND 4)는 NULL을 통과시키므로 그대로 둔다.
 * 5. webhook_deliveries에 project_id / event_type 추가
 *
 * 손으로 작성했다 — `migration:generate` 초안은 CHECK 제약을 전부 DROP하려 든다.
 */
export class AlignWithDesignV211788830000000 implements MigrationInterface {
  name = 'AlignWithDesignV211788830000000';

  private readonly STAGES_NEW = `'planning','design','development','testing','deployment','operation'`;
  private readonly STAGES_OLD = `'planning','development','testing','deployment'`;

  private readonly AUDIT_ACTIONS = [
    'login',
    'logout',
    'project.create',
    'project.update',
    'project.delete',
    'document.create',
    'document.delete',
    'agent.create',
    'agent.update',
    'agent.delete',
    'env_config.create',
    'env_config.approve',
    'env_config.reject',
    'template.create',
    'template.delete',
    'budget.update',
    'api_key.create',
    'api_key.revoke',
  ]
    .map((a) => `'${a}'`)
    .join(',');

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 진행 단계 6개
    await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "chk_projects_current_stage"`);
    await queryRunner.query(
      `ALTER TABLE "projects" ADD CONSTRAINT "chk_projects_current_stage" CHECK ("current_stage" IN (${this.STAGES_NEW}))`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_stage_history" DROP CONSTRAINT "chk_stage_history_stage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_stage_history" ADD CONSTRAINT "chk_stage_history_stage" CHECK ("stage" IN (${this.STAGES_NEW}))`,
    );

    // 2. 실행 상태에 cancelled
    await queryRunner.query(`ALTER TABLE "agent_runs" DROP CONSTRAINT "chk_agent_runs_status"`);
    await queryRunner.query(
      `ALTER TABLE "agent_runs" ADD CONSTRAINT "chk_agent_runs_status" CHECK ("status" IN ('running','succeeded','failed','cancelled'))`,
    );

    // 3. 감사 액션을 닫힌 집합으로
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "chk_audit_logs_action" CHECK ("action" IN (${this.AUDIT_ACTIONS}))`,
    );

    // 4. 헬스 지표 점수 nullable
    for (const col of ['deploy_freq_score', 'lead_time_score', 'change_fail_score', 'mttr_score']) {
      await queryRunner.query(`ALTER TABLE "health_snapshots" ALTER COLUMN "${col}" DROP NOT NULL`);
    }

    // 5. 웹훅 배달 기록에 프로젝트/이벤트 종류
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" ADD COLUMN "project_id" uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" ADD COLUMN "event_type" character varying(50) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "fk_webhook_deliveries_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "fk_webhook_deliveries_project"`,
    );
    await queryRunner.query(`ALTER TABLE "webhook_deliveries" DROP COLUMN "event_type"`);
    await queryRunner.query(`ALTER TABLE "webhook_deliveries" DROP COLUMN "project_id"`);

    for (const col of ['deploy_freq_score', 'lead_time_score', 'change_fail_score', 'mttr_score']) {
      await queryRunner.query(`ALTER TABLE "health_snapshots" ALTER COLUMN "${col}" SET NOT NULL`);
    }

    await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT "chk_audit_logs_action"`);

    await queryRunner.query(`ALTER TABLE "agent_runs" DROP CONSTRAINT "chk_agent_runs_status"`);
    await queryRunner.query(
      `ALTER TABLE "agent_runs" ADD CONSTRAINT "chk_agent_runs_status" CHECK ("status" IN ('running','succeeded','failed'))`,
    );

    await queryRunner.query(
      `ALTER TABLE "project_stage_history" DROP CONSTRAINT "chk_stage_history_stage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_stage_history" ADD CONSTRAINT "chk_stage_history_stage" CHECK ("stage" IN (${this.STAGES_OLD}))`,
    );
    await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "chk_projects_current_stage"`);
    await queryRunner.query(
      `ALTER TABLE "projects" ADD CONSTRAINT "chk_projects_current_stage" CHECK ("current_stage" IN (${this.STAGES_OLD}))`,
    );
  }
}
