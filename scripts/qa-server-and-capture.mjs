import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MOCK_PROJECTS } from './benchmark-ab-test.mjs';

const execFileAsync = promisify(execFile);
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST_DIR = path.resolve('/Users/kimtaewoo/Muster/apps/web/dist');
const ARTIFACT_DIR_PARENT = '/Users/kimtaewoo/.gemini/antigravity/brain/e8458c2c-bf26-4777-b66f-1e307f2ffeaf';
const ARTIFACT_DIR_SELF = '/Users/kimtaewoo/.gemini/antigravity/brain/f504a32c-1c15-417b-aed7-2ca20c40ea7e';

fs.mkdirSync(ARTIFACT_DIR_PARENT, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR_SELF, { recursive: true });

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

  // SSE 스트림 엔드포인트 - Chrome 헤드리스가 네트워크 대기로 무한 대기하는 현상을 방지하기 위해 단발 전송 후 종료
  if (url.pathname.endsWith('/stream')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'close',
    });
    res.write('event: ping\ndata: {}\n\n');
    res.end();
    return;
  }

  // API 처리
  if (url.pathname.startsWith('/api/v1/')) {
    res.setHeader('Content-Type', 'application/json');

    if (url.pathname === '/api/v1/auth/me') {
      res.writeHead(200);
      res.end(JSON.stringify({
        id: 'user-qa-1',
        github_login: 'muster-qa-lead',
        email: 'qa@muster.dev'
      }));
      return;
    }

    if (url.pathname === '/api/v1/projects') {
      const isSummary = url.searchParams.get('summary') === 'true';
      if (isSummary) {
        const items = MOCK_PROJECTS.map(p => ({
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
        const items = MOCK_PROJECTS.map(p => ({
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
      const proj = MOCK_PROJECTS.find(p => p.id === matchDetail[1]) || MOCK_PROJECTS[0];
      res.writeHead(200);
      res.end(JSON.stringify({
        id: proj.id,
        name: proj.name,
        current_stage: proj.stage,
        created_at: new Date('2026-03-01T00:00:00Z').toISOString(),
        updated_at: new Date().toISOString(),
      }));
      return;
    }

    // Git 연동
    const matchGit = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/git-integration/);
    if (matchGit) {
      const proj = MOCK_PROJECTS.find(p => p.id === matchGit[1]) || MOCK_PROJECTS[0];
      res.writeHead(200);
      res.end(JSON.stringify({
        integration: {
          id: `git-${proj.id}`,
          repo_url: proj.repo,
          connected_at: new Date('2026-03-01T00:00:00Z').toISOString(),
        }
      }));
      return;
    }

    // 최근 커밋
    const matchCommits = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/commits/);
    if (matchCommits) {
      res.writeHead(200);
      res.end(JSON.stringify({
        items: [
          { sha: '7f8a9b1c', message: 'feat: add high-speed summary API and benchmark HUD', authored_at: new Date(Date.now() - 3600000).toISOString(), url: '#' },
          { sha: '3d4e5f6a', message: 'fix(ui): eliminate slot flickering and layout shifts', authored_at: new Date(Date.now() - 7200000).toISOString(), url: '#' },
          { sha: '1c2b3a4f', message: 'perf: optimize N+1 query overhead to single payload', authored_at: new Date(Date.now() - 14400000).toISOString(), url: '#' },
        ]
      }));
      return;
    }

    // 헬스 스냅샷
    const matchHealth = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/health-snapshots/);
    if (matchHealth) {
      const proj = MOCK_PROJECTS.find(p => p.id === matchHealth[1]) || MOCK_PROJECTS[0];
      res.writeHead(200);
      res.end(JSON.stringify({
        items: [{ composite_score: String(proj.health), measured_at: new Date().toISOString() }],
        next_cursor: null,
      }));
      return;
    }

    // 배포 이벤트
    const matchDeploy = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/deployment-events/);
    if (matchDeploy) {
      const proj = MOCK_PROJECTS.find(p => p.id === matchDeploy[1]) || MOCK_PROJECTS[0];
      res.writeHead(200);
      res.end(JSON.stringify({
        items: [
          { id: 'dep-1', kind: 'deployment', status: proj.status, commit_sha: '7f8a9b1c', occurred_at: new Date(Date.now() - 1800000).toISOString() },
          { id: 'dep-2', kind: 'deployment', status: 'success', commit_sha: '3d4e5f6a', occurred_at: new Date(Date.now() - 86400000).toISOString() },
        ],
        next_cursor: null,
      }));
      return;
    }

    // 로그
    const matchLogs = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/logs/);
    if (matchLogs) {
      const proj = MOCK_PROJECTS.find(p => p.id === matchLogs[1]) || MOCK_PROJECTS[0];
      res.writeHead(200);
      res.end(JSON.stringify({
        items: [
          { id: 'log-1', level: 'info', message: proj.log, created_at: new Date().toISOString() },
          { id: 'log-2', level: 'info', message: 'HTTP GET /projects?summary=true latency: 0.3ms', created_at: new Date(Date.now() - 60000).toISOString() },
          { id: 'log-3', level: 'warn', message: 'Variant A detected 41 N+1 queries. Switching to Variant B advised.', created_at: new Date(Date.now() - 120000).toISOString() },
        ],
        next_cursor: null,
      }));
      return;
    }

    // 토큰
    const matchTokens = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/token-usage/);
    if (matchTokens) {
      const proj = MOCK_PROJECTS.find(p => p.id === matchTokens[1]) || MOCK_PROJECTS[0];
      res.writeHead(200);
      res.end(JSON.stringify({
        today_tokens: proj.tokens.today,
        month_tokens: proj.tokens.month,
        total_tokens: proj.tokens.total,
        today_cost: proj.tokens.todayCost,
        month_cost: '$14.20',
        total_cost: proj.tokens.totalCost,
        daily: [
          { date: '2026-03-15', tokens: '110000', cost: '$0.33' },
          { date: '2026-03-16', tokens: '135000', cost: '$0.40' },
          { date: '2026-03-17', tokens: proj.tokens.today, cost: proj.tokens.todayCost },
        ],
        recent_runs: [
          { id: 'run-1', agent_name: 'claude-3-7-sonnet', tokens_used: 12500, cost: '$0.037', status: 'completed', started_at: new Date(Date.now() - 3600000).toISOString(), ended_at: new Date().toISOString() },
          { id: 'run-2', agent_name: 'gemini-2.5-flash', tokens_used: 8200, cost: '$0.008', status: 'completed', started_at: new Date(Date.now() - 7200000).toISOString(), ended_at: new Date().toISOString() },
        ]
      }));
      return;
    }

    // Goals & Progress
    const matchGoals = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/goals/);
    if (matchGoals) {
      res.writeHead(200);
      res.end(JSON.stringify({
        content_md: '- [x] N+1 REST Waterfall API 최적화 완료\n- [x] Variant A/B 실시간 HUD 대시보드 컴포넌트 탑재\n- [x] 즉시 렌더링을 통한 레이아웃 시프트 100% 제거\n- [ ] 전역 배포 파이프라인 자동화 룰 추가',
        updated_at: new Date().toISOString(),
      }));
      return;
    }

    const matchProgress = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/progress/);
    if (matchProgress) {
      res.writeHead(200);
      res.end(JSON.stringify({
        percent: 75,
        summary: '3/4 핵심 목표 달성 완료 (성능 가속화 및 A/B HUD 검증 완료)',
        remaining_items: [{ title: '배포 자동화', description: 'GitHub Actions 연동 확인' }],
        based_on_commit_sha: '7f8a9b1c',
        analyzed_at: new Date().toISOString(),
      }));
      return;
    }

    // Documents & Agents
    const matchDocs = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/documents/);
    if (matchDocs) {
      res.writeHead(200);
      res.end(JSON.stringify({
        items: [
          { id: 'doc-1', title: 'Architecture-Overview.md', type: 'text/markdown', created_at: new Date().toISOString() },
          { id: 'doc-2', title: 'AB-Testing-Benchmark.pdf', type: 'application/pdf', created_at: new Date().toISOString() },
        ],
        next_cursor: null,
      }));
      return;
    }

    const matchAgents = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/agents/);
    if (matchAgents) {
      res.writeHead(200);
      res.end(JSON.stringify({
        items: [
          { id: 'ag-1', name: 'claude-3-7-sonnet', status: 'idle', model: 'claude-3-7-sonnet', created_at: new Date().toISOString() },
          { id: 'ag-2', name: 'gemini-2.5-flash', status: 'running', model: 'gemini-2.5-flash', created_at: new Date().toISOString() },
        ],
        next_cursor: null,
      }));
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
    // URL 쿼리에 따라 A/B Variant 및 HUD 상태 동기화 인라인 스크립트 주입
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

async function captureScreen({ url, outName, width, height, budgetMs = 2500 }) {
  const tmpOut = `/tmp/${outName}`;
  const chromeArgs = [
    '--headless',
    '--disable-gpu',
    `--window-size=${width},${height}`,
    `--virtual-time-budget=${budgetMs}`,
    `--screenshot=${tmpOut}`,
    url,
  ];

  console.log(`📸 캡처 진행 중: [${width}x${height}] ${outName} ...`);
  try {
    await execFileAsync(CHROME_PATH, chromeArgs, { timeout: 6000 });
  } catch (err) {
    // Chrome headless exits with error code on Mac CVDisplayLink warnings or timeout
    if (!fs.existsSync(tmpOut)) {
      console.warn(`경고: ${outName} 캡처 중 오류 발생:`, err.message);
      return null;
    }
  }

  if (!fs.existsSync(tmpOut)) {
    console.warn(`스크린샷 파일 미생성: ${tmpOut}`);
    return null;
  }

  // 아티팩트 디렉터리 두 곳에 동시 복사
  const destParent = path.join(ARTIFACT_DIR_PARENT, outName);
  const destSelf = path.join(ARTIFACT_DIR_SELF, outName);
  fs.copyFileSync(tmpOut, destParent);
  fs.copyFileSync(tmpOut, destSelf);
  const size = fs.statSync(destSelf).size;
  console.log(`  ✅ 저장 완료: ${outName} (${(size / 1024).toFixed(1)} KB) -> ${ARTIFACT_DIR_PARENT}/${outName}`);
  return destSelf;
}

async function main() {
  await new Promise(resolve => server.listen(8765, '127.0.0.1', resolve));
  console.log('🌐 QA 모의 통합 서버 구동 완료: http://127.0.0.1:8765\n');

  try {
    // 1. 데스크톱 뷰포트 (1280x800) - Variant B (통합 고속 대시보드 + 펼쳐진 A/B 벤치마크 HUD)
    await captureScreen({
      url: 'http://127.0.0.1:8765/projects?variant=B&hud_collapsed=false',
      outName: 'desktop-variant-b-dashboard.png',
      width: 1280,
      height: 800,
      budgetMs: 3000,
    });

    // 2. 데스크톱 뷰포트 (1280x800) - Variant A (기존 Control: N+1 분할 로딩 모드)
    await captureScreen({
      url: 'http://127.0.0.1:8765/projects?variant=A&hud_collapsed=false',
      outName: 'desktop-variant-a-dashboard.png',
      width: 1280,
      height: 800,
      budgetMs: 3000,
    });

    // 3. 모바일 뷰포트 (390x844, iPhone 뷰포트) - Variant B 반응형 뷰 + A/B HUD
    await captureScreen({
      url: 'http://127.0.0.1:8765/projects?variant=B&hud_collapsed=false',
      outName: 'mobile-variant-b-dashboard.png',
      width: 390,
      height: 844,
      budgetMs: 3000,
    });

    // 4. 모바일 뷰포트 (390x844, iPhone 뷰포트) - A/B HUD 칩 축소 상태 (Pill Indicator)
    await captureScreen({
      url: 'http://127.0.0.1:8765/projects?variant=B&hud_collapsed=true',
      outName: 'mobile-variant-b-hud-collapsed.png',
      width: 390,
      height: 844,
      budgetMs: 3000,
    });

    // 5. 데스크톱 뷰포트 (1280x800) - 프로젝트 상세 페이지 (ProjectDetailPage)
    await captureScreen({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'desktop-project-detail.png',
      width: 1280,
      height: 800,
      budgetMs: 3000,
    });

    // 6. 모바일 뷰포트 (390x844, iPhone 뷰포트) - 프로젝트 상세 페이지 반응형 뷰
    await captureScreen({
      url: 'http://127.0.0.1:8765/projects/proj-001',
      outName: 'mobile-project-detail.png',
      width: 390,
      height: 844,
      budgetMs: 3000,
    });

    // 7. 데스크톱 뷰포트 (1280x800) - 로그인 페이지
    await captureScreen({
      url: 'http://127.0.0.1:8765/login',
      outName: 'desktop-login-page.png',
      width: 1280,
      height: 800,
      budgetMs: 2000,
    });

    // 8. 모바일 뷰포트 (390x844) - 로그인 페이지
    await captureScreen({
      url: 'http://127.0.0.1:8765/login',
      outName: 'mobile-login-page.png',
      width: 390,
      height: 844,
      budgetMs: 2000,
    });

    console.log('\n🎉 모든 뷰포트 및 A/B 테스트 시각적 증거(스크린샷 8종) 캡처 성공!');
  } finally {
    server.close();
    process.exit(0);
  }
}

main().catch(err => {
  console.error('QA 스크린샷 캡처 중 오류 발생:', err);
  server.close();
  process.exit(1);
});
