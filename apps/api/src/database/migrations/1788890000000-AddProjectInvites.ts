import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PROJECT_INVITES — 프로젝트 초대 링크.
 *
 * 설계서 ERD에 없는 테이블이다. 멤버 목록은 볼 수 있었지만 늘릴 방법이 없어, 배포해도
 * 초대받은 사람이 빈 앱을 보게 되는 상태였다.
 *
 * role 컬럼이 없는 이유와 expires_at이 NOT NULL인 이유는 엔티티 주석에 적었다.
 */
export class AddProjectInvites1788890000000 implements MigrationInterface {
  name = 'AddProjectInvites1788890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "project_invites" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "created_by" uuid,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "accepted_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_project_invites" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "project_invites"
      ADD CONSTRAINT "fk_project_invites_project"
      FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    // 만든 사람이 지워져도 링크 기록은 남는다 — 누가 불렀는지를 잃으면 감사 자료가 못 된다.
    await queryRunner.query(`
      ALTER TABLE "project_invites"
      ADD CONSTRAINT "fk_project_invites_creator"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // 매 수락마다 조회되는 경로다.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_project_invites_token_hash" ON "project_invites" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_project_invites_project" ON "project_invites" ("project_id")`,
    );

    // 음수 사용 횟수는 기록 버그이지 데이터가 아니다.
    await queryRunner.query(`
      ALTER TABLE "project_invites"
      ADD CONSTRAINT "chk_project_invites_accepted_count"
      CHECK ("accepted_count" >= 0)
    `);
    // 만든 시각보다 먼저 끝나는 링크는 만들어질 수 없다.
    await queryRunner.query(`
      ALTER TABLE "project_invites"
      ADD CONSTRAINT "chk_project_invites_expiry_after_creation"
      CHECK ("expires_at" > "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "project_invites"`);
  }
}
