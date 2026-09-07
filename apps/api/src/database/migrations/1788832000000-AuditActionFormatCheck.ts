import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * audit_logs.action의 열거형 CHECK를 형식 CHECK로 교체한다.
 *
 * 설계서 v2.1은 18개 닫힌 집합을 제시했지만, 그 목록에 이미 구현된 엔드포인트의 액션
 * (git_integration.create/delete, document.update, env_config.execute)이 빠져 있었다.
 * 열거형을 DB에 박아 두면 감사 기록 쓰기가 CHECK 위반으로 실패하고, 감사 로그가 실패해서
 * 본 작업까지 롤백되는 건 감사 추적의 목적과 정반대다.
 *
 * 정확한 값 집합은 entities/enums.ts의 AUDIT_ACTIONS 유니온 타입이 컴파일 타임에 강제하고,
 * DB는 쓰레기 값만 막는다. 새 감사 대상이 생겨도 마이그레이션이 필요 없다.
 */
export class AuditActionFormatCheck1788832000000 implements MigrationInterface {
  name = 'AuditActionFormatCheck1788832000000';

  /** `<리소스>` 또는 `<리소스>.<동작>`. 소문자·숫자·밑줄만. */
  private readonly FORMAT = `"action" ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)?$'`;

  private readonly OLD_ACTIONS = [
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
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT "chk_audit_logs_action"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "chk_audit_logs_action" CHECK (${this.FORMAT})`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT "chk_audit_logs_action"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "chk_audit_logs_action" CHECK ("action" IN (${this.OLD_ACTIONS}))`,
    );
  }
}
