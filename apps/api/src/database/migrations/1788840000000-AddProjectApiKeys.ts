import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PROJECT_API_KEYS — 외부 에이전트가 로그·실행이력을 밀어넣을 때 쓰는 프로젝트 스코프 키.
 *
 * key_hash 유니크는 설계서에 명시되지 않았지만 매 요청 조회 경로라 사실상 필수다.
 * 손으로 작성했다 — `migration:generate` 초안은 CHECK 제약을 전부 DROP하려 든다.
 */
export class AddProjectApiKeys1788840000000 implements MigrationInterface {
  name = 'AddProjectApiKeys1788840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "project_api_keys" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "key_hash" character varying(64) NOT NULL,
        "label" character varying(100) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_project_api_keys" PRIMARY KEY ("id"),
        CONSTRAINT "fk_project_api_keys_project" FOREIGN KEY ("project_id")
          REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_project_api_keys_hash" ON "project_api_keys" ("key_hash")`,
    );
    // 프로젝트별 목록 조회(최신순) 경로.
    await queryRunner.query(
      `CREATE INDEX "idx_project_api_keys_project_created" ON "project_api_keys" ("project_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "project_api_keys"`);
  }
}
