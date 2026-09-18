import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AGENT_RUNS.model — 실제 사용된 LLM 모델명(claude-3-5-sonnet, gemini-2.5-flash 등) 영속화.
 */
export class AddAgentRunModel1788910000000 implements MigrationInterface {
  name = 'AddAgentRunModel1788910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agent_runs" ADD COLUMN "model" character varying(100)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agent_runs" DROP COLUMN "model"`);
  }
}
