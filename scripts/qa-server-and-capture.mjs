import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { MOCK_PROJECTS } from './benchmark-ab-test.mjs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST_DIR = path.resolve('/Users/kimtaewoo/Muster/apps/web/dist');
const ARTIFACT_DIR_PARENT =
  '/Users/kimtaewoo/.gemini/antigravity/brain/75deec8b-784a-416e-8455-0bc4fc2de628';
const ARTIFACT_DIR_CURRENT =
  '/Users/kimtaewoo/.gemini/antigravity/brain/59af4d8d-bdc2-4137-9515-1e864441b8e9';
const ARTIFACT_DIR_SESSION =
  '/Users/kimtaewoo/.gemini/antigravity/brain/1aa6d9ea-825f-4de3-b3a5-d2ef4a543122';
const ARTIFACT_DIR_ABORT =
  '/Users/kimtaewoo/.gemini/antigravity/brain/0959bf44-17ba-4157-8495-db5e55b990da';

fs.mkdirSync(ARTIFACT_DIR_PARENT, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR_CURRENT, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR_SESSION, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR_ABORT, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // SSE 스트림 엔드포인트 - 하트비트 실시간 틱 이벤트 스트리밍
  if (url.pathname.endsWith('/stream')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('event: ping\ndata: {}\n\n');
    res.write(
      'event: agent_run_started\ndata: {"project_id":"proj-001","agent_name":"claude-code","run_id":"r-1","status":"running","started_at":"2026-09-17T12:00:00Z"}\n\n',
    );
    res.write(
      'event: agent_run_heartbeat\ndata: {"project_id":"proj-001","agent_name":"claude-code","run_id":"r-1","tokens_used":18500,"cost":"0.0666","delta_tokens":4500,"delta_cost":"0.0162","timestamp":"2026-09-17T12:02:10Z"}\n\n',
    );

    const timer = setInterval(() => {
      res.write(
        `event: agent_run_heartbeat\ndata: {"project_id":"proj-001","agent_name":"claude-code","run_id":"r-1","tokens_used":23000,"cost":"0.0828","delta_tokens":4500,"delta_cost":"0.0162","timestamp":"${new Date().toISOString()}"}\n\n`,
      );
    }, 1000);

    req.on('close', () => {
      clearInterval(timer);
    });
    return;
  }


  // API 처리
  if (url.pathname.startsWith('/api/v1/')) {
    res.setHeader('Content-Type', 'application/json');

    if (url.pathname === '/api/v1/auth/me') {
      // 로그인 화면(/login) 캡처 시에는 401 반환하여 대시보드로 자동 리다이렉트되지 않게 함
      const isLoginView =
        url.searchParams.get('unauth') === 'true' ||
        (req.headers.referer && req.headers.referer.includes('/login'));

      if (isLoginView) {
        res.writeHead(401);
        res.end(JSON.stringify({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }));
        return;
      }

      res.writeHead(200);
      res.end(
        JSON.stringify({
          id: 'user-qa-1',
          github_login: 'muster-qa-lead',
          email: 'qa@muster.dev',
        }),
      );
      return;
    }

    if (url.pathname === '/api/v1/projects') {
      const isSummary = url.searchParams.get('summary') === 'true';
      if (isSummary) {
        const items = MOCK_PROJECTS.map((p) => ({
          id: p.id,
          name: p.name,
          current_stage: p.stage,
          created_at: new Date('2026-03-01T00:00:00Z').toISOString(),
          updated_at: new Date().toISOString(),
          repo_url: p.repo,
          health_score: p.health,
          latest_deploy_status: p.status,
          latest_log_message: p.log,
          tokens: p.tokens,
          active_agents: p.agents,
        }));
        res.writeHead(200);
        res.end(JSON.stringify({ items, next_cursor: null }));
        return;
      } else {
        const items = MOCK_PROJECTS.map((p) => ({
          id: p.id,
          name: p.name,
          current_stage: p.stage,
          created_at: new Date('2026-03-01T00:00:00Z').toISOString(),
          updated_at: new Date().toISOString(),
        }));
        res.writeHead(200);
        res.end(JSON.stringify({ items, next_cursor: null }));
        return;
      }
    }

    // 프로젝트 상세
    const matchDetail = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)$/);
    if (matchDetail) {
      const proj = MOCK_PROJECTS.find((p) => p.id === matchDetail[1]) || MOCK_PROJECTS[0];
      res.writeHead(200);
      res.end(
        JSON.stringify({
          id: proj.id,
          name: proj.name,
          current_stage: proj.stage,
          created_at: new Date('2026-03-01T00:00:00Z').toISOString(),
          updated_at: new Date().toISOString(),
        }),
      );
      return;
    }

    // Git 연동
    const matchGit = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/git-integration/);
    if (matchGit) {
      const proj = MOCK_PROJECTS.find((p) => p.id === matchGit[1]) || MOCK_PROJECTS[0];
      res.writeHead(200);
      res.end(
        JSON.stringify({
          integration: {
            id: `git-${proj.id}`,
            repo_url: proj.repo,
            connected_at: new Date('2026-03-01T00:00:00Z').toISOString(),
          },
        }),
      );
      return;
    }

    // 최근 커밋
    const matchCommits = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/commits/);
    if (matchCommits) {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          items: [
            {
              sha: '7f8a9b1c',
              message: 'feat: add high-speed summary API and benchmark HUD',
              authored_at: new Date(Date.now() - 3600000).toISOString(),
              url: '#',
            },
            {
              sha: '3d4e5f6a',
              message: 'fix(ui): eliminate slot flickering and layout shifts',
              authored_at: new Date(Date.now() - 7200000).toISOString(),
              url: '#',
            },
            {
              sha: '1c2b3a4f',
              message: 'perf: optimize N+1 query overhead to single payload',
              authored_at: new Date(Date.now() - 14400000).toISOString(),
              url: '#',
            },
          ],
        }),
      );
      return;
    }

    // 헬스 스냅샷
    const matchHealth = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/health-snapshots/);
    if (matchHealth) {
      const proj = MOCK_PROJECTS.find((p) => p.id === matchHealth[1]) || MOCK_PROJECTS[0];
      res.writeHead(200);
      res.end(
        JSON.stringify({
          items: [{ composite_score: String(proj.health), measured_at: new Date().toISOString() }],
          next_cursor: null,
        }),
      );
      return;
    }

    // 배포 이벤트
    const matchDeploy = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/deployment-events/);
    if (matchDeploy) {
      const proj = MOCK_PROJECTS.find((p) => p.id === matchDeploy[1]) || MOCK_PROJECTS[0];
      res.writeHead(200);
      res.end(
        JSON.stringify({
          items: [
            {
              id: 'dep-1',
              kind: 'deployment',
              status: proj.status,
              commit_sha: '7f8a9b1c',
              occurred_at: new Date(Date.now() - 1800000).toISOString(),
            },
            {
              id: 'dep-2',
              kind: 'deployment',
              status: 'success',
              commit_sha: '3d4e5f6a',
              occurred_at: new Date(Date.now() - 86400000).toISOString(),
            },
          ],
          next_cursor: null,
        }),
      );
      return;
    }

    // 로그
    const matchLogs = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/logs/);
    if (matchLogs) {
      const proj = MOCK_PROJECTS.find((p) => p.id === matchLogs[1]) || MOCK_PROJECTS[0];
      res.writeHead(200);
      res.end(
        JSON.stringify({
          items: [
            { id: 'log-1', level: 'info', message: proj.log, created_at: new Date().toISOString() },
            {
              id: 'log-2',
              level: 'info',
              message: 'HTTP GET /projects?summary=true latency: 0.3ms',
              created_at: new Date(Date.now() - 60000).toISOString(),
            },
            {
              id: 'log-3',
              level: 'warn',
              message: 'Variant A detected 41 N+1 queries. Switching to Variant B advised.',
              created_at: new Date(Date.now() - 120000).toISOString(),
            },
          ],
          next_cursor: null,
        }),
      );
      return;
    }

    // 토큰
    const matchTokens = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/token-usage/);
    if (matchTokens) {
      const proj = MOCK_PROJECTS.find((p) => p.id === matchTokens[1]) || MOCK_PROJECTS[0];
      const gran = url.searchParams.get('granularity') || 'day';

      let time_series = [];
      if (gran === 'hour') {
        time_series = [
          { key: '2026-09-17 14:00', label: '14:00', tokens: '4200', cost: '0.0151' },
          { key: '2026-09-17 15:00', label: '15:00', tokens: '8900', cost: '0.0320' },
          { key: '2026-09-17 16:00', label: '16:00', tokens: '14500', cost: '0.0522' },
          { key: '2026-09-17 17:00', label: '17:00', tokens: '28000', cost: '0.1008' },
          { key: '2026-09-17 18:00', label: '18:00', tokens: '19000', cost: '0.0684' },
          { key: '2026-09-17 19:00', label: '19:00', tokens: '35000', cost: '0.1260' },
          { key: '2026-09-17 20:00', label: '20:00', tokens: '48000', cost: '0.1728' },
          { key: '2026-09-17 21:00', label: '21:00', tokens: '62000', cost: '0.2232' },
        ];
      } else if (gran === 'month') {
        time_series = [
          { key: '2026-04', label: '26.04', tokens: '450000', cost: '1.6200' },
          { key: '2026-05', label: '26.05', tokens: '820000', cost: '2.9520' },
          { key: '2026-06', label: '26.06', tokens: '1250000', cost: '4.5000' },
          { key: '2026-07', label: '26.07', tokens: '2100000', cost: '7.5600' },
          { key: '2026-08', label: '26.08', tokens: '3400000', cost: '12.2400' },
          { key: '2026-09', label: '26.09', tokens: '4120000', cost: '14.8320' },
        ];
      } else {
        time_series = [
          { key: '2026-09-04', label: '09/04', tokens: '110000', cost: '0.3960' },
          { key: '2026-09-05', label: '09/05', tokens: '135000', cost: '0.4860' },
          { key: '2026-09-06', label: '09/06', tokens: '180000', cost: '0.6480' },
          { key: '2026-09-07', label: '09/07', tokens: '95000', cost: '0.3420' },
          { key: '2026-09-08', label: '09/08', tokens: '210000', cost: '0.7560' },
          { key: '2026-09-09', label: '09/09', tokens: '320000', cost: '1.1520' },
          { key: '2026-09-10', label: '09/10', tokens: '280000', cost: '1.0080' },
          { key: '2026-09-11', label: '09/11', tokens: '350000', cost: '1.2600' },
          { key: '2026-09-12', label: '09/12', tokens: '420000', cost: '1.5120' },
          { key: '2026-09-13', label: '09/13', tokens: '290000', cost: '1.0440' },
          { key: '2026-09-14', label: '09/14', tokens: '310000', cost: '1.1160' },
          { key: '2026-09-15', label: '09/15', tokens: '480000', cost: '1.7280' },
          { key: '2026-09-16', label: '09/16', tokens: '520000', cost: '1.8720' },
          { key: '2026-09-17', label: '09/17', tokens: '640000', cost: '2.3040' },
        ];
      }

      const model_breakdown = [
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

      const agent_series = {
        'claude-code': time_series.map((p) => ({
          key: p.key,
          label: p.label,
          tokens: String(Math.round(Number(p.tokens) * 0.6)),
          cost: (Number(p.cost) * 0.6).toFixed(4),
        })),
        antigravity: time_series.map((p) => ({
          key: p.key,
          label: p.label,
          tokens: String(Math.round(Number(p.tokens) * 0.25)),
          cost: (Number(p.cost) * 0.25).toFixed(4),
        })),
        cursor: time_series.map((p) => ({
          key: p.key,
          label: p.label,
          tokens: String(Math.round(Number(p.tokens) * 0.15)),
          cost: (Number(p.cost) * 0.15).toFixed(4),
        })),
      };

      const enriched_time_series = time_series.map((p, idx) => ({
        ...p,
        agent_tokens: {
          'claude-code': agent_series['claude-code'][idx].tokens,
          antigravity: agent_series['antigravity'][idx].tokens,
          cursor: agent_series['cursor'][idx].tokens,
        },
        agent_cost: {
          'claude-code': agent_series['claude-code'][idx].cost,
          antigravity: agent_series['antigravity'][idx].cost,
          cursor: agent_series['cursor'][idx].cost,
        },
      }));

      res.writeHead(200);
      res.end(
        JSON.stringify({
          today_tokens: proj.tokens.today,
          month_tokens: proj.tokens.month,
          total_tokens: proj.tokens.total,
          today_cost: proj.tokens.todayCost,
          month_cost: '$14.20',
          total_cost: proj.tokens.totalCost,
          granularity: gran,
          time_series: enriched_time_series,
          agent_series,
          available_agents: ['claude-code', 'antigravity', 'cursor'],
          model_breakdown,
          daily: [
            { date: '2026-03-15', tokens: '110000', cost: '$0.33' },
            { date: '2026-03-16', tokens: '135000', cost: '$0.40' },
            { date: '2026-03-17', tokens: proj.tokens.today, cost: proj.tokens.todayCost },
          ],
          waste_intelligence: {
            cache_efficiency: {
              hit_rate_percentage: 65,
              current_estimated_cost: '14.2000',
              optimized_cost: '4.8200',
              potential_savings: '9.3800',
              savings_percentage: 66,
            },
            waste_breakdown: {
              level: 'CAUTION',
              total_wasted_tokens: 850000,
              waste_percentage: 21,
              context_bloat_tokens: 850000,
              duplicate_reads_tokens: 618000,
              high_waste_sessions_count: 1,
            },
            optimization_guides: [
              {
                id: 'prompt-cache-pinning',
                title: '공통 컨텍스트 상단 배치 (Prompt Cache Pinning)',
                description:
                  'README, API 명세, 설계서 등 변하지 않는 핵심 문서를 시스템 프롬프트 최상단에 배치하면 2026 최신 모델(Claude/Gemini)에서 90% 캐시 읽기 할인이 적용됩니다.',
                impact: 'HIGH',
                action_hint: '시스템 프롬프트의 가변 컨텍스트를 맨 뒤로 이동하세요.',
              },
              {
                id: 'session-compaction',
                title: '100턴 단위 세션 분할 또는 컴팩션 (/compact)',
                description:
                  '100턴을 초과하는 대형 세션은 매 턴마다 전체 대화 히스토리가 누적 입력 토큰으로 재전송되어 비용이 기하급수적으로 증가합니다.',
                impact: 'HIGH',
                action_hint: '장기 세션은 새 세션으로 분기하거나 주기적으로 요약 압축하세요.',
              },
              {
                id: 'subagent-delegation',
                title: '경량 탐색 작업은 Flash/Haiku 서브에이전트로 위임',
                description:
                  '단순 코드 검색, 파일 목록 조사 등은 Gemini 3.1 Flash-Lite($0.15/1M)나 Claude Haiku 5($0.40/1M) 서브에이전트로 분리하여 주력 모델의 입력 토큰을 절약하세요.',
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
          },
          recent_runs: [
            {
              id: 'run-active-1',
              agent_id: 'ag-1',
              agent_name: 'claude-sonnet-5',
              tokens_used: 145200,
              cost: '$0.435',
              status: 'running',
              started_at: new Date(Date.now() - 480000).toISOString(),
              ended_at: null,
              duration_seconds: 480,
              waste: {
                level: 'HIGH_WASTE',
                wasted_tokens: 65000,
                wasted_cost: '0.1950',
                burn_rate_tokens_per_min: 18150,
                recommendations: [
                  '최근 5분간 토큰 소모율(18,150 T/min)이 급증하여 예산 초과 위험이 있습니다.',
                  '불필요한 반복 쿼리가 감지되었습니다. 불필요한 경우 세션을 조기 중단(Abort)하세요.',
                ],
              },
            },
            {
              id: 'run-1',
              agent_id: 'ag-1',
              agent_name: 'claude-sonnet-5',
              tokens_used: 12500,
              cost: '$0.037',
              status: 'completed',
              started_at: new Date(Date.now() - 3600000).toISOString(),
              ended_at: new Date().toISOString(),
              duration_seconds: 120,
              waste: {
                level: 'NORMAL',
                wasted_tokens: 0,
                wasted_cost: '0.0000',
                burn_rate_tokens_per_min: 6250,
                recommendations: ['정상 범위 내의 토큰 소모 패턴입니다.'],
              },
            },
            {
              id: 'run-2',
              agent_id: 'ag-2',
              agent_name: 'gemini-3.6-flash',
              tokens_used: 8200,
              cost: '$0.008',
              status: 'completed',
              started_at: new Date(Date.now() - 7200000).toISOString(),
              ended_at: new Date().toISOString(),
              duration_seconds: 45,
              waste: {
                level: 'NORMAL',
                wasted_tokens: 0,
                wasted_cost: '0.0000',
                burn_rate_tokens_per_min: 10933,
                recommendations: ['정상 범위 내의 토큰 소모 패턴입니다.'],
              },
            },
          ],
        }),
      );
      return;
    }

    // Agent Run Abort & Detail
    const matchAbort = url.pathname.match(/^\/api\/v1\/(?:agents\/[^/]+\/runs|agent-runs)\/([^/]+)\/abort$/);
    if (matchAbort && req.method === 'POST') {
      const runId = matchAbort[1];
      res.writeHead(200);
      res.end(
        JSON.stringify({
          id: runId,
          status: 'cancelled',
          ended_at: new Date().toISOString(),
          tokens_used: 145200,
          cost: '$0.435',
          message: 'Agent run aborted successfully',
        }),
      );
      return;
    }

    const matchRunDetail = url.pathname.match(/^\/api\/v1\/agent-runs\/([^/]+)$/);
    if (matchRunDetail && req.method === 'GET') {
      const runId = matchRunDetail[1];
      res.writeHead(200);
      res.end(
        JSON.stringify({
          id: runId,
          agent_id: 'ag-1',
          agent_name: 'claude-sonnet-5',
          tokens_used: 145200,
          cost: '$0.435',
          status: 'running',
          started_at: new Date(Date.now() - 480000).toISOString(),
          ended_at: null,
          duration_seconds: 480,
          waste: {
            level: 'HIGH_WASTE',
            wasted_tokens: 65000,
            wasted_cost: '0.1950',
            burn_rate_tokens_per_min: 18150,
            recommendations: [
              '최근 5분간 토큰 소모율(18,150 T/min)이 급증하여 예산 초과 위험이 있습니다.',
              '불필요한 반복 쿼리가 감지되었습니다. 불필요한 경우 세션을 조기 중단(Abort)하세요.',
            ],
          },
        }),
      );
      return;
    }

    // Goals & Progress
    const matchGoals = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/goals/);
    if (matchGoals) {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          content_md:
            '# Phase 1: 아키텍처 및 성능 최적화\n- [x] N+1 REST Waterfall API 최적화 완료\n- [x] Variant A/B 실시간 HUD 대시보드 컴포넌트 탑재\n- [x] 즉시 렌더링을 통한 레이아웃 시프트 100% 제거\n- [x] SessionService 60초 인메모리 세션 캐시 도입\n\n# Phase 2: 대용량 UX 및 관제 자동화\n- [ ] 목표 체크리스트 전용 슬라이드 드로어 및 바텀시트 구축\n- [ ] 실시간 태스크 키워드 검색 및 상태 필터 칩 적용\n- [ ] 전역 배포 파이프라인 자동화 룰 추가\n- [ ] SSE 기반 도메인 이벤트 실시간 리로드 연동\n- [ ] 모바일 터치 제스처 및 바텀시트 스크롤 최적화\n- [ ] 토큰 사용량 일별/월별 추세 차트 연동\n- [ ] Cloud Run 트래픽 1초 롤백 자동화 스크립트 구축',
          updated_at: new Date().toISOString(),
        }),
      );
      return;
    }

    const matchProgress = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/progress/);
    if (matchProgress) {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          percent: 75,
          summary: '3/4 핵심 목표 달성 완료 (성능 가속화 및 A/B HUD 검증 완료)',
          remaining_items: [{ title: '배포 자동화', description: 'GitHub Actions 연동 확인' }],
          based_on_commit_sha: '7f8a9b1c',
          analyzed_at: new Date().toISOString(),
        }),
      );
      return;
    }

    // Documents & Agents
    const matchDocs = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/documents/);
    if (matchDocs) {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          items: [
            {
              id: 'doc-1',
              title: 'Architecture-Overview.md',
              type: 'text/markdown',
              created_at: new Date().toISOString(),
            },
            {
              id: 'doc-2',
              title: 'AB-Testing-Benchmark.pdf',
              type: 'application/pdf',
              created_at: new Date().toISOString(),
            },
          ],
          next_cursor: null,
        }),
      );
      return;
    }

    const matchAgents = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/agents/);
    if (matchAgents) {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          items: [
            {
              id: 'ag-1',
              name: 'claude-3-7-sonnet',
              status: 'idle',
              model: 'claude-3-7-sonnet',
              created_at: new Date().toISOString(),
            },
            {
              id: 'ag-2',
              name: 'gemini-2.5-flash',
              status: 'running',
              model: 'gemini-2.5-flash',
              created_at: new Date().toISOString(),
            },
          ],
          next_cursor: null,
        }),
      );
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({ items: [], next_cursor: null }));
    return;
  }

  // 정적 파일 서빙
  let filePath = path.join(DIST_DIR, url.pathname);
  if (url.pathname === '/' || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  if (ext === '.html') {
    let html = fs.readFileSync(filePath, 'utf8');
    const inject = `
    <script>
      (function() {
        const params = new URLSearchParams(window.location.search);
        if (params.has('variant')) {
          localStorage.setItem('muster_ab_variant', params.get('variant'));
        }
        if (params.has('hud_collapsed')) {
          localStorage.setItem('muster_ab_hud_collapsed', params.get('hud_collapsed'));
        }
      })();
    </script>
    `;
    html = html.replace('<head>', '<head>' + inject);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(html);
    return;
  }

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
});

