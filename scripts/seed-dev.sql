-- 개발용 시드 데이터. **프로덕션에서 절대 실행하지 말 것.**
--
-- 화면을 눈으로 확인하려면 데이터가 있어야 한다. 프로젝트 한 개로는 목록·대시보드·리포트가
-- 전부 빈 껍데기로 보여서, 화면이 맞게 그려지는지와 데이터가 없는지를 구분할 수 없다.
--
-- 값은 UI/UX 설계서의 예시 화면(목업 1a~1j)과 같은 프로젝트 이름·수치를 쓴다. 그래야 구현이
-- 시안과 어긋난 지점을 눈으로 바로 대조할 수 있다.
--
-- 멱등하다. 여러 번 돌려도 같은 상태가 된다 (이름 기준으로 지우고 다시 넣는다).
-- 실행: docker compose exec -T db psql -U muster -d muster < scripts/seed-dev.sql

BEGIN;

-- 시드 사용자: 이미 로그인한 적 있는 첫 사용자를 쓴다. 없으면 아무것도 하지 않는다.
DO $$
DECLARE
  uid uuid;
  p_nol uuid; p_ingest uuid; p_recipe uuid; p_kiosk uuid; p_crawler uuid; p_docs uuid; p_blog uuid;
  a_id uuid; e_id uuid; t_id uuid;
