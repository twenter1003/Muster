import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supabase의 `authenticated` 역할이 `public` 스키마에 갖고 있던 테이블 권한 119개
 * (17개 테이블 × 7개 권한)와 시퀀스 권한을 회수하고, 기본 권한(default privileges)도 끈다.
 * 마이그레이션 19번(`RevokeAnonPrivileges`)이 `anon`에 한 것과 같은 일이다.
 *
 * **`anon`보다 위험이 낮다.** `authenticated`로 요청이 들어오려면 Supabase Auth가 발급한
 * JWT가 있어야 하는데, 이 앱은 Supabase Auth를 쓰지 않는다 — 인증은 자체 GitHub OAuth다.
 * 저장소 어디에도 `SUPABASE_*` 키를 읽는 코드가 없다(확인함). 그래서 발급 경로 자체가 없다.
 *
 * **그래도 회수하는 이유는 기본값이다.** Data API를 다시 켜는 사람이 Supabase Auth도 함께
 * 켜면 그 순간 이 권한이 그대로 살아난다. 회수해 두면 그때의 기본값이 "권한 없음"이 된다.
 *
 * **`service_role`은 건드리지 않는다.** 그 역할의 키는 공개되는 값이 아니라 서버 전용
 * 시크릿이고, 설계상 RLS를 우회하는 관리자 경로다 — 권한을 회수해도 얻는 것이 적은 반면
 * Supabase 자체 기능이 그 경로를 쓰면 깨진다. 이 앱은 그 키도 쓰지 않는다.
 *
 * **역할이 없는 곳에서는 통째로 건너뛴다** — 로컬·CI의 순정 Postgres에는 없는 역할이다.
 *
 * **down()은 되돌린다.** 되살리기 전에 RLS를 먼저 켤 것.
 */
export class RevokeAuthenticatedPrivileges1788970000000 implements MigrationInterface {
  name = 'RevokeAuthenticatedPrivileges1788970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          RAISE NOTICE 'authenticated 역할이 없어 건너뛴다 (Supabase가 아닌 환경)';
          RETURN;
        END IF;
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          RETURN;
        END IF;
        EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated';
        EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated';
      END
      $$;
    `);
  }
}
