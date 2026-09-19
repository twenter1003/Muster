import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AGENT_RUNS에 토큰 내역 4종 추가 — 합계만으로는 비용을 맞게 낼 수 없다.
 *
 * 캐시 읽기는 정규 입력가의 10% 안팎, 캐시 쓰기는 25% 비싸다(LLM_ECOSYSTEM_GUIDE 2장).
 * 합쳐서 정규가로 곱하고 있었기 때문에, 캐싱이 잘 들을수록 표시 비용이 실제와 벌어졌다.
 *
 * 기존 행은 내역을 알 수 없으므로 nullable로 둔다 — 0으로 채우면 "캐시를 안 썼다"는
 * 거짓말이 되고, 나중에 집계가 그 0을 사실로 취급한다.
 */
export class AddAgentRunTokenBreakdown1788920000000 implements MigrationInterface {
  name = 'AddAgentRunTokenBreakdown1788920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agent_runs" ADD COLUMN "input_tokens" integer`);
    await queryRunner.query(`ALTER TABLE "agent_runs" ADD COLUMN "output_tokens" integer`);
    await queryRunner.query(`ALTER TABLE "agent_runs" ADD COLUMN "cache_read_tokens" integer`);
    await queryRunner.query(`ALTER TABLE "agent_runs" ADD COLUMN "cache_write_tokens" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agent_runs" DROP COLUMN "cache_write_tokens"`);
    await queryRunner.query(`ALTER TABLE "agent_runs" DROP COLUMN "cache_read_tokens"`);
    await queryRunner.query(`ALTER TABLE "agent_runs" DROP COLUMN "output_tokens"`);
    await queryRunner.query(`ALTER TABLE "agent_runs" DROP COLUMN "input_tokens"`);
  }
}