async function runCaptures() {
  await new Promise((resolve) => server.listen(8765, '127.0.0.1', resolve));
  console.log('🌐 QA 모의 통합 서버 구동 완료: http://127.0.0.1:8765\n');

  // Chrome 브라우저를 원격 디버깅 포트와 함께 구동
  const chromePort = 9338;
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${chromePort}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

  // Chrome CDP 준비 대기
  let targetWsUrl = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const listRes = await fetch(`http://127.0.0.1:${chromePort}/json/list`);
      const targets = await listRes.json();
      const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        targetWsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {
      // 대기 후 재시도
    }
  }

  if (!targetWsUrl) {
    throw new Error('Chrome DevTools WebSocket 연결 실패');
  }

  const ws = new WebSocket(targetWsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let msgId = 1;
  const sendCdp = (method, params = {}) =>
    new Promise((resolve) => {
      const id = msgId++;
      const handler = (event) => {
        const data = JSON.parse(event.data);
        if (data.id === id) {
          ws.removeEventListener('message', handler);
          resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await sendCdp('Page.enable');
  await sendCdp('Network.enable');

  const captureItem = async ({
    url,
    outName,
    width,
    height,
    isMobile,
    waitMs = 1200,
    evalScript,
  }) => {
    console.log(
      `📸 CDP 캡처 진행 중: [${width}x${height} ${isMobile ? 'MOBILE' : 'DESKTOP'}] ${outName} ...`,
    );

    // 뷰포트 및 디바이스 메트릭 오버라이드
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: Boolean(isMobile),
      fitWindow: false,
    });

    if (isMobile) {
      await sendCdp('Emulation.setTouchEmulationEnabled', { enabled: true });
    } else {
      await sendCdp('Emulation.setTouchEmulationEnabled', { enabled: false });
    }

    // 페이지 이동
    await sendCdp('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, waitMs));

    if (evalScript) {
      await sendCdp('Runtime.evaluate', { expression: evalScript });
      await new Promise((r) => setTimeout(r, 600));
    }

    // 스크린샷 캡처
    const shot = await sendCdp('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });

    const buffer = Buffer.from(shot.data, 'base64');
    const destParent = path.join(ARTIFACT_DIR_PARENT, outName);
    const destCurrent = path.join(ARTIFACT_DIR_CURRENT, outName);
    const destSession = path.join(ARTIFACT_DIR_SESSION, outName);
    const destAbort = path.join(ARTIFACT_DIR_ABORT, outName);
    fs.writeFileSync(destParent, buffer);
    fs.writeFileSync(destCurrent, buffer);
    fs.writeFileSync(destSession, buffer);
    fs.writeFileSync(destAbort, buffer);

    console.log(`  ✅ 저장 완료: ${outName} (${(buffer.length / 1024).toFixed(1)} KB)`);
  };

  try {
    // 1. 데스크톱 뷰포트 (1280x800) - Variant B (고속 대시보드 + 펼쳐진 HUD)
    await captureItem({
      url: 'http://127.0.0.1:8765/projects?variant=B&hud_collapsed=false',
      outName: 'desktop-variant-b-dashboard.png',
      width: 1280,
      height: 800,
      isMobile: false,
      waitMs: 1500,
    });

    // 2. 데스크톱 뷰포트 (1280x800) - Variant A (Control: N+1 분할 로딩)
    await captureItem({
      url: 'http://127.0.0.1:8765/projects?variant=A&hud_collapsed=false',
      outName: 'desktop-variant-a-dashboard.png',
      width: 1280,
      height: 800,
      isMobile: false,
      waitMs: 1500,
    });

    // 3. 모바일 뷰포트 (390x844, iPhone 규격) - Variant B 모바일 뷰 + A/B HUD
    await captureItem({
      url: 'http://127.0.0.1:8765/projects?variant=B&hud_collapsed=false',
      outName: 'mobile-variant-b-dashboard.png',
      width: 390,
      height: 844,
      isMobile: true,
      waitMs: 1500,
    });

    // 4. 모바일 뷰포트 (390x844) - A/B HUD 축소 상태 (Pill)
    await captureItem({
      url: 'http://127.0.0.1:8765/projects?variant=B&hud_collapsed=true',
      outName: 'mobile-variant-b-hud-collapsed.png',
      width: 390,
      height: 844,
      isMobile: true,
      waitMs: 1500,
    });

    // 5. 데스크톱 뷰포트 (1280x800) - 프로젝트 상세 페이지 (ProjectDetailPage) - 목표 HUD 축소 뷰
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'desktop-project-detail.png',
      width: 1280,
      height: 800,
      isMobile: false,
      waitMs: 1500,
    });

    // 6. 데스크톱 뷰포트 (1280x800) - 프로젝트 목표 전용 슬라이드 드로어 열림 상태
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'desktop-goal-drawer.png',
      width: 1280,
      height: 800,
      isMobile: false,
      waitMs: 1500,
      evalScript: `document.querySelector('.detail__goals-cta-btn')?.click()`,
    });

    // 7. 모바일 뷰포트 (390x844) - 프로젝트 상세 페이지 모바일 뷰
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'mobile-project-detail.png',
      width: 390,
      height: 844,
      isMobile: true,
      waitMs: 1500,
    });

    // 8. 모바일 뷰포트 (390x844) - 프로젝트 목표 전용 바텀 시트 열림 상태
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'mobile-goal-drawer.png',
      width: 390,
      height: 844,
      isMobile: true,
      waitMs: 1500,
      evalScript: `document.querySelector('.detail__goals-cta-btn')?.click()`,
    });

    // 9. 데스크톱 뷰포트 (1280x800) - 로그인 페이지 (순수 미인증 상태)
    await captureItem({
      url: 'http://127.0.0.1:8765/login?unauth=true',
      outName: 'desktop-login-page.png',
      width: 1280,
      height: 800,
      isMobile: false,
      waitMs: 1000,
    });

    // 10. 모바일 뷰포트 (390x844) - 로그인 페이지 모바일 뷰 (순수 미인증 상태)
    await captureItem({
      url: 'http://127.0.0.1:8765/login?unauth=true',
      outName: 'mobile-login-page.png',
      width: 390,
      height: 844,
      isMobile: true,
      waitMs: 1000,
    });

    // 11. 데스크톱 뷰포트 (1280x800) - 주식 차트형 다차원 토큰 모니터링 & 모델 브레이크다운
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'desktop-token-stock-chart.png',
      width: 1280,
      height: 800,
      isMobile: false,
      waitMs: 1500,
      evalScript: `document.querySelector('.token-stock-chart')?.scrollIntoView({ block: 'center' })`,
    });

    // 12. 모바일 뷰포트 (390x844) - 주식 차트형 다차원 토큰 모니터링 & 모델 브레이크다운 모바일 뷰
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'mobile-token-stock-chart.png',
      width: 390,
      height: 844,
      isMobile: true,
      waitMs: 1500,
      evalScript: `document.querySelector('.token-stock-chart')?.scrollIntoView({ block: 'start' })`,
    });

    // 13. 데스크톱 뷰포트 (1280x800) - 실시간 하트비트 스트리밍 & 라이브 틱 (Tick) 갱신
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'desktop-heartbeat-streaming.png',
      width: 1280,
      height: 800,
      isMobile: false,
      waitMs: 2500,
    });

    // 14. 모바일 뷰포트 (390x844) - 실시간 하트비트 스트리밍 & 라이브 틱 모바일 뷰
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'mobile-heartbeat-streaming.png',
      width: 390,
      height: 844,
      isMobile: true,
      waitMs: 2500,
    });

    // 15. 데스크톱 뷰포트 (1280x900) - 2026 프롬프트 캐싱 인텔리전스 카드 포커스
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'desktop-prompt-caching-intelligence.png',
      width: 1280,
      height: 900,
      isMobile: false,
      waitMs: 1500,
      evalScript: `document.querySelector('.token-waste-card')?.scrollIntoView({ block: 'center' })`,
    });

    // 16. 데스크톱 뷰포트 (1280x900) - 프롬프트 캐싱 최적화 가이드 모달 열림 상태
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'desktop-cache-guide-modal.png',
      width: 1280,
      height: 900,
      isMobile: false,
      waitMs: 1500,
      evalScript: `document.querySelector('.token-waste-card__guide-btn')?.click()`,
    });

    // 17. 모바일 뷰포트 (390x844) - 2026 프롬프트 캐싱 인텔리전스 카드 모바일 반응형 뷰
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'mobile-prompt-caching-intelligence.png',
      width: 390,
      height: 844,
      isMobile: true,
      waitMs: 1500,
      evalScript: `document.querySelector('.token-waste-card')?.scrollIntoView({ block: 'start' })`,
    });

    // 18. 데스크톱 뷰포트 (1280x900) - 에이전트별 토큰 비교 오버레이 (TokenStockChart)
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'desktop-token-chart-overlay.png',
      width: 1280,
      height: 900,
      isMobile: false,
      waitMs: 1500,
      evalScript: `document.querySelector('.token-stock-chart')?.scrollIntoView({ block: 'center' }); document.querySelector('[data-testid="overlay-toggle-button"]')?.click();`,
    });

    // 19. 데스크톱 뷰포트 (1280x900) - Cursor 에이전트 필터 선택 뷰
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'desktop-token-chart-cursor.png',
      width: 1280,
      height: 900,
      isMobile: false,
      waitMs: 1500,
      evalScript: `document.querySelector('.token-stock-chart')?.scrollIntoView({ block: 'center' }); Array.from(document.querySelectorAll('.chip')).find((c) => c.textContent.trim() === 'Cursor')?.click();`,
    });

    // 20. 모바일 뷰포트 (390x844) - 에이전트별 비교 오버레이 모바일 반응형 뷰
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'mobile-token-chart-overlay.png',
      width: 390,
      height: 844,
      isMobile: true,
      waitMs: 1500,
      evalScript: `document.querySelector('.token-stock-chart')?.scrollIntoView({ block: 'start' }); document.querySelector('[data-testid="overlay-toggle-button"]')?.click();`,
    });

    // 21. 데스크톱 뷰포트 (1280x900) - 마우스 호버 시 인터랙티브 플로팅 툴팁 (Floating Tooltip)
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'desktop-token-chart-floating-tooltip.png',
      width: 1280,
      height: 900,
      isMobile: false,
      waitMs: 1500,
      evalScript: `
        document.querySelector('.token-stock-chart')?.scrollIntoView({ block: 'center' });
        document.querySelector('[data-testid="overlay-toggle-button"]')?.click();
        const svg = document.querySelector('.token-stock-chart__svg');
        if (svg) {
          const rect = svg.getBoundingClientRect();
          const clientX = rect.left + rect.width * 0.45;
          const clientY = rect.top + rect.height * 0.5;
          svg.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY, bubbles: true }));
        }
      `,
    });

    // 22. 모바일 뷰포트 (390x844) - 모바일 터치/호버 시 인터랙티브 플로팅 툴팁 (Floating Tooltip)
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'mobile-token-chart-floating-tooltip.png',
      width: 390,
      height: 844,
      isMobile: true,
      waitMs: 1500,
      evalScript: `
        document.querySelector('.token-stock-chart')?.scrollIntoView({ block: 'start' });
        document.querySelector('[data-testid="overlay-toggle-button"]')?.click();
        const svg = document.querySelector('.token-stock-chart__svg');
        if (svg) {
          const rect = svg.getBoundingClientRect();
          const clientX = rect.left + rect.width * 0.45;
          const clientY = rect.top + rect.height * 0.5;
          svg.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY, bubbles: true }));
        }
      `,
    });

    // 23. 데스크톱 뷰포트 (1280x900) - 최근 세션 목록 (recent_runs) 및 인라인 [중단] 버튼 포커스
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'desktop-recent-runs-table.png',
      width: 1280,
      height: 900,
      isMobile: false,
      waitMs: 1500,
      evalScript: `document.querySelector('.detail__recent-runs')?.scrollIntoView({ block: 'center' })`,
    });

    // 24. 데스크톱 뷰포트 (1280x900) - 세션별 낭비 이력 딥다이브 모달 (SessionWasteModal) 오픈 상태
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'desktop-session-waste-modal.png',
      width: 1280,
      height: 900,
      isMobile: false,
      waitMs: 1500,
      evalScript: `
        document.querySelector('.detail__recent-runs')?.scrollIntoView({ block: 'center' });
        document.querySelector('.session-row--clickable')?.click();
      `,
    });

    // 25. 모바일 뷰포트 (390x844) - 세션별 낭비 이력 딥다이브 모달 모바일 반응형 뷰
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'mobile-session-waste-modal.png',
      width: 390,
      height: 844,
      isMobile: true,
      waitMs: 1500,
      evalScript: `
        document.querySelector('.detail__recent-runs')?.scrollIntoView({ block: 'center' });
        document.querySelector('.session-row--clickable')?.click();
      `,
    });

    // 26. 데스크톱 뷰포트 (1280x900) - 예산 급증 경고 배너의 원클릭 [세션 중단] 및 [낭비 딥다이브] 액션
    await captureItem({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'desktop-budget-spike-banner.png',
      width: 1280,
      height: 900,
      isMobile: false,
      waitMs: 1500,
      evalScript: `document.querySelector('.budget-spike-banner')?.scrollIntoView({ block: 'center' })`,
    });

    console.log('\n🎉 모든 뷰포트 및 인터랙티브 플로팅 툴팁 & 세션 낭비 딥다이브 모달 시각적 증거(스크린샷 26종) 완벽 캡처 완료!');
  } finally {
    ws.close();
    chrome.kill();
    server.close();
    process.exit(0);
  }
}

runCaptures().catch((err) => {
  console.error('QA 스크린샷 캡처 중 오류 발생:', err);
  server.close();
  process.exit(1);
});
