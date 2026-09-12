import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PROJECT_API_KEYS.key_suffix — 발급된 키의 마지막 4자.
 *
 * 설정 화면이 목업의 `muster_••••4f2a` 표기를 만들 수 없었다. 원문은 해시만 남기므로
 * 재구성할 방법이 없고, label만으로는 같은 이름의 키 둘을 구분하지 못한다.
 *
 * **말미 4자를 저장하는 것이 안전한가**: 키 원문은 `muster_` + 24바이트 base64url(32자)이다.
 * 말미 4자가 새어도 남은 28자(≈168비트)를 추측해야 하고, 그건 키 전체를 추측하는 것과
 * 실질적으로 같다. 반대로 이 4자가 없으면 사용자가 "어느 키를 폐기할지"를 label의 오타에
 * 기대어 정해야 한다 — 잘못된 키를 폐기하는 사고가 유출보다 현실적인 위험이다.
 *
 * nullable인 이유: 기존 행은 채울 수 없다(원문이 없다). 화면은 null을 `muster_••••`로
 * 표시한다. NOT NULL + 더미값으로 채우면 그 더미가 실제 말미처럼 읽힌다.
 */
export class AddApiKeySuffix1788870000000 implements MigrationInterface {
  name = 'AddApiKeySuffix1788870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "project_api_keys" ADD "key_suffix" character varying(4)`);
    // 길이를 강제한다. 4자가 아닌 값이 들어오면 그건 말미가 아니라 다른 것이다.
    await queryRunner.query(
      `ALTER TABLE "project_api_keys" ADD CONSTRAINT "chk_project_api_keys_key_suffix"
       CHECK ("key_suffix" IS NULL OR length("key_suffix") = 4)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_api_keys" DROP CONSTRAINT "chk_project_api_keys_key_suffix"`,
    );
    await queryRunner.query(`ALTER TABLE "project_api_keys" DROP COLUMN "key_suffix"`);
  }
}