BEGIN
  SELECT id INTO uid FROM users ORDER BY created_at LIMIT 1;
  IF uid IS NULL THEN
    RAISE NOTICE '사용자가 없다. GitHub 로그인을 한 번 한 뒤 다시 실행할 것.';
    RETURN;
  END IF;

  -- 이름으로 식별해 지운다. CASCADE가 하위 데이터를 함께 정리한다.
  DELETE FROM projects WHERE name IN (
    'nol-clone-dashboard','agentops-ingest','recipe-vault','kiosk-pos',
    'crawler-farm','docs-indexer','blog-renderer'
  );

  -- ── 프로젝트 7개 (설계서 04의 목록 화면과 같은 구성) ──
  INSERT INTO projects (name, current_stage, created_at, updated_at) VALUES
    ('nol-clone-dashboard','development', now() - interval '40 days', now() - interval '4 minutes') RETURNING id INTO p_nol;
  INSERT INTO projects (name, current_stage, created_at, updated_at) VALUES
    ('agentops-ingest','testing', now() - interval '35 days', now() - interval '2 hours') RETURNING id INTO p_ingest;
  INSERT INTO projects (name, current_stage, created_at, updated_at) VALUES
    ('recipe-vault','operation', now() - interval '90 days', now() - interval '1 day') RETURNING id INTO p_recipe;
  INSERT INTO projects (name, current_stage, created_at, updated_at) VALUES
    ('kiosk-pos','design', now() - interval '20 days', now() - interval '1 hour') RETURNING id INTO p_kiosk;
  INSERT INTO projects (name, current_stage, created_at, updated_at) VALUES
    ('crawler-farm','deployment', now() - interval '60 days', now() - interval '4 minutes') RETURNING id INTO p_crawler;
  INSERT INTO projects (name, current_stage, created_at, updated_at) VALUES
    ('docs-indexer','development', now() - interval '25 days', now() - interval '3 days') RETURNING id INTO p_docs;
  -- blog-renderer는 GitHub 미연동이다. 헬스가 계산되지 않아 목록에서 —로 비는 케이스를 만든다.
  INSERT INTO projects (name, current_stage, created_at, updated_at) VALUES
    ('blog-renderer','planning', now() - interval '10 days', now() - interval '8 days') RETURNING id INTO p_blog;

  INSERT INTO project_members (project_id, user_id, role)
  SELECT p, uid, 'owner' FROM unnest(ARRAY[p_nol,p_ingest,p_recipe,p_kiosk,p_crawler,p_docs,p_blog]) AS p;

  -- ── 단계 이력 ──
  INSERT INTO project_stage_history (project_id, stage, entered_at) VALUES
    (p_nol,'planning', now() - interval '40 days'),
    (p_nol,'design', now() - interval '22 days'),
    (p_nol,'development', now() - interval '10 days'),
    (p_ingest,'planning', now() - interval '35 days'),
    (p_ingest,'development', now() - interval '18 days'),
    (p_ingest,'testing', now() - interval '5 days'),
    (p_kiosk,'planning', now() - interval '20 days'),
    (p_kiosk,'design', now() - interval '6 days'),
    (p_blog,'planning', now() - interval '10 days');

  -- ── GitHub 연동 (blog-renderer만 미연동) ──
  INSERT INTO git_integrations (project_id, repo_url, webhook_secret_ref, webhook_id) VALUES
    (p_nol,'https://github.com/jh/nol-clone','file://seed-nol',1001),
    (p_ingest,'https://github.com/jh/agentops','file://seed-ingest',1002),
    (p_recipe,'https://github.com/jh/recipe-vault','file://seed-recipe',1003),
    (p_kiosk,'https://github.com/jh/kiosk-pos','file://seed-kiosk',1004),
    (p_crawler,'https://github.com/jh/crawler-farm','file://seed-crawler',1005),
    (p_docs,'https://github.com/jh/docs-indexer','file://seed-docs',1006);

  -- ── 예산 (nol-clone은 사용률 78%로 임계치 근접 상태를 만든다) ──
  INSERT INTO project_budgets (project_id, token_limit, cost_limit, alert_threshold_pct) VALUES
    (p_nol, 15000000, 45.0000, 80),
    (p_ingest, 10000000, 30.0000, 80),
    (p_crawler, 8000000, 20.0000, 80);

  -- ── 에이전트와 실행 이력 ──
  INSERT INTO agents (project_id, name, config_md) VALUES (p_nol,'doc-writer','# doc-writer\n문서 초안을 쓴다.') RETURNING id INTO a_id;
  INSERT INTO agent_runs (agent_id, status, tokens_used, cost, started_at, ended_at) VALUES
    (a_id,'succeeded', 84200, 0.7100, now() - interval '3 hours', now() - interval '2 hours'),
    (a_id,'succeeded', 61000, 0.5200, now() - interval '2 days', now() - interval '2 days' + interval '20 minutes');

  INSERT INTO agents (project_id, name, config_md) VALUES (p_nol,'test-runner','# test-runner\n테스트를 돌린다.') RETURNING id INTO a_id;
  INSERT INTO agent_runs (agent_id, status, tokens_used, cost, started_at, ended_at) VALUES
    (a_id,'succeeded', 211000, 1.8400, now() - interval '1 day', now() - interval '1 day' + interval '35 minutes'),
    (a_id,'failed', 90000, 0.8000, now() - interval '5 hours', now() - interval '4 hours'),
    (a_id,'running', 12000, 0.1100, now() - interval '10 minutes', NULL);

  INSERT INTO agents (project_id, name, config_md) VALUES (p_nol,'env-builder','# env-builder') RETURNING id INTO a_id;
  INSERT INTO agent_runs (agent_id, status, tokens_used, cost, started_at, ended_at) VALUES
    (a_id,'succeeded', 39600, 0.3300, now() - interval '4 days', now() - interval '4 days' + interval '9 minutes');

  INSERT INTO agents (project_id, name, config_md) VALUES (p_ingest,'ingest-agent','# ingest-agent') RETURNING id INTO a_id;
  INSERT INTO agent_runs (agent_id, status, tokens_used, cost, started_at, ended_at) VALUES
    (a_id,'running', 5000, 0.0400, now() - interval '20 minutes', NULL),
    (a_id,'succeeded', 400000, 3.2000, now() - interval '3 days', now() - interval '3 days' + interval '50 minutes'),
    (a_id,'cancelled', 2000, 0.0200, now() - interval '6 days', now() - interval '6 days' + interval '2 minutes');

  INSERT INTO agents (project_id, name, config_md) VALUES (p_crawler,'crawler','# crawler') RETURNING id INTO a_id;
  INSERT INTO agent_runs (agent_id, status, tokens_used, cost, started_at, ended_at) VALUES
    (a_id,'failed', 120000, 1.1000, now() - interval '8 hours', now() - interval '7 hours'),
    (a_id,'succeeded', 300000, 2.4000, now() - interval '2 days', now() - interval '2 days' + interval '40 minutes');

  INSERT INTO agents (project_id, name, config_md) VALUES (p_recipe,'release-notes','# release-notes') RETURNING id INTO a_id;
  INSERT INTO agents (project_id, name, config_md) VALUES (p_kiosk,'kiosk-agent','# kiosk-agent') RETURNING id INTO a_id;
  INSERT INTO agents (project_id, name, config_md) VALUES (p_docs,'indexer','# indexer') RETURNING id INTO a_id;

  -- ── 문서 ──
  INSERT INTO documents (project_id, title, type, upload_status, created_at)
  SELECT p_nol, t.title, t.ty, 'completed', now() - (t.d || ' days')::interval
  FROM (VALUES
    ('통합 설계서 v2.1','tech_spec','2'), ('PRD v1.6','prd','5'), ('API 설계 v1.3','srs','7'),
    ('ERD 다이어그램','other','9'), ('운영 런북','other','11'), ('보안 검토','other','13'),
    ('회의록 09-02','other','15')
  ) AS t(title,ty,d);
  INSERT INTO documents (project_id, title, type, upload_status, created_at) VALUES
    (p_ingest,'Ingest 설계 노트','tech_spec','completed', now() - interval '4 days'),
    (p_ingest,'웹훅 계약','srs','completed', now() - interval '6 days'),
    (p_kiosk,'키오스크 요구사항','prd','completed', now() - interval '3 days'),
    (p_blog,'블로그 렌더러 초안','prd','pending', now() - interval '9 days');

  -- ── 환경 구성 + Policy Gate ──
  INSERT INTO env_templates (owner_id, name, stack_preset, docker_preset)
  VALUES (uid, 'nestjs + pg 기본 프리셋', '{"language":"node","framework":"nestjs","database":"postgresql 16"}', '{"services":["app","db"]}')
  RETURNING id INTO t_id;

  -- 승인 대기(policy_passed) — 대시보드 Policy Gate 위젯에 승인 버튼이 뜨는 건
  INSERT INTO project_env_configs (project_id, template_id, stack_config, docker_config, build_status, created_at)
  VALUES (p_kiosk, t_id, '{"language":"node","framework":"nestjs","database":"postgresql 16"}',
          '{"compose":"services:\n  app:\n    ports: [\"8000:8000\"]"}', 'policy_passed', now() - interval '1 hour')
  RETURNING id INTO e_id;
  INSERT INTO policy_check_results (env_config_id, tool, verdict, risk_notes) VALUES
    (e_id,'trivy','pass','취약점 없음'),
    (e_id,'conftest','pass','포트 8000·5432 지정됨 · 메모리 1GB 제한됨');

  -- 차단(policy_blocked) — 승인 버튼이 **없어야** 하는 건
  INSERT INTO project_env_configs (project_id, template_id, stack_config, docker_config, build_status, created_at)
  VALUES (p_crawler, t_id, '{"language":"python"}', '{"compose":"services:\n  app:\n    volumes: [\"/:/host\"]"}',
          'policy_blocked', now() - interval '4 minutes')
  RETURNING id INTO e_id;
  INSERT INTO policy_check_results (env_config_id, tool, verdict, risk_notes) VALUES
    (e_id,'trivy','pass','취약점 없음'),
    (e_id,'conftest','fail','호스트 루트(/) 마운트 시도 — 승인 절차와 무관하게 차단됩니다.');

  -- 실행 완료(succeeded) — 개요 화면의 상태 전이 문자열이 끝까지 간 경우
  INSERT INTO project_env_configs (project_id, template_id, stack_config, docker_config, build_status, created_at)
  VALUES (p_nol, t_id, '{"language":"node","framework":"nestjs","database":"postgresql 16","cache":"redis 7"}',
          '{"compose":"services:\n  app:\n    ports: [\"3000:3000\"]\n  db:\n    image: postgres:16-alpine\n  cache:\n    image: redis:7-alpine"}',
          'succeeded', now() - interval '6 days')
  RETURNING id INTO e_id;
  INSERT INTO policy_check_results (env_config_id, tool, verdict, risk_notes) VALUES
    (e_id,'trivy','pass','취약점 없음'), (e_id,'conftest','pass','규칙 통과');

  INSERT INTO project_env_configs (project_id, template_id, stack_config, docker_config, build_status, created_at)
  VALUES (p_ingest, t_id, '{"language":"node","framework":"nestjs"}', '{"compose":"services:\n  app: {}"}', 'running', now() - interval '30 minutes');

  INSERT INTO project_env_configs (project_id, template_id, stack_config, docker_config, build_status, created_at)
  VALUES (p_docs, t_id, '{"language":"node"}', '{"compose":"services:\n  app: {}"}', 'approved', now() - interval '3 days');

  -- ── 배포 이벤트 (DORA 입력) ──
  INSERT INTO deployment_events (project_id, kind, status, commit_sha, committed_at, occurred_at)
  SELECT p_nol, 'workflow_run', 'success', md5(g::text), now() - (g || ' days')::interval - interval '2 hours', now() - (g || ' days')::interval
  FROM generate_series(1, 12) g;
  INSERT INTO deployment_events (project_id, kind, status, commit_sha, committed_at, occurred_at) VALUES
    (p_crawler,'deployment','failure', md5('c1'), NULL, now() - interval '8 hours'),
    (p_crawler,'deployment','success', md5('c2'), NULL, now() - interval '2 days'),
    (p_ingest,'workflow_run','failure', md5('i1'), now() - interval '3 days' - interval '1 hour', now() - interval '3 days'),
    (p_ingest,'workflow_run','success', md5('i2'), now() - interval '2 days' - interval '30 minutes', now() - interval '2 days'),
    (p_kiosk,'workflow_run','failure', md5('k1'), now() - interval '40 days', now() - interval '30 days'),
    (p_recipe,'workflow_run','success', md5('r1'), now() - interval '5 days' - interval '20 minutes', now() - interval '5 days');

  -- ── 헬스 스냅샷 (설계서 04의 헬스 값과 맞춘다) ──
  INSERT INTO health_snapshots (project_id, deploy_freq_score, lead_time_score, change_fail_score, mttr_score, composite_score, measured_at) VALUES
    (p_nol, 4, 3, 3, 3, 3.40, now() - interval '2 hours'),
    (p_ingest, 3, 3, 2, 3, 2.80, now() - interval '3 hours'),
    (p_recipe, 4, 4, 4, 3, 3.90, now() - interval '1 day'),
    (p_kiosk, 1, NULL, 1, NULL, 1.50, now() - interval '5 hours'),
    (p_crawler, 2, NULL, 2, 3, 2.50, now() - interval '1 hour'),
    (p_docs, 3, 3, 3, 3, 3.00, now() - interval '1 day');

  -- 추이선을 보려면 프로젝트당 점이 2개 이상 있어야 한다. 최근 8주치를 주 단위로 깐다.
  -- 값을 조금씩 흔들어 두는 이유는, 평평한 선은 "데이터가 없는 것"과 구분되지 않기 때문이다.
  INSERT INTO health_snapshots (project_id, deploy_freq_score, lead_time_score, change_fail_score, mttr_score, composite_score, measured_at)
  SELECT p.id, s.df, s.lt, s.cf, s.mt,
         ROUND(((s.df + s.lt + s.cf + s.mt)::numeric / 4), 2),
         now() - (w || ' weeks')::interval
  FROM generate_series(1, 8) w
  CROSS JOIN LATERAL (VALUES (p_nol), (p_ingest), (p_recipe), (p_crawler), (p_docs)) AS p(id)
  CROSS JOIN LATERAL (
    SELECT
      2 + ((w + 1) % 3) AS df,
      2 + ((w + 2) % 3) AS lt,
      2 + (w % 3)       AS cf,
      1 + ((w + 1) % 4) AS mt
  ) AS s;

  -- ── 로그 (대시보드 실행 스트림 · 개요 로그 탭) ──
  INSERT INTO log_entries (project_id, agent_id, level, message, created_at) VALUES
    (p_crawler, NULL,'error','docker build 실패 — crawler-farm 태그 미지정', now() - interval '5 minutes'),
    (p_nol, NULL,'info','doc-writer 완료 · 84.2K 토큰 · $0.71', now() - interval '8 minutes'),
    (p_nol, NULL,'warn','예산 사용률 78% — 임계치 80% 근접', now() - interval '13 minutes'),
    (p_kiosk, NULL,'info','Policy Gate 통과 — trivy · conftest pass', now() - interval '16 minutes'),
    (p_ingest, NULL,'info','stage_change: testing → deployment', now() - interval '22 minutes'),
    (p_ingest, NULL,'error','webhook 서명 불일치 요청 1건 거부', now() - interval '34 minutes'),
    (p_nol, NULL,'info','배포 성공 (production)', now() - interval '2 hours'),
    (p_crawler, NULL,'error','배포 실패 (production)', now() - interval '8 hours');

  RAISE NOTICE '시드 완료 — 프로젝트 7개';
END $$;

COMMIT;
