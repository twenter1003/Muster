import { MigrationInterface, QueryRunner } from 'typeorm';
import { BUILD_STATUSES } from '../entities/enums';

const STATUS_LIST = BUILD_STATUSES.map((s) => `'${s}'`).join(', ');

/**
 * ENV_CONFIG_TRANSITIONS — 환경 구성의 상태 전이 이력.
 *
 * 설계서 ERD에 없는 테이블이다. build_status 단일 컬럼으로는 지나온 길을 복원할 수 없고
 * (자세한 이유는 엔티티 주석) 화면이 그것을 역산하며 모든 단계에 생성 시각을 찍고 있었다.
 *
 * **기존 구성에 과거 이력을 만들어 넣지 않는다.** 만들어 넣으려면 시각과 행위자를 지어내야
 * 하고, 그 순간 이 테이블은 감사 자료로서의 가치를 잃는다. 대신 현재 상태로 오게 된 마지막
 * 전이 한 줄만 넣는다 — from_status는 모르므로 null이고, actor도 모르므로 null이다.
 * 이 마이그레이션이 만든 줄인지는 reason으로 구분된다.
 */
export class AddEnvConfigTransitions1788880000000 implements MigrationInterface {
  name = 'AddEnvConfigTransitions1788880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      ALTER TABLE "env_config_transitions"
      ADD CONSTRAINT "fk_env_config_transitions_config"
      FOREIGN KEY ("env_config_id") REFERENCES "project_env_configs"("id") ON DELETE CASCADE
    `);
    // 사용자가 지워져도 이력은 남아야 한다. 행이 사라지면 "승인 기록이 없는 승인된 구성"이 된다.
    await queryRunner.query(`
      ALTER TABLE "env_config_transitions"
      ADD CONSTRAINT "fk_env_config_transitions_actor"
      FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "env_config_transitions"
      ADD CONSTRAINT "chk_env_config_transitions_to_status"
      CHECK ("to_status" IN (${STATUS_LIST}))
    `);
    await queryRunner.query(`
      ALTER TABLE "env_config_transitions"
      ADD CONSTRAINT "chk_env_config_transitions_from_status"
      CHECK ("from_status" IS NULL OR "from_status" IN (${STATUS_LIST}))
    `);
    // 제자리 전이는 전이가 아니다. 들어오면 그건 기록 버그이지 이력이 아니다.
    await queryRunner.query(`
      ALTER TABLE "env_config_transitions"
      ADD CONSTRAINT "chk_env_config_transitions_changed"
      CHECK ("from_status" IS NULL OR "from_status" <> "to_status")
    `);

    // 화면의 질의는 항상 "구성 하나의 이력을 시간순으로"다.
    await queryRunner.query(`
      CREATE INDEX "idx_env_config_transitions_config_at"
      ON "env_config_transitions" ("env_config_id", "created_at")
    `);

    // 기존 구성의 현재 상태를 한 줄로 남긴다. 지어낼 수 없는 것(직전 상태·행위자)은 null이고,
    // created_at은 구성 생성 시각을 쓴다 — 전이 시각은 기록된 적이 없다.
    await queryRunner.query(`
      INSERT INTO "env_config_transitions"
        ("env_config_id", "from_status", "to_status", "actor_user_id", "reason", "created_at")
      SELECT "id", NULL, "build_status", NULL,
             '이력 기능 도입 전에 만들어진 구성입니다. 직전 상태와 행위자는 기록되지 않았습니다.',
             "created_at"
      FROM "project_env_configs"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "env_config_transitions"`);
  }
}
