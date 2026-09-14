import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PROJECT_GOALS + PROJECT_PROGRESS_SNAPSHOTS — 목표/요구사항 기반 진행률 기능.
 *
 * PROJECT_GOALS는 프로젝트당 1행이라 project_id에 UNIQUE를 건다. content_md가
 * nullable인 이유는 엔티티 주석 참조 — 아직 확정한 적이 없다는 뜻을 표현한다.
 *
 * PROJECT_PROGRESS_SNAPSHOTS는 HEALTH_SNAPSHOTS와 같은 insert-only 이력이다.
 */
export class AddProjectGoals1788900000000 implements MigrationInterface {
  name = 'AddProjectGoals1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "project_goals" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL,
        "content_md" text,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_project_goals" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "project_goals"
      ADD CONSTRAINT "fk_project_goals_project"
      FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_project_goals_project" ON "project_goals" ("project_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "project_progress_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL,
        "percent" smallint NOT NULL,
        "summary" text NOT NULL,
        "remaining_items" jsonb NOT NULL,
        "based_on_commit_sha" character varying(40),
        "analyzed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_project_progress_snapshots" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "project_progress_snapshots"
      ADD CONSTRAINT "fk_project_progress_snapshots_project"
      FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_project_progress_project_analyzed"
      ON "project_progress_snapshots" ("project_id", "analyzed_at")
    `);
    await queryRunner.query(`
      ALTER TABLE "project_progress_snapshots"
      ADD CONSTRAINT "chk_project_progress_percent_range"
      CHECK ("percent" BETWEEN 0 AND 100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "project_progress_snapshots"`);
    await queryRunner.query(`DROP TABLE "project_goals"`);
  }
}
