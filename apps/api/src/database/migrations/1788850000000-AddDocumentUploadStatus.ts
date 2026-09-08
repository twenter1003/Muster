import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DOCUMENTS.upload_status — 설계서 Part 3 ERD(481행)에 있으나 초기 스키마에서 누락됐다.
 * enums.ts에는 값만 정의돼 있고 컬럼이 실재하지 않았다.
 *
 * 업로드는 3단계다(설계서 Part 4 §4): 메타데이터 생성(pending) → 클라이언트가 signed URL로
 * GCS에 직접 업로드 → 완료 확인(completed). 완료 확인이 없으면 메타데이터만 남은 레코드가
 * 조회 시 깨진 링크가 된다.
 *
 * 기존 행은 completed로 채운다 — pending 개념이 없던 시절에 만들어진 것이라
 * 정리 배치가 지워버리면 안 된다.
 */
export class AddDocumentUploadStatus1788850000000 implements MigrationInterface {
  name = 'AddDocumentUploadStatus1788850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "documents" ADD "upload_status" character varying(20) NOT NULL DEFAULT 'completed'`,
    );
    // 새로 만들어지는 문서의 기본값은 pending이다. 위 DEFAULT는 기존 행을 채우기 위한 것이라
    // 채운 뒤 바꾼다 — 그렇지 않으면 INSERT에서 status를 빠뜨렸을 때 조용히 completed가 된다.
    await queryRunner.query(`ALTER TABLE "documents" ALTER COLUMN "upload_status" SET DEFAULT 'pending'`);
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "chk_documents_upload_status"
       CHECK ("upload_status" IN ('pending', 'completed'))`,
    );
    // pending 정리 배치(24시간 경과분 삭제)가 훑는 경로.
    await queryRunner.query(
      `CREATE INDEX "idx_documents_upload_status_created" ON "documents" ("upload_status", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_documents_upload_status_created"`);
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "chk_documents_upload_status"`,
    );
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "upload_status"`);
  }
}
