/**
 * A/B 테스트 및 성능 벤치마크 측정 스크립트
 * 
 * Variant A (Control): 기존 N+1 개별 엔드포인트 호출 (1 목록 + N*4 세부 조회)
 * Variant B (Treatment): 단일 고속 요약 엔드포인트 (/projects?summary=true)
 */
import http from 'node:http';
import { performance } from 'node:perf_hooks';

export const MOCK_PROJECTS = [
  { id: 'proj-001', name: 'muster-api-server', stage: 'production', repo: 'https://github.com/muster-dev/muster-api', health: 98, status: 'success', log: 'Deployment v2.4.1 completed successfully', tokens: { today: '142500', month: '3820000', total: '15200000', todayCost: '$0.428', totalCost: '$45.60' }, agents: ['claude-3-7-sonnet', 'gemini-2.5-flash'] },
  { id: 'proj-002', name: 'agent-runtime-core', stage: 'production', repo: 'https://github.com/muster-dev/agent-runtime', health: 95, status: 'success', log: 'Container healthcheck passed (12/12)', tokens: { today: '328400', month: '9420000', total: '41200000', todayCost: '$0.985', totalCost: '$123.60' }, agents: ['gpt-4.5', 'claude-3-7-sonnet'] },
  { id: 'proj-003', name: 'workflow-orchestrator', stage: 'staging', repo: 'https://github.com/muster-dev/workflow-orchestrator', health: 88, status: 'running', log: 'DAG compile warning in task-7', tokens: { today: '89100', month: '2100000', total: '8400000', todayCost: '$0.267', totalCost: '$25.20' }, agents: ['claude-3-7-sonnet'] },
  { id: 'proj-004', name: 'token-cost-analyzer', stage: 'production', repo: 'https://github.com/muster-dev/token-cost-analyzer', health: 99, status: 'success', log: 'Hourly aggregate batch committed', tokens: { today: '54200', month: '1650000', total: '6200000', todayCost: '$0.163', totalCost: '$18.60' }, agents: ['gemini-2.5-flash'] },
  { id: 'proj-005', name: 'lakehouse-connector', stage: 'development', repo: 'https://github.com/muster-dev/lakehouse-connector', health: 76, status: 'failed', log: 'Connection timeout to Iceberg catalog', tokens: { today: '21000', month: '820000', total: '2900000', todayCost: '$0.063', totalCost: '$8.70' }, agents: ['claude-3-5-haiku'] },
  { id: 'proj-006', name: 'dbt-bigquery-pipeline', stage: 'staging', repo: 'https://github.com/muster-dev/dbt-pipeline', health: 91, status: 'success', log: 'dbt test: 48 passed, 0 failures', tokens: { today: '124000', month: '3100000', total: '11900000', todayCost: '$0.372', totalCost: '$35.70' }, agents: ['claude-3-7-sonnet', 'gemini-2.5-flash'] },
  { id: 'proj-007', name: 'realtime-event-ingest', stage: 'production', repo: 'https://github.com/muster-dev/event-ingest', health: 94, status: 'success', log: 'Kafka consumer group rebalanced', tokens: { today: '412000', month: '12400000', total: '58000000', todayCost: '$1.236', totalCost: '$174.00' }, agents: ['gpt-4.5'] },
  { id: 'proj-008', name: 'security-audit-scanner', stage: 'development', repo: 'https://github.com/muster-dev/security-scanner', health: 82, status: 'warning', log: '3 medium CVE alerts identified in npm tree', tokens: { today: '35600', month: '980000', total: '3400000', todayCost: '$0.107', totalCost: '$10.20' }, agents: ['claude-3-7-sonnet'] },
  { id: 'proj-009', name: 'antigravity-bridge-cli', stage: 'production', repo: 'https://github.com/muster-dev/antigravity-bridge', health: 97, status: 'success', log: 'Hooks sync verified across 8 workspaces', tokens: { today: '68000', month: '1940000', total: '7600000', todayCost: '$0.204', totalCost: '$22.80' }, agents: ['claude-3-7-sonnet', 'claude-3-5-haiku'] },
  { id: 'proj-010', name: 'metrics-dashboard-web', stage: 'production', repo: 'https://github.com/muster-dev/dashboard-web', health: 96, status: 'success', log: 'Production bundle v1.8.0 cached', tokens: { today: '185000', month: '4950000', total: '19800000', todayCost: '$0.555', totalCost: '$59.40' }, agents: ['claude-3-7-sonnet'] },
];

/**
 * 모의 HTTP 서버를 임시 생성하여 실제 네트워크 소켓/HTTP 파서 상에서 정량 측정
 */
