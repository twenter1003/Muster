/**
 * 로그인 없이 웹 화면 전체를 돌려보기 위한 목 API 서버.
 *
 * 프로덕션은 GitHub OAuth 뒤에 있어 UI를 훑어볼 수가 없다. 이 서버는 빌드된 SPA와 함께
 * `/api/v1/*`를 전부 가짜 데이터로 응답해, 로그인·DB·GCP 없이 모든 화면을 열어 볼 수 있게 한다.
 * 반응형(모바일) 점검과 UI 회귀 확인이 주 용도다.
 *
 *   pnpm --filter @muster/web build && node scripts/mock-server.mjs
 *   PORT=4173 node scripts/mock-server.mjs
 *
 * `?unauth=true`를 붙이면 /auth/me가 401을 내므로 로그인 화면도 확인할 수 있다.
 *
 * 값 집합(stage·build_status·level 등)은 apps/web/src/lib/domain.ts의 실제 열거형을 따른다 —
 * 틀린 값을 넣으면 배지가 조용히 안 그려져서 화면이 멀쩡한지 아닌지 판단할 수 없게 된다.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../apps/web/dist');
const PORT = Number(process.env.PORT || 4173);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ─────────────────────────── 목 데이터 ─────────────────────────── */

const PROJECTS = [
  {
    id: 'proj-001',
    name: 'muster-api-server',
    current_stage: 'operation',
    repo_url: 'https://github.com/muster-dev/muster-api-server-with-a-long-name',
    health: 3.6,
    deploy_status: 'success',
    log: 'Deployment v2.4.1 completed successfully',
  },
  {
    id: 'proj-002',
    name: 'agent-runtime-core',
    current_stage: 'deployment',
    repo_url: 'https://github.com/muster-dev/agent-runtime',
    health: 3.2,
    deploy_status: 'success',
    log: 'Container healthcheck passed (12/12)',
  },
  {
    id: 'proj-003',
    name: 'workflow-orchestrator',
    current_stage: 'testing',
    repo_url: 'https://github.com/muster-dev/workflow-orchestrator',
    health: 2.4,
    deploy_status: 'running',
    log: 'DAG compile warning in task-7',
  },
  {
    id: 'proj-004',
    name: 'token-cost-analyzer',
    current_stage: 'development',
    repo_url: 'https://github.com/muster-dev/token-cost-analyzer',
    health: 3.9,
    deploy_status: 'success',
    log: 'Hourly aggregate batch committed',
  },
  {
    id: 'proj-005',
    name: 'lakehouse-connector',
    current_stage: 'design',
    repo_url: 'https://github.com/muster-dev/lakehouse-connector',
    health: 1.4,
    deploy_status: 'failed',
    log: 'Connection timeout to Iceberg catalog after 30s — retry budget exhausted',
  },
  {
    id: 'proj-006',
    name: 'security-audit-scanner',
    current_stage: 'planning',
    repo_url: 'https://github.com/muster-dev/security-scanner',
    health: 2.0,
    deploy_status: 'failed',
    log: '3 medium CVE alerts identified in npm dependency tree',
  },
];

const projectOf = (id) => PROJECTS.find((p) => p.id === id) || PROJECTS[0];

const AGENT_NAMES = ['claude-code', 'antigravity', 'cursor'];

const TIME_SERIES = {
  hour: Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, '0');
    const tokens = Math.round(4000 + Math.sin(i / 2) * 3000 + i * 1800);
    return {
      key: `2026-09-19 ${h}:00`,
      label: `${h}:00`,
      tokens: String(tokens),
      cost: (tokens * 0.0000036).toFixed(4),
    };
  }),
  day: Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * DAY);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const tokens = Math.round(95000 + Math.sin(i) * 60000 + i * 32000);
    return {
      key: `${d.getFullYear()}-${mm}-${dd}`,
      label: `${mm}/${dd}`,
      tokens: String(tokens),
      cost: (tokens * 0.0000036).toFixed(4),
    };
  }),
  month: Array.from({ length: 6 }, (_, i) => {
    const d = new Date(2026, 3 + i, 1);
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const tokens = Math.round(450000 * Math.pow(1.45, i));
    return {
      key: `${d.getFullYear()}-${mm}`,
      label: `${yy}.${mm}`,
      tokens: String(tokens),
      cost: (tokens * 0.0000036).toFixed(4),
    };
  }),
};

