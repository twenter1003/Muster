import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * GIT_INTEGRATIONS에 GitHub 웹훅 id를 추가한다.
 *
 * 연동 해제(설계서 Part 4 §3의 `DELETE /projects/:id/git-integration`)는
 * GitHub의 `DELETE /repos/{owner}/{repo}/hooks/{hook_id}`를 호출해야 하는데
 * hook_id를 보관할 곳이 ERD에 없었다. 이게 없으면 해제해도 GitHub에 웹훅이 남는다.
 *
 * 손으로 작성했다 — `migration:generate` 초안은 CHECK 제약 22개를 DROP하려 든다.
 */
export class AddGitIntegrationWebhookId1788825000000 implements MigrationInterface {
  name = 'AddGitIntegrationWebhookId1788825000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "git_integrations" ADD COLUMN "webhook_id" bigint`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "git_integrations" DROP COLUMN "webhook_id"`);
  }
}
