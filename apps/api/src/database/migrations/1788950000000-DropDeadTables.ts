import { MigrationInterface, QueryRunner } from 'typeorm';
import { BUILD_STATUSES } from '../entities/enums';

const STATUS_LIST = BUILD_STATUSES.map((s) => `'${s}'`).join(', ');

/**
 * 읽는 코드가 사라진 테이블 6개를 드롭한다.
 *
 * 각각이 언제 죽었는지:
 * - `env_templates` · `project_env_configs` · `policy_check_results` ·
 *   `env_config_transitions` — EnvCatalog 모듈 삭제 (PR #79)
 * - `documents` — DocStore 모듈과 GCS 연동 삭제 (PR #83)
 * - `project_budgets` — 예산 알림 체인과 `PUT /projects/:id/budget` 삭제 (PR #87)
 *
 * 세 번 모두 **코드만 지우고 테이블은 남겼다.** 되돌리기 비용이 마이그레이션까지 가면
 * 급격히 커지기 때문이었고, 그 판단 자체는 그때로서 옳았다. 이제 되살릴 계획이 없다는 것이
 * 분명해져서 정리한다.
 *
 * **드롭 순서는 FK를 따라간다** — 자식부터 지우지 않으면 참조 무결성 위반으로 실패한다.
 * `env_config_transitions`·`policy_check_results` → `project_env_configs` → `env_templates`.
 * `documents`·`project_budgets`는 `projects`만 참조하므로 순서에 영향받지 않는다.
 *
 * **down()은 스키마만 되살린다 — 데이터는 돌아오지 않는다.** 되돌리더라도 엔티티·서비스
 * 코드가 없으므로 빈 테이블일 뿐이다(1788930000000-DropProjectProgressSnapshots와 같다).
 * 데이터가 필요하면 드롭 전에 따로 받아 둬야 한다.
 */
export class DropDeadTables1788950000000 implements MigrationInterface {
  name = 'DropDeadTables1788950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "env_config_transitions"`);
    await queryRunner.query(`DROP TABLE "policy_check_results"`);
    await queryRunner.query(`DROP TABLE "project_env_configs"`);
    await queryRunner.query(`DROP TABLE "env_templates"`);
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(`DROP TABLE "project_budgets"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 만드는 순서는 드롭의 역순이다 — 부모가 있어야 자식이 FK를 건다.
    await queryRunner.query(`
      CREATE TABLE "project_budgets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "token_limit" bigint,
        "cost_limit" numeric(12,4),
        "alert_threshold_pct" numeric(5,2) NOT NULL DEFAULT '80',
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "REL_fa8f2a72a3c21da4d55045ca7c" UNIQUE ("project_id"),
        CONSTRAINT "PK_b3eae5bf0f13c967da41770b8fc" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "project_budgets" ADD CONSTRAINT "FK_fa8f2a72a3c21da4d55045ca7ca"
      FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `ALTER TABLE "project_budgets" ADD CONSTRAINT "chk_budgets_token_limit" CHECK ("token_limit" IS NULL OR "token_limit" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_budgets" ADD CONSTRAINT "chk_budgets_cost_limit" CHECK ("cost_limit" IS NULL OR "cost_limit" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_budgets" ADD CONSTRAINT "chk_budgets_alert_threshold" CHECK ("alert_threshold_pct" > 0 AND "alert_threshold_pct" <= 100)`,
    );

    await queryRunner.query(`
      CREATE TABLE "documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "title" character varying(300) NOT NULL,
        "type" character varying(20) NOT NULL DEFAULT 'other',
        "file_url" character varying(1000),
        "commit_ref" character varying(40),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "upload_status" character varying(20) NOT NULL DEFAULT 'pending',
        CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_documents_project_created" ON "documents" ("project_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_documents_upload_status_created" ON "documents" ("upload_status", "created_at")`,
    );
    await queryRunner.query(`
      ALTER TABLE "documents" ADD CONSTRAINT "FK_e156b298c20873e14c362e789bf"
      FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "chk_documents_type" CHECK ("type" IN ('prd','srs','tech_spec','other'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "chk_documents_upload_status" CHECK ("upload_status" IN ('pending', 'completed'))`,
    );

    await queryRunner.query(`
      CREATE TABLE "env_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "owner_id" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "stack_preset" jsonb NOT NULL,
        "docker_preset" jsonb NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_4109cc0f740123d4d0399fa2b7e" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_env_templates_owner" ON "env_templates" ("owner_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "env_templates" ADD CONSTRAINT "FK_54f5427207d75bc4f4268cd79b8"
      FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "project_env_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "template_id" uuid,
        "stack_config" jsonb NOT NULL,
        "docker_config" jsonb NOT NULL,
        "build_status" character varying(20) NOT NULL DEFAULT 'generated',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_6b02b1bb86c14355e261e85f27b" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_env_configs_project_created" ON "project_env_configs" ("project_id", "created_at")`,
    );
    await queryRunner.query(`
      ALTER TABLE "project_env_configs" ADD CONSTRAINT "FK_e57de854ee6daea14bbf51ca94c"
      FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "project_env_configs" ADD CONSTRAINT "FK_afcdc8e5744dce948f4e5117267"
      FOREIGN KEY ("template_id") REFERENCES "env_templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `ALTER TABLE "project_env_configs" ADD CONSTRAINT "chk_env_configs_build_status" CHECK ("build_status" IN (${STATUS_LIST}))`,
    );

    await queryRunner.query(`
      CREATE TABLE "policy_check_results" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "env_config_id" uuid NOT NULL,
        "tool" character varying(20) NOT NULL,
        "verdict" character varying(10) NOT NULL,
        "risk_notes" text,
        "checked_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_268e6cf273c4876b88e7dab62e6" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_policy_results_config" ON "policy_check_results" ("env_config_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "policy_check_results" ADD CONSTRAINT "FK_0f405a169d9ca09d86e45724b6e"
      FOREIGN KEY ("env_config_id") REFERENCES "project_env_configs"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `ALTER TABLE "policy_check_results" ADD CONSTRAINT "chk_policy_results_tool" CHECK ("tool" IN ('trivy','conftest'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "policy_check_results" ADD CONSTRAINT "chk_policy_results_verdict" CHECK ("verdict" IN ('pass','fail'))`,
    );

    await queryRunner.query(`
      CREATE TABLE "env_config_transitions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "env_config_id" uuid NOT NULL,
        "from_status" character varying(20),
        "to_status" character varying(20) NOT NULL,
        "actor_user_id" uuid,
        "reason" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_env_config_transitions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "env_config_transitions" ADD CONSTRAINT "fk_env_config_transitions_config"
      FOREIGN KEY ("env_config_id") REFERENCES "project_env_configs"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "env_config_transitions" ADD CONSTRAINT "fk_env_config_transitions_actor"
      FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "env_config_transitions" ADD CONSTRAINT "chk_env_config_transitions_to_status" CHECK ("to_status" IN (${STATUS_LIST}))`,
    );
    await queryRunner.query(
      `ALTER TABLE "env_config_transitions" ADD CONSTRAINT "chk_env_config_transitions_from_status" CHECK ("from_status" IS NULL OR "from_status" IN (${STATUS_LIST}))`,
    );
    await queryRunner.query(
      `ALTER TABLE "env_config_transitions" ADD CONSTRAINT "chk_env_config_transitions_changed" CHECK ("from_status" IS NULL OR "from_status" <> "to_status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_env_config_transitions_config_at" ON "env_config_transitions" ("env_config_id", "created_at")`,
    );
  }
}
