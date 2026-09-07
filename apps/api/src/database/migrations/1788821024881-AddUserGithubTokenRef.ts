import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * USERS에 GitHub 액세스 토큰의 Secret Manager 참조를 추가한다.
 *
 * 웹훅 자동 등록(설계서 Part 4 §3)에 GitHub 토큰이 필요한데 ERD에 자리가 없었다.
 * 토큰 원문이 아니라 참조만 두는 것은 GIT_INTEGRATIONS.webhook_secret_ref와 같은 패턴이며
 * Part 2 §6.2의 "DB에 평문 저장 금지"에 따른 것이다.
 *
 * 주의: 이 파일은 손으로 작성했다. `migration:generate`가 만든 초안은 엔티티 메타데이터에
 * 없는 CHECK 제약 22개를 전부 DROP하려 했다(AddCheckConstraints에서 SQL로 직접 추가한 것들).
 * 생성된 SQL을 그대로 쓰면 승인 게이트를 지탱하는 제약이 조용히 사라진다.
 */
export class AddUserGithubTokenRef1788821024881 implements MigrationInterface {
  name = 'AddUserGithubTokenRef1788821024881';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "github_token_ref" character varying(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "github_token_ref"`);
  }
}
