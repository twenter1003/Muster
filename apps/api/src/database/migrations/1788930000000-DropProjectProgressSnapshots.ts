import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PROJECT_PROGRESS_SNAPSHOTS 드롭 — AI 자동 진행률 판정(analyzeProgress) 제거로
 * 이 테이블을 읽고 쓰는 코드가 완전히 사라졌다(ProjectGoalsService, 커밋 9f7b595).
 *
 * down()은 1788900000000-AddProjectGoals의 원본 CREATE TABLE을 그대로 복원한다 —
 * 되돌리더라도 엔티티/서비스 코드가 없으면 빈 테이블일 뿐이라는 점에 주의.
 */
export class DropProjectProgressSnapshots1788930000000 implements MigrationInterface {
  name = 'DropProjectProgressSnapshots1788930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "project_progress_snapshots"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
}
