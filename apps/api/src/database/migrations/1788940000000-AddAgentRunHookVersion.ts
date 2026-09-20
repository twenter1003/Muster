import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AGENT_RUNS에 hook_version 추가 — 훅(scripts/*-hooks/report-agent-usage.mjs)을 고쳐도
 * 이미 설치된 머신은 갱신되지 않는다는 게 이번 세션에서 드러났다(이 컴퓨터의 훅이 218줄
 * 뒤처져 model·토큰 필드를 아예 안 보내고 있었다). 훅이 자기 버전을 같이 보고하게 하고,
 * 프로젝트의 최근 실행이 최신 버전보다 낮으면 화면에 "이 머신 훅이 오래됨" 배너를 띄운다.
 *
 * 기존 행은 버전을 알 수 없으므로 nullable — null은 "모름"이지 "낡음"이 아니다.
 */
export class AddAgentRunHookVersion1788940000000 implements MigrationInterface {
  name = 'AddAgentRunHookVersion1788940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agent_runs" ADD COLUMN "hook_version" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agent_runs" DROP COLUMN "hook_version"`);
  }
}
