import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1788781319760 implements MigrationInterface {
  name = 'InitialSchema1788781319760';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TypeORM은 uuid_generate_v4()를 쓰기 위해 이 확장을 마이그레이션 밖에서 암묵적으로 만든다.
    // 권한이 제한된 롤로 배포하면 그 시점에 알 수 없는 실패가 나므로, 스키마의 전제로 명시해 둔다.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_abaa9e068cdd390bc5210f7988" ON "sessions"  ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "env_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_id" uuid NOT NULL, "name" character varying(200) NOT NULL, "stack_preset" jsonb NOT NULL, "docker_preset" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4109cc0f740123d4d0399fa2b7e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_env_templates_owner" ON "env_templates"  ("owner_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "git_integrations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "repo_url" character varying(500) NOT NULL, "webhook_secret_ref" character varying(500) NOT NULL, "connected_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_3f9ae1aafd76abf1eb8122e31d" UNIQUE ("project_id"), CONSTRAINT "PK_2897e439c9917187247def89be4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "project_budgets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "token_limit" bigint, "cost_limit" numeric(12,4), "alert_threshold_pct" numeric(5,2) NOT NULL DEFAULT '80', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_fa8f2a72a3c21da4d55045ca7c" UNIQUE ("project_id"), CONSTRAINT "PK_b3eae5bf0f13c967da41770b8fc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(200) NOT NULL, "current_stage" character varying(20) NOT NULL DEFAULT 'planning', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_11b52372ea51f9159efe2402d9" ON "projects"  ("deleted_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "project_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" character varying(20) NOT NULL DEFAULT 'member', "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_project_members_project_user" UNIQUE ("project_id", "user_id"), CONSTRAINT "PK_0b2f46f804be4aea9234c78bcc9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "project_id" uuid, "action" character varying(100) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_project_created" ON "audit_logs"  ("project_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_user_created" ON "audit_logs"  ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(320), "github_login" character varying(39) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e9d37b5515a67734b488e09bdc" ON "users"  ("github_login") `,
    );
    await queryRunner.query(
      `CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "title" character varying(300) NOT NULL, "type" character varying(20) NOT NULL DEFAULT 'other', "file_url" character varying(1000), "commit_ref" character varying(40), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_documents_project_created" ON "documents"  ("project_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "policy_check_results" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "env_config_id" uuid NOT NULL, "tool" character varying(20) NOT NULL, "verdict" character varying(10) NOT NULL, "risk_notes" text, "checked_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_268e6cf273c4876b88e7dab62e6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_policy_results_config" ON "policy_check_results"  ("env_config_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "project_env_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "template_id" uuid, "stack_config" jsonb NOT NULL, "docker_config" jsonb NOT NULL, "build_status" character varying(20) NOT NULL DEFAULT 'generated', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6b02b1bb86c14355e261e85f27b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_env_configs_project_created" ON "project_env_configs"  ("project_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "agent_id" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'running', "tokens_used" integer NOT NULL DEFAULT '0', "cost" numeric(12,4) NOT NULL DEFAULT '0', "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ended_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_442f7e0ec4ae860cf17edc57825" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_agent_runs_agent_started" ON "agent_runs"  ("agent_id", "started_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "name" character varying(200) NOT NULL, "config_md" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9c653f28ae19c5884d5baf6a1d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_agents_project" ON "agents"  ("project_id") `);
    await queryRunner.query(
      `CREATE TABLE "log_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "agent_id" uuid, "level" character varying(10) NOT NULL, "message" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b226cc4051321f12106771581e0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_log_entries_project_level_created" ON "log_entries"  ("project_id", "level", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_log_entries_project_created" ON "log_entries"  ("project_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "project_stage_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "stage" character varying(20) NOT NULL, "entered_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_23530a5f6ff238caaa015a2ae0a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_stage_history_project_entered" ON "project_stage_history"  ("project_id", "entered_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "health_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "deploy_freq_score" smallint NOT NULL, "lead_time_score" smallint NOT NULL, "change_fail_score" smallint NOT NULL, "mttr_score" smallint NOT NULL, "composite_score" numeric(3,2) NOT NULL, "measured_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b7f78a6e483311136e4c445a45b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_health_snapshots_project_measured" ON "health_snapshots"  ("project_id", "measured_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "webhook_deliveries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "delivery_id" character varying(100) NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_6c1db1ec505a69c927e3c4dcee4" UNIQUE ("delivery_id"), CONSTRAINT "PK_535dd409947fb6d8fc6dfc0112a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_webhook_deliveries_received" ON "webhook_deliveries"  ("received_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "env_templates" ADD CONSTRAINT "FK_54f5427207d75bc4f4268cd79b8" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "git_integrations" ADD CONSTRAINT "FK_3f9ae1aafd76abf1eb8122e31d1" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_budgets" ADD CONSTRAINT "FK_fa8f2a72a3c21da4d55045ca7ca" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_members" ADD CONSTRAINT "FK_b5729113570c20c7e214cf3f58d" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_members" ADD CONSTRAINT "FK_e89aae80e010c2faa72e6a49ce8" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_bd2726fd31b35443f2245b93ba0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_5e124016d61fe935a7f10ac3fa5" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_e156b298c20873e14c362e789bf" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "policy_check_results" ADD CONSTRAINT "FK_0f405a169d9ca09d86e45724b6e" FOREIGN KEY ("env_config_id") REFERENCES "project_env_configs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_env_configs" ADD CONSTRAINT "FK_e57de854ee6daea14bbf51ca94c" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_env_configs" ADD CONSTRAINT "FK_afcdc8e5744dce948f4e5117267" FOREIGN KEY ("template_id") REFERENCES "env_templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_runs" ADD CONSTRAINT "FK_b7e54bda53308d1c35f163440b7" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "agents" ADD CONSTRAINT "FK_90f24a22f7af11b155cd4752e65" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "log_entries" ADD CONSTRAINT "FK_6ffd129226d95b5f80a195286fb" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "log_entries" ADD CONSTRAINT "FK_a3665080f784476676320f8f3e2" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_stage_history" ADD CONSTRAINT "FK_2e0eac427a6d6cb0263f5abd771" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "health_snapshots" ADD CONSTRAINT "FK_4092d95276042b2855ebadaac3b" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "health_snapshots" DROP CONSTRAINT "FK_4092d95276042b2855ebadaac3b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_stage_history" DROP CONSTRAINT "FK_2e0eac427a6d6cb0263f5abd771"`,
    );
    await queryRunner.query(
      `ALTER TABLE "log_entries" DROP CONSTRAINT "FK_a3665080f784476676320f8f3e2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "log_entries" DROP CONSTRAINT "FK_6ffd129226d95b5f80a195286fb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agents" DROP CONSTRAINT "FK_90f24a22f7af11b155cd4752e65"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_runs" DROP CONSTRAINT "FK_b7e54bda53308d1c35f163440b7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_env_configs" DROP CONSTRAINT "FK_afcdc8e5744dce948f4e5117267"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_env_configs" DROP CONSTRAINT "FK_e57de854ee6daea14bbf51ca94c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "policy_check_results" DROP CONSTRAINT "FK_0f405a169d9ca09d86e45724b6e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_e156b298c20873e14c362e789bf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_5e124016d61fe935a7f10ac3fa5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_bd2726fd31b35443f2245b93ba0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_members" DROP CONSTRAINT "FK_e89aae80e010c2faa72e6a49ce8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_members" DROP CONSTRAINT "FK_b5729113570c20c7e214cf3f58d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_budgets" DROP CONSTRAINT "FK_fa8f2a72a3c21da4d55045ca7ca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "git_integrations" DROP CONSTRAINT "FK_3f9ae1aafd76abf1eb8122e31d1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "env_templates" DROP CONSTRAINT "FK_54f5427207d75bc4f4268cd79b8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_webhook_deliveries_received"`);
    await queryRunner.query(`DROP TABLE "webhook_deliveries"`);
    await queryRunner.query(`DROP INDEX "public"."idx_health_snapshots_project_measured"`);
    await queryRunner.query(`DROP TABLE "health_snapshots"`);
    await queryRunner.query(`DROP INDEX "public"."idx_stage_history_project_entered"`);
    await queryRunner.query(`DROP TABLE "project_stage_history"`);
    await queryRunner.query(`DROP INDEX "public"."idx_log_entries_project_created"`);
    await queryRunner.query(`DROP INDEX "public"."idx_log_entries_project_level_created"`);
    await queryRunner.query(`DROP TABLE "log_entries"`);
    await queryRunner.query(`DROP INDEX "public"."idx_agents_project"`);
    await queryRunner.query(`DROP TABLE "agents"`);
    await queryRunner.query(`DROP INDEX "public"."idx_agent_runs_agent_started"`);
    await queryRunner.query(`DROP TABLE "agent_runs"`);
    await queryRunner.query(`DROP INDEX "public"."idx_env_configs_project_created"`);
    await queryRunner.query(`DROP TABLE "project_env_configs"`);
    await queryRunner.query(`DROP INDEX "public"."idx_policy_results_config"`);
    await queryRunner.query(`DROP TABLE "policy_check_results"`);
    await queryRunner.query(`DROP INDEX "public"."idx_documents_project_created"`);
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e9d37b5515a67734b488e09bdc"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_user_created"`);
    await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_project_created"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "project_members"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_11b52372ea51f9159efe2402d9"`);
    await queryRunner.query(`DROP TABLE "projects"`);
    await queryRunner.query(`DROP TABLE "project_budgets"`);
    await queryRunner.query(`DROP TABLE "git_integrations"`);
    await queryRunner.query(`DROP INDEX "public"."idx_env_templates_owner"`);
    await queryRunner.query(`DROP TABLE "env_templates"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_abaa9e068cdd390bc5210f7988"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
  }
}