export async function runBenchmark() {
  console.log('======================================================================');
  console.log('🚀 Muster A/B 테스트 & 정량 성능 벤치마크 (수석 QA 검증)');
  console.log('======================================================================\n');

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.setHeader('Content-Type', 'application/json');

    if (url.pathname === '/api/v1/auth/me') {
      res.writeHead(200);
      res.end(JSON.stringify({ id: 'user-qa-1', github_login: 'muster-qa-lead', email: 'qa@muster.dev' }));
      return;
    }

    if (url.pathname === '/api/v1/projects') {
      const isSummary = url.searchParams.get('summary') === 'true';
      if (isSummary) {
        // Variant B: 1회 고속 일괄 요약
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
        // Variant A: 기본 프로젝트 목록만 반환
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

    // Variant A의 N+1 개별 엔드포인트들
    const matchHealth = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/health-snapshots/);
    if (matchHealth) {
      const proj = MOCK_PROJECTS.find(p => p.id === matchHealth[1]);
      res.writeHead(200);
      res.end(JSON.stringify({
        items: proj ? [{ composite_score: String(proj.health), measured_at: new Date().toISOString() }] : [],
        next_cursor: null,
      }));
      return;
    }

    const matchDeploy = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/deployment-events/);
    if (matchDeploy) {
      const proj = MOCK_PROJECTS.find(p => p.id === matchDeploy[1]);
      res.writeHead(200);
      res.end(JSON.stringify({
        items: proj ? [{ kind: 'deployment', status: proj.status, commit_sha: 'a1b2c3d', occurred_at: new Date().toISOString() }] : [],
        next_cursor: null,
      }));
      return;
    }

    const matchLogs = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/logs/);
    if (matchLogs) {
      const proj = MOCK_PROJECTS.find(p => p.id === matchLogs[1]);
      res.writeHead(200);
      res.end(JSON.stringify({
        items: proj ? [{ message: proj.log, created_at: new Date().toISOString() }] : [],
        next_cursor: null,
      }));
      return;
    }

    const matchTokens = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/token-usage/);
    if (matchTokens) {
      const proj = MOCK_PROJECTS.find(p => p.id === matchTokens[1]);
      res.writeHead(200);
      res.end(JSON.stringify(proj ? {
        today_tokens: proj.tokens.today,
        month_tokens: proj.tokens.month,
        total_tokens: proj.tokens.total,
        today_cost: proj.tokens.todayCost,
        month_cost: '$12.50',
        total_cost: proj.tokens.totalCost,
      } : {}));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function fetchWithStats(path) {
    const t0 = performance.now();
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'Muster-QA' }
    });
    const text = await res.text();
    const duration = performance.now() - t0;
    const headerBytes = [...res.headers.entries()].reduce((acc, [k, v]) => acc + k.length + v.length + 4, 0);
    const bodyBytes = Buffer.byteLength(text, 'utf8');
    const json = JSON.parse(text);
    return { status: res.status, duration, bytes: headerBytes + bodyBytes, bodyBytes, json };
  }

  // -------------------------------------------------------------
  // Variant A: 기존 점진적 N+1 폭포수 (Waterfall) 측정
  // -------------------------------------------------------------
  console.log('▶ [Variant A - Control] 측정 시작: N+1 개별 호출 패턴...');
  const aStart = performance.now();
  let aTotalBytes = 0;
  let aRequestCount = 0;
  let aLayoutShifts = 0;

  // 1) 초기 프로젝트 목록 호출
  const aListRes = await fetchWithStats('/api/v1/projects?limit=50');
  aRequestCount++;
  aTotalBytes += aListRes.bytes;
  const projectList = aListRes.json.items;

  // 2) 브라우저 동시성 제한(HTTP/1.1 브라우저 기본 호스트당 6개 소켓 풀)을 모사하여 배치 병렬 처리
  const CONCURRENCY_LIMIT = 6;
  const slotRequests = [];
  for (const p of projectList) {
    slotRequests.push(() => fetchWithStats(`/api/v1/projects/${p.id}/health-snapshots?limit=1`));
    slotRequests.push(() => fetchWithStats(`/api/v1/projects/${p.id}/deployment-events?limit=10`));
    slotRequests.push(() => fetchWithStats(`/api/v1/projects/${p.id}/logs?limit=1`));
    slotRequests.push(() => fetchWithStats(`/api/v1/projects/${p.id}/token-usage?tz=Asia%2FSeoul`));
  }

  // 브라우저 큐 실행 시뮬레이션
  const results = [];
  for (let i = 0; i < slotRequests.length; i += CONCURRENCY_LIMIT) {
    const batch = slotRequests.slice(i, i + CONCURRENCY_LIMIT).map(fn => fn());
    const batchRes = await Promise.all(batch);
    for (const r of batchRes) {
      aRequestCount++;
      aTotalBytes += r.bytes;
      aLayoutShifts++; // 각 슬롯이 로딩('···')에서 실제 값으로 변환될 때마다 리렌더링 및 시프트 발생
      results.push(r);
    }
  }
  const aDuration = performance.now() - aStart;

  // -------------------------------------------------------------
  // Variant B: 신규 통합 고속 요약 (Treatment) 측정
  // -------------------------------------------------------------
  console.log('▶ [Variant B - Treatment] 측정 시작: GET /projects?summary=true...');
  const bStart = performance.now();
  const bRes = await fetchWithStats('/api/v1/projects?summary=true&limit=50&tz=Asia%2FSeoul');
  const bDuration = performance.now() - bStart;
  const bRequestCount = 1;
  const bTotalBytes = bRes.bytes;
  const bLayoutShifts = 0; // 초기 마운트 시 모든 필드가 즉시 확정되어 슬롯 깜빡임 0회

  await new Promise(resolve => server.close(resolve));

  // -------------------------------------------------------------
  // 정량 지표 계산 및 리포트 작성
  // -------------------------------------------------------------
  const speedup = (aDuration / bDuration).toFixed(2);
  const reqReduction = (((aRequestCount - bRequestCount) / aRequestCount) * 100).toFixed(1);
  const payloadReduction = (((aTotalBytes - bTotalBytes) / aTotalBytes) * 100).toFixed(1);
  const shiftReduction = (((aLayoutShifts - bLayoutShifts) / aLayoutShifts) * 100).toFixed(1);

  const report = {
    projectsCount: projectList.length,
    variantA: {
      name: 'Variant A (Control: N+1 점진적 로딩)',
      requests: aRequestCount,
      durationMs: Number(aDuration.toFixed(1)),
      totalBytes: aTotalBytes,
      layoutShifts: aLayoutShifts,
      description: '1회 프로젝트 목록 + 카드당 4회 서브엔드포인트 호출 (1 + 4*N)',
    },
    variantB: {
      name: 'Variant B (Treatment: 단일 고속 요약)',
      requests: bRequestCount,
      durationMs: Number(bDuration.toFixed(1)),
      totalBytes: bTotalBytes,
      layoutShifts: bLayoutShifts,
      description: '단 1회 GET /projects?summary=true 단일 호출로 헬스·배포·토큰·로그 즉시 렌더링',
    },
    comparison: {
      speedupFactor: `${speedup}x`,
      requestReductionPercent: `${reqReduction}%`,
      networkOverheadSavedPercent: `${payloadReduction}%`,
      layoutShiftReductionPercent: `${shiftReduction}%`,
    },
  };

  console.log('\n======================================================================');
  console.log('📊 벤치마크 정량 측정 결과 요약');
  console.log('======================================================================');
  console.table({
    '지표 (Metric)': {
      'Variant A (기존 Control)': 'N+1 Waterfall 방식',
      'Variant B (개선 Treatment)': '단일 요약 API 방식',
      '개선 성과 (Improvement)': 'A/B 비교 결과',
    },
    'HTTP 요청 수 (Requests)': {
      'Variant A (기존 Control)': `${report.variantA.requests} 개`,
      'Variant B (개선 Treatment)': `${report.variantB.requests} 개`,
      '개선 성과 (Improvement)': `${report.comparison.requestReductionPercent} 감소`,
    },
    '총 로딩 소요 시간 (Duration)': {
      'Variant A (기존 Control)': `${report.variantA.durationMs} ms`,
      'Variant B (개선 Treatment)': `${report.variantB.durationMs} ms`,
      '개선 성과 (Improvement)': `${report.comparison.speedupFactor} 속도 향상`,
    },
    '네트워크 오버헤드 (Total Bytes)': {
      'Variant A (기존 Control)': `${report.variantA.totalBytes.toLocaleString()} B`,
      'Variant B (개선 Treatment)': `${report.variantB.totalBytes.toLocaleString()} B`,
      '개선 성과 (Improvement)': `${report.comparison.networkOverheadSavedPercent} 대역폭 절감`,
    },
    '슬롯 깜빡임 / 레이아웃 시프트': {
      'Variant A (기존 Control)': `${report.variantA.layoutShifts} 회 (다단 깜빡임)`,
      'Variant B (개선 Treatment)': `${report.variantB.layoutShifts} 회 (즉시 렌더링)`,
      '개선 성과 (Improvement)': `${report.comparison.layoutShiftReductionPercent} 레이아웃 안정화`,
    },
  });

  return report;
}

if (process.argv[1]?.endsWith('benchmark-ab-test.mjs')) {
  runBenchmark()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
