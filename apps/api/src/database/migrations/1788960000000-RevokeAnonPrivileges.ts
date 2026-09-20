import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supabase의 `anon` 역할이 `public` 스키마에 갖고 있던 테이블 권한 119개
 * (17개 테이블 × 7개 권한)와 시퀀스 권한을 회수하고, 앞으로 만들어지는 객체에도
 * 자동으로 부여되지 않도록 기본 권한(default privileges)을 끈다.
 *
 * **왜 지금인가.** Data API(PostgREST)를 껐으므로(2026-09-20, DEPLOY.md) 지금은 `anon`
 * 키로 닿을 경로가 없다. 그러나 권한 자체는 그대로 남아 있어서, 누가 대시보드에서 Data
 * API를 다시 켜는 순간 `users`·`sessions`·`project_api_keys`·`audit_logs`가 그대로
 * 노출된다. 회수해 두면 그 경우의 기본값이 "권한 없음"이 된다.
 *
 * **기본 권한을 같이 끄는 것이 핵심이다.** 마이그레이션은 `postgres` 역할로 돌고, 그
 * 역할의 default privileges가 `anon`에게 테이블 권한을 주게 돼 있다. 현재 권한만
 * 회수하면 다음 마이그레이션이 만드는 테이블에서 되살아난다.
 *
 * **앱에는 영향이 없다.** 이 앱은 Supabase의 API 계층을 하나도 쓰지 않고, TypeORM이
 * 커넥션 문자열로 `postgres` 역할로 직접 붙는다. `public` 스키마의 모든 테이블 소유자도
 * `postgres`다.
 *
 * **`anon` 역할이 없는 곳에서는 통째로 건너뛴다** — 로컬·CI의 순정 Postgres에는 그 역할이
 * 없다. Supabase 전용 역할이라 없는 것이 정상이고, 없으면 회수할 것도 없다.
 *
 * **down()은 되돌린다.** Data API를 다시 켜야 할 때 원래 상태로 복구하기 위한 것이지,
 * 권장하는 상태가 아니다 — 되살리기 전에 RLS를 먼저 켤 것.
 *
 * `supabase_admin`이 설정한 별도의 기본 권한은 건드리지 않는다(그 역할로 접속할 수 없다).
 * 이 앱의 테이블은 전부 `postgres`가 만들므로 영향이 없다.
 */
export class RevokeAnonPrivileges1788960000000 implements MigrationInterface {
  name = 'RevokeAnonPrivileges1788960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          RAISE NOTICE 'anon 역할이 없어 건너뛴다 (Supabase가 아닌 환경)';
          RETURN;
        END IF;
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          RETURN;
        END IF;
        EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA public TO anon';
        EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon';
      END
      $$;
    `);
  }
}