const MODEL_BREAKDOWN = [
  {
    model_name: 'claude-sonnet-5',
    display_name: 'Claude Sonnet 5 (claude-code)',
    provider: 'anthropic',
    tokens: '2850000',
    cost: '10.2600',
    run_count: 24,
    percentage: 69.2,
  },
  {
    model_name: 'gemini-3.6-flash',
    display_name: 'Gemini 3.6 Flash (antigravity)',
    provider: 'google',
    tokens: '980000',
    cost: '0.8820',
    run_count: 18,
    percentage: 23.8,
  },
  {
    model_name: 'gpt-5.6-terra',
    display_name: 'GPT-5.6 Terra (cursor)',
    provider: 'openai',
    tokens: '290000',
    cost: '1.1600',
    run_count: 7,
    percentage: 7.0,
  },
];

const WASTE_INTELLIGENCE = {
  cache_efficiency: {
    hit_rate_percentage: 42,
    input_tokens: 2_389_600,
    cache_read_tokens: 1_730_400,
    cache_write_tokens: 0,
    savings_usd: '6.2294',
    sessions_with_breakdown: 2,
    sessions_without_breakdown: 1,
  },
  cost_distribution: {
    median_cost_usd: '0.1843',
    p99_cost_usd: '0.6631',
    sample_size: 3,
    outliers: [{ session_id: 'agent-1-run-2', cost_usd: '0.6631', multiple_of_median: 3.6 }],
  },
  optimization_guides: [
    {
      id: 'prompt-cache-pinning',
      title: '공통 컨텍스트 상단 배치 (Prompt Cache Pinning)',
      description:
        'README, API 명세, 설계서 등 변하지 않는 핵심 문서를 시스템 프롬프트 최상단에 배치하면 90% 캐시 읽기 할인이 적용됩니다.',
      impact: 'HIGH',
      action_hint: '시스템 프롬프트의 가변 컨텍스트를 맨 뒤로 이동하세요.',
    },
    {
      id: 'session-compaction',
      title: '100턴 단위 세션 분할 또는 컴팩션 (/compact)',
      description:
        '100턴을 초과하는 대형 세션은 매 턴마다 전체 대화 히스토리가 누적 입력 토큰으로 재전송되어 비용이 기하급수적으로 증가합니다.',
      impact: 'MEDIUM',
      action_hint: '장기 세션은 새 세션으로 분기하거나 주기적으로 요약 압축하세요.',
    },
    {
      id: 'subagent-delegation',
      title: '경량 탐색 작업은 Flash/Haiku 서브에이전트로 위임',
      description: '단순 코드 검색, 파일 목록 조사 등은 경량 모델 서브에이전트로 분리하세요.',
      impact: 'MEDIUM',
      action_hint: '단순 탐색 시 경량 모델 서브에이전트를 적극 활용하세요.',
    },
  ],
  model_cache_benchmarks: [
    { model: 'Claude Sonnet 5', discount: '90% 할인', readPrice: '$0.20 / 1M' },
    { model: 'Gemini 3.8 Flash', discount: '90% 할인', readPrice: '$0.075 / 1M' },
    { model: 'GPT-5.6 Terra', discount: '90% 할인', readPrice: '$0.20 / 1M' },
    { model: 'Claude Fable 5.1', discount: '97.5% 파격 할인', readPrice: '$0.25 / 1M' },
    { model: 'Gemini 3.6 Flash', discount: '90% 할인', readPrice: '$0.050 / 1M' },
  ],
};

