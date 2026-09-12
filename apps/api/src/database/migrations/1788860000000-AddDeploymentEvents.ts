import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DEPLOYMENT_EVENTS — DORA 4지표(Part 2 §6.4)의 입력 데이터.
 *
 * 설계서 Part 3(240행)에 신설로 명시돼 있는데 엔티티도 마이그레이션도 없어 Phase 6에서 만든다.
 * 헬스 스코어보다 먼저 만들어야 하는 이유는 단순하다 — 이 테이블이 없으면 계산할 입력이 없다.
 *
 * 손으로 작성했다 — `migration:generate` 초안은 기존 CHECK 제약을 전부 DROP하려 든다.
 */
export class AddDeploymentEvents1788860000000 implements MigrationInterface {
  name = 'AddDeploymentEvents1788860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "deployment_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "kind" character varying(20) NOT NULL,
        "status" character varying(10) NOT NULL,
        "commit_sha" character varying(40) NOT NULL,
        "committed_at" TIMESTAMP WITH TIME ZONE,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_deployment_events" PRIMARY KEY ("id"),
        CONSTRAINT "fk_deployment_events_project" FOREIGN KEY ("project_id")
          REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_deployment_events_kind"
          CHECK ("kind" IN ('deployment','workflow_run')),
        CONSTRAINT "chk_deployment_events_status"
          CHECK ("status" IN ('success','failure')),
        -- 커밋보다 먼저 끝난 배포는 없다. 리드타임이 음수로 나오면 중앙값이 조용히 망가지므로
        -- 계산이 아니라 저장 시점에 막는다.
        CONSTRAINT "chk_deployment_events_time_order"
          CHECK ("committed_at" IS NULL OR "occurred_at" >= "committed_at")
      )
    `);

    // DORA 집계(기간별 스캔)와 GET /projects/:id/deployment-events(최신순 페이지네이션)가
    // 같은 인덱스를 쓴다.
    await queryRunner.query(
      `CREATE INDEX "idx_deployment_events_project_occurred" ON "deployment_events" ("project_id", "occurred_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "deployment_events"`);
  }
}