const BURN_RATE = {
  window_minutes: 15,
  current_tokens_per_min: 18400,
  current_cost_per_min: '0.0662',
  is_spike: false,
  spike_level: 'elevated',
  dominant_agent: 'claude-code',
  recommendation: '현재 소모 속도는 평소보다 다소 높지만 임계치 안쪽입니다.',
  agents: AGENT_NAMES.map((name, i) => ({
    agent_name: name,
    tokens_per_min: 18400 - i * 6000,
    cost_per_min: (0.0662 - i * 0.02).toFixed(4),
    active_runs: i === 0 ? 1 : 0,
  })),
};

const runsFor = (agentId) => [
  {
    id: `${agentId}-run-1`,
    agent_id: agentId,
    status: 'running',
    tokens_used: 23000,
    cost: '0.0828',
    input_tokens: 3200,
    cache_read_tokens: 19800,
    cache_write_tokens: 0,
    started_at: iso(6 * MIN),
    ended_at: null,
  },
  {
    id: `${agentId}-run-2`,
    agent_id: agentId,
    status: 'succeeded',
    tokens_used: 184200,
    cost: '0.6631',
    input_tokens: 156800,
    cache_read_tokens: 27400,
    cache_write_tokens: 0,
    started_at: iso(3 * HOUR),
    ended_at: iso(2 * HOUR),
  },
  {
    id: `${agentId}-run-3`,
    agent_id: agentId,
    status: 'failed',
    tokens_used: 51200,
    cost: '0.1843',
    // 내역 없음(예전 실행) — "모름" 상태를 목 서버에서도 재현한다.
    input_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    started_at: iso(DAY),
    ended_at: iso(DAY - 20 * MIN),
  },
];

/* ─────────────────────────── 라우팅 ─────────────────────────── */

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};
const page = (items) => ({ items, next_cursor: null });

/** `/api/v1/projects/<id>/logs` → ['projects', '<id>', 'logs'] */
const seg = (pathname) => pathname.replace(/^\/api\/v1\//, '').split('/').filter(Boolean);

function handleApi(req, res, url) {
  const s = seg(url.pathname);
  const q = url.searchParams;

  // ── auth ──
  if (s[0] === 'auth' && s[1] === 'me') {
    // 로그인 화면을 보려면 미인증 응답이 필요하다.
    if (q.get('unauth') === 'true' || (req.headers.referer || '').includes('/login')) {
      return json(res, 401, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
    }
    return json(res, 200, {
      id: 'user-mock-1',
      github_login: 'muster-dev',
      email: 'dev@muster.local',
      avatar_url: null,
    });
  }
  if (s[0] === 'auth' && s[1] === 'logout') return json(res, 200, { ok: true });

  // ── github ──
  if (s[0] === 'github' && s[1] === 'repos') {
    return json(
      res,
      200,
      page(
        PROJECTS.map((p, i) => ({
          id: 1000 + i,
          full_name: p.repo_url.replace('https://github.com/', ''),
          html_url: p.repo_url,
          private: i % 3 === 0,
          default_branch: 'main',
          pushed_at: iso(i * HOUR),
        })),
      ),
    );
  }

  // ── search / inbox / reports ──
  if (s[0] === 'search') {
    const term = q.get('q') || '';
    return json(res, 200, {
      items: PROJECTS.filter((p) => p.name.includes(term))
        .slice(0, 5)
        .map((p) => ({ kind: 'project', id: p.id, title: p.name, subtitle: p.repo_url })),
    });
  }
  if (s[0] === 'inbox') {
    return json(
      res,
      200,
      page([
        {
          id: 'inbox-1',
          category: 'budget',
          title: '예산 임계치 초과',
          body: 'muster-api-server가 월 비용 한도의 92%를 사용했습니다.',
          project_id: 'proj-001',
          project_name: 'muster-api-server',
          created_at: iso(30 * MIN),
        },
        {
          id: 'inbox-2',
          category: 'deployment',
          title: '배포 실패',
          body: 'lakehouse-connector 배포가 Iceberg 카탈로그 연결 실패로 중단되었습니다.',
          project_id: 'proj-005',
          project_name: 'lakehouse-connector',
          created_at: iso(4 * HOUR),
        },
        {
          id: 'inbox-3',
          category: 'policy',
          title: 'Policy Gate 차단',
          body: 'security-audit-scanner의 도커 구성이 trivy 검사에서 차단되었습니다.',
          project_id: 'proj-006',
          project_name: 'security-audit-scanner',
          created_at: iso(DAY),
        },
      ]),
    );
  }
  if (s[0] === 'reports' && s[1] === 'summary') {
    return json(res, 200, {
      projects: PROJECTS.length,
      deploy_frequency: 2.4,
      lead_time_hours: 6.2,
      change_failure_rate: 0.14,
      mttr_hours: 1.8,
      total_tokens: '15200000',
      total_cost: '45.6000',
      health: PROJECTS.map((p) => ({
        project_id: p.id,
        project_name: p.name,
        composite_score: String(p.health),
      })),
    });
  }

  // ── env-templates ──
  if (s[0] === 'env-templates') {
    if (s[1]) {
      return json(res, 200, {
        id: s[1],
        name: 'Node 20 + Postgres 16',
        stack_config: { language: 'node', framework: 'nestjs', database: 'postgres', port: '3000' },
        created_at: iso(7 * DAY),
      });
    }
    return json(
      res,
      200,
      page([
        {
          id: 'tpl-1',
          name: 'Node 20 + Postgres 16',
          stack_config: { language: 'node', framework: 'nestjs', database: 'postgres' },
          created_at: iso(7 * DAY),
        },
        {
          id: 'tpl-2',
          name: 'Python 3.12 + FastAPI',
          stack_config: { language: 'python', framework: 'fastapi', database: 'postgres' },
          created_at: iso(14 * DAY),
        },
      ]),
    );
  }

  // ── env-configs (단건) ──
  if (s[0] === 'env-configs' && s[1]) {
    if (s[2] === 'transitions') {
      return json(res, 200, {
        items: [
          {
            id: 't1',
            from_status: null,
            to_status: 'generated',
            actor: '시스템',
            reason: null,
            created_at: iso(3 * DAY),
          },
          {
            id: 't2',
            from_status: 'generated',
            to_status: 'policy_blocked',
            actor: '시스템',
            reason: 'trivy: HIGH 취약점 2건이 베이스 이미지에서 발견되었습니다.',
            created_at: iso(3 * DAY - HOUR),
          },
          {
            id: 't3',
            from_status: 'policy_blocked',
            to_status: 'policy_passed',
            actor: '시스템',
            reason: null,
            created_at: iso(2 * DAY),
          },
          {
            id: 't4',
            from_status: 'policy_passed',
            to_status: 'succeeded',
            actor: 'muster-dev',
            reason: null,
            created_at: iso(DAY),
          },
        ],
      });
    }
    if (s[2] === 'policy-checks') {
      return json(res, 200, {
        items: [
          {
            id: 'pc-1',
            tool: 'trivy',
            verdict: 'pass',
            risk_notes: null,
            checked_at: iso(2 * DAY),
          },
          {
            id: 'pc-2',
            tool: 'conftest',
            verdict: 'fail',
            risk_notes: 'root 사용자로 실행되는 컨테이너가 있습니다 (deny_root_user).',
            checked_at: iso(2 * DAY),
          },
        ],
      });
    }
    if (s[2] === 'execute' || s[2] === 'approve' || s[2] === 'reject') {
      return json(res, 200, { id: s[1], build_status: s[2] === 'reject' ? 'rejected' : 'running' });
    }
    return json(res, 200, {
      id: s[1],
      template_id: 'tpl-1',
      build_status: 'succeeded',
      stack_config: {
        language: 'node',
        framework: 'nestjs',
        database: 'postgres',
        port: '3000',
        extra_services: ['redis'],
      },
      docker_config: {
        dockerfile: 'FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN npm ci\nCMD ["npm","start"]',
        compose:
          'services:\n  api:\n    build: .\n    ports:\n      - "3000:3000"\n  db:\n    image: postgres:16\n  redis:\n    image: redis:7\n',
      },
      created_at: iso(3 * DAY),
    });
  }

  // ── agents (단건) ──
  if (s[0] === 'agents' && s[1]) {
    if (s[2] === 'runs') return json(res, 200, page(runsFor(s[1])));
    return json(res, 200, {
      id: s[1],
      name: 'claude-code',
      config_md: '# 역할\n코드 리뷰와 리팩터링을 담당한다.',
      created_at: iso(30 * DAY),
      updated_at: iso(HOUR),
    });
  }

  // ── agent-runs (단건) ──
  if (s[0] === 'agent-runs' && s[1]) {
    return json(res, 200, {
      id: s[1],
      agent_id: 'agent-1',
      agent_name: 'claude-code',
      model: 'claude-sonnet-5',
      status: 'succeeded',
      tokens_used: 184200,
      cost: '0.6631',
      started_at: iso(3 * HOUR),
      ended_at: iso(2 * HOUR),
      duration_seconds: 3600,
      cache: {
        hit_rate_percentage: 15,
        input_tokens: 156800,
        cache_read_tokens: 27400,
        savings_usd: '0.0940',
        has_breakdown: true,
      },
    });
  }

  // ── documents (단건) ──
  if (s[0] === 'documents' && s[1]) {
    return json(res, 200, {
      id: s[1],
      title: '제품 요구사항 정의서',
      type: 'prd',
      upload_status: 'completed',
      commit_ref: '7f8a9b1c',
      created_at: iso(5 * DAY),
      download_url: 'https://example.com/mock-download',
      download_expires_at: iso(-HOUR),
    });
  }

  // ── api-keys (단건 폐기) ──
  if (s[0] === 'api-keys' && s[1]) return json(res, 200, { ok: true });

  // ── invites ──
  if (s[0] === 'invites') {
    if (s[1] === 'lookup' || s[1] === 'accept') {
      return json(res, 200, {
        project_id: 'proj-001',
        project_name: 'muster-api-server',
        invited_by: 'muster-dev',
        expires_at: iso(-3 * DAY),
        already_member: false,
      });
    }
    return json(res, 200, { ok: true });
  }

  // ── projects ──
  if (s[0] === 'projects' && !s[1]) {
    const summary = q.get('summary') === 'true';
    return json(
      res,
      200,
      page(
        PROJECTS.map((p) => ({
          id: p.id,
          name: p.name,
          current_stage: p.current_stage,
          created_at: iso(60 * DAY),
          updated_at: iso(HOUR),
          ...(summary
            ? {
                repo_url: p.repo_url,
                health_score: p.health,
                latest_deploy_status: p.deploy_status,
                latest_log_message: p.log,
                total_tokens: '3820000',
                total_cost: '13.7520',
                today_tokens: '142500',
                today_cost: '0.5130',
                active_agents: p.deploy_status === 'running' ? 1 : 0,
              }
            : {}),
        })),
      ),
    );
  }

  if (s[0] === 'projects' && s[1]) {
    const p = projectOf(s[1]);
    const sub = s[2];

    if (!sub) {
      return json(res, 200, {
        id: p.id,
        name: p.name,
        current_stage: p.current_stage,
        created_at: iso(60 * DAY),
        updated_at: iso(HOUR),
      });
    }

    switch (sub) {
      case 'git-integration':
        return json(res, 200, {
          integration: {
            id: `git-${p.id}`,
            repo_url: p.repo_url,
            connected_at: iso(60 * DAY),
          },
        });

      case 'commits':
        return json(res, 200, {
          items: [
            {
              sha: '7f8a9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a',
              message: 'feat(monitoring): refine token charts, model binding, and llm retry',
              authored_at: iso(HOUR),
              url: '#',
            },
            {
              sha: '3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e',
              message: 'fix(ui): eliminate slot flickering and layout shifts on project list',
              authored_at: iso(5 * HOUR),
              url: '#',
            },
            {
              sha: '1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6f7e8d9c0b',
              message: 'perf: collapse N+1 waterfall into a single summary payload',
              authored_at: iso(2 * DAY),
              url: '#',
            },
          ],
        });

      case 'health-snapshots':
        return json(
          res,
          200,
          page([
            {
              id: `hs-${p.id}`,
              deploy_freq_score: Math.min(4, Math.round(p.health)),
              lead_time_score: Math.max(0, Math.round(p.health) - 1),
              change_fail_score: Math.min(4, Math.round(p.health)),
              mttr_score: Math.max(0, Math.round(p.health) - 1),
              composite_score: p.health.toFixed(1),
              measured_at: iso(20 * MIN),
            },
          ]),
        );

      case 'deployment-events':
        return json(
          res,
          200,
          page([
            {
              id: 'dep-1',
              kind: 'deployment',
              status: p.deploy_status,
              commit_sha: '7f8a9b1c',
              occurred_at: iso(30 * MIN),
            },
            {
              id: 'dep-2',
              kind: 'deployment',
              status: 'success',
              commit_sha: '3d4e5f6a',
              occurred_at: iso(DAY),
            },
          ]),
        );

      case 'logs': {
        const level = q.get('level');
        const all = [
          { id: 'log-1', agent_id: null, level: 'info', message: p.log, created_at: iso(MIN) },
          {
            id: 'log-2',
            agent_id: 'agent-1',
            level: 'warn',
            message:
              'Token burn rate 18,400/min exceeds the 15-minute rolling average by 42% — watch for a context runaway',
            created_at: iso(12 * MIN),
          },
          {
            id: 'log-3',
            agent_id: null,
            level: 'error',
            message:
              'GET https://api.github.com/repos/muster-dev/muster-api-server/commits failed: 403 rate limit exceeded (resets in 12m)',
            created_at: iso(40 * MIN),
          },
          {
            id: 'log-4',
            agent_id: 'agent-2',
            level: 'info',
            message: 'Agent run r-482 finished: 184,200 tokens, $0.6631',
            created_at: iso(2 * HOUR),
          },
        ];
        return json(res, 200, page(level ? all.filter((l) => l.level === level) : all));
      }

      case 'token-usage': {
        const gran = q.get('granularity') || 'day';
        const series = TIME_SERIES[gran] || TIME_SERIES.day;
        const agent_series = Object.fromEntries(
          AGENT_NAMES.map((name, i) => [
            name,
            series.map((pt) => ({
              key: pt.key,
              label: pt.label,
              tokens: String(Math.round(Number(pt.tokens) * [0.6, 0.25, 0.15][i])),
              cost: (Number(pt.cost) * [0.6, 0.25, 0.15][i]).toFixed(4),
            })),
          ]),
        );
        return json(res, 200, {
          today_tokens: '142500',
          today_cost: '0.5130',
          month_tokens: '4120000',
          month_cost: '14.8320',
          total_tokens: '15200000',
          total_cost: '54.7200',
          daily: TIME_SERIES.day.slice(-7).map((pt) => ({
            date: pt.key,
            tokens: pt.tokens,
            cost: pt.cost,
          })),
          granularity: gran,
          time_series: series,
          agent_series,
          available_agents: AGENT_NAMES,
          model_breakdown: MODEL_BREAKDOWN,
          waste_intelligence: WASTE_INTELLIGENCE,
          burn_rate: BURN_RATE,
          recent_runs: runsFor('agent-1').map((r) => {
            const denom = (r.input_tokens ?? 0) + (r.cache_read_tokens ?? 0) + (r.cache_write_tokens ?? 0);
            const hasBreakdown = r.input_tokens != null;
            return {
              ...r,
              agent_name: 'claude-code',
              model: 'claude-sonnet-5',
              duration_seconds: 3600,
              cache: {
                hit_rate_percentage:
                  hasBreakdown && denom > 0 ? Math.round((r.cache_read_tokens / denom) * 100) : null,
                input_tokens: r.input_tokens ?? 0,
                cache_read_tokens: r.cache_read_tokens ?? 0,
                savings_usd: hasBreakdown ? '0.0940' : '0.0000',
                has_breakdown: hasBreakdown,
              },
            };
          }),
        });
      }

      case 'burn-rate':
        return json(res, 200, BURN_RATE);

      case 'token-waste-intelligence':
        return json(res, 200, WASTE_INTELLIGENCE);

      case 'budget':
        return json(res, 200, {
          token_limit: '5000000',
          cost_limit: '20.0000',
          alert_threshold_pct: '80',
          used_tokens: '4120000',
          used_cost: '14.8320',
          token_usage_pct: 82.4,
          cost_usage_pct: 74.16,
          updated_at: iso(2 * DAY),
        });

      case 'api-keys':
        return json(
          res,
          200,
          page([
            { id: 'key-1', label: 'macbook-pro', key_suffix: 'a7f2', created_at: iso(20 * DAY) },
            { id: 'key-2', label: 'local-agent', key_suffix: '9c31', created_at: iso(3 * DAY) },
          ]),
        );

      case 'audit-logs':
        return json(
          res,
          200,
          page([
            { id: 'a1', action: 'budget.update', created_at: iso(2 * DAY) },
            { id: 'a2', action: 'env_config.approve', created_at: iso(3 * DAY) },
            { id: 'a3', action: 'api_key.issue', created_at: iso(20 * DAY) },
            { id: 'a4', action: 'project.update', created_at: iso(30 * DAY) },
          ]),
        );

      case 'stage-history':
        return json(
          res,
          200,
          page([
            { id: 'sh-1', stage: p.current_stage, entered_at: iso(5 * DAY) },
            { id: 'sh-2', stage: 'development', entered_at: iso(20 * DAY) },
            { id: 'sh-3', stage: 'design', entered_at: iso(40 * DAY) },
            { id: 'sh-4', stage: 'planning', entered_at: iso(60 * DAY) },
          ]),
        );

      case 'documents':
        return json(
          res,
          200,
          page([
            {
              id: 'doc-1',
              title: '제품 요구사항 정의서 (PRD v2.1)',
              type: 'prd',
              upload_status: 'completed',
              commit_ref: '7f8a9b1c',
              created_at: iso(5 * DAY),
            },
            {
              id: 'doc-2',
              title: '기술 사양서',
              type: 'tech_spec',
              upload_status: 'completed',
              commit_ref: null,
              created_at: iso(10 * DAY),
            },
            {
              id: 'doc-3',
              title: '업로드가 끝나지 않은 문서',
              type: 'other',
              upload_status: 'pending',
              commit_ref: null,
              created_at: iso(HOUR),
            },
          ]),
        );

      case 'agents':
        return json(
          res,
          200,
          page(
            AGENT_NAMES.map((name, i) => ({
              id: `agent-${i + 1}`,
              name,
              created_at: iso(30 * DAY),
              updated_at: iso((i + 1) * HOUR),
            })),
          ),
        );

      case 'env-configs':
        return json(
          res,
          200,
          page([
            {
              id: 'env-1',
              template_id: 'tpl-1',
              build_status: 'succeeded',
              stack_config: {
                language: 'node',
                framework: 'nestjs',
                database: 'postgres',
                port: '3000',
                extra_services: ['redis'],
              },
              created_at: iso(3 * DAY),
            },
            {
              id: 'env-2',
              template_id: null,
              build_status: 'failed',
              stack_config: { language: 'python', framework: 'fastapi', database: 'postgres' },
              created_at: iso(9 * DAY),
            },
          ]),
        );

      case 'env-workflow':
        return json(res, 200, {
          already_installed: false,
          pull_request_url: 'https://github.com/muster-dev/muster-api-server/pull/12',
        });

      case 'members':
        return json(
          res,
          200,
          page([
            {
              id: 'm-1',
              user_id: 'user-mock-1',
              github_login: 'muster-dev',
              role: 'owner',
              joined_at: iso(60 * DAY),
            },
            {
              id: 'm-2',
              user_id: 'user-2',
              github_login: 'teammate-kim',
              role: 'member',
              joined_at: iso(10 * DAY),
            },
          ]),
        );

      case 'invites':
        return json(
          res,
          200,
          page([
            {
              id: 'inv-1',
              token: 'mock-invite-token',
              expires_at: iso(-3 * DAY),
              created_at: iso(DAY),
            },
          ]),
        );

      case 'goals':
        if (s[3] === 'draft') {
          return json(res, 200, {
            goals_md:
              '# 목표\n- [ ] 알림 웹훅 연동\n- [ ] 모바일 반응형 정리\n- [x] 토큰 관제 차트 개선',
          });
        }
        return json(res, 200, {
          goals_md:
            '# 목표\n- [ ] 알림 웹훅 연동\n- [ ] 모바일 반응형 정리\n- [x] 토큰 관제 차트 개선',
          updated_at: iso(DAY),
        });

      case 'progress':
        return json(res, 200, {
          progress_percent: 62,
          summary: '전체 8개 항목 중 5개가 완료되었습니다.',
          items: [
            { title: '토큰 관제 차트 개선', done: true },
            { title: '모바일 반응형 정리', done: false },
            { title: '알림 웹훅 연동', done: false },
          ],
          analyzed_at: iso(2 * HOUR),
        });

      default:
        return json(res, 200, page([]));
    }
  }

  return json(res, 404, { code: 'NOT_FOUND', message: `목 서버에 없는 경로: ${url.pathname}` });
}

/* ─────────────────────────── 서버 ─────────────────────────── */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // SSE — 실시간 틱이 도는 화면(하트비트·예산 경보)을 볼 수 있게 한다.
  if (url.pathname.endsWith('/stream')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('event: ping\ndata: {}\n\n');
    res.write(
      `event: agent_run_started\ndata: ${JSON.stringify({
        project_id: 'proj-001',
        agent_id: 'agent-1',
        agent_name: 'claude-code',
        run_id: 'r-1',
        model: 'claude-sonnet-5',
        status: 'running',
        started_at: iso(6 * MIN),
      })}\n\n`,
    );

    let tokens = 23000;
    const timer = setInterval(() => {
      tokens += 4500;
      res.write(
        `event: agent_run_heartbeat\ndata: ${JSON.stringify({
          project_id: 'proj-001',
          agent_id: 'agent-1',
          agent_name: 'claude-code',
          run_id: 'r-1',
          model: 'claude-sonnet-5',
          tokens_used: tokens,
          cost: (tokens * 0.0000036).toFixed(4),
          delta_tokens: 4500,
          delta_cost: '0.0162',
          timestamp: iso(),
        })}\n\n`,
      );
    }, 3000);

    req.on('close', () => clearInterval(timer));
    return;
  }

  if (url.pathname.startsWith('/api/v1/')) {
    try {
      return handleApi(req, res, url);
    } catch (e) {
      return json(res, 500, { code: 'INTERNAL', message: String(e) });
    }
  }

  // 정적 파일 + SPA 폴백
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  let filePath = path.join(DIST_DIR, rel);
  if (!filePath.startsWith(DIST_DIR)) filePath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(filePath));
});

if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.error(`빌드 산출물이 없다: ${DIST_DIR}\n먼저 실행: pnpm --filter @muster/web build`);
  process.exit(1);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`목 서버 실행 중 → http://localhost:${PORT}`);
  console.log(`  로그인 화면: http://localhost:${PORT}/login?unauth=true`);
  console.log(`  프로젝트 상세: http://localhost:${PORT}/projects/proj-001`);
});
