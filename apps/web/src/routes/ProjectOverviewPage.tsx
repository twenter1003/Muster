import { useMemo, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { HealthIndicator } from '../components/HealthIndicator';
import { LogRow } from '../components/LogRow';
import { StageBadge } from '../components/StageBadge';
import { StatusBadge } from '../components/StatusBadge';
import type { ApiError } from '../lib/api';
import type { Page as ApiPage } from '../lib/api';
import { useApi } from '../lib/useApi';
import {
  BUILD_STATUSES,
  EM_DASH,
  HEALTH_MAX,
  LOG_LEVELS,
  PROJECT_STAGES,
  isHealthSignal,
  type BuildStatus,
  type LogLevel,
  type Measurable,
  type ProjectStage,
} from '../lib/domain';
import './ProjectOverviewPage.css';

/* ─────────────────────────── 서버 응답 타입 ───────────────────────────
 * 전부 각 컨트롤러의 toView를 읽어 옮긴 것이다. 추측한 필드는 없다.
 * 값 집합(build_status·stage·level)은 서버가 문자열로 내보내므로 여기서 좁힌다 —
 * 서버가 새 값을 추가하면 화면이 조용히 깨지는 대신 알 수 없는 값으로 표시된다.
 */

interface ProjectView {
  id: string;
  name: string;
  current_stage: string;
  created_at: string;
  updated_at: string;
}

interface DocumentView {
  id: string;
  title: string;
  type: string;
  upload_status: string;
  commit_ref: string | null;
  created_at: string;
}

/** 설계서 Part 4 §8의 감사 기록. project_name은 서버가 조인해 실어 준다. */
interface AuditLogView {
  id: string;
  action: string;
  created_at: string;
}

interface AgentView {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface BudgetUsage {
  token_limit: string | null;
  cost_limit: string | null;
  alert_threshold_pct: string;
  used_tokens: string;
  used_cost: string;
  token_usage_pct: number | null;
  cost_usage_pct: number | null;
  updated_at: string | null;
}

interface EnvConfigView {
  id: string;
  template_id: string | null;
  build_status: string;
  stack_config: Record<string, unknown>;
  created_at: string;
}

interface EnvConfigDetail extends EnvConfigView {
  docker_config: Record<string, unknown>;
}

interface PolicyCheckView {
  id: string;
  tool: string;
  verdict: string;
  risk_notes: string | null;
  checked_at: string;
}

interface HealthSnapshotView {
  id: string;
  deploy_freq_score: number | null;
  lead_time_score: number | null;
  change_fail_score: number | null;
  mttr_score: number | null;
  composite_score: string;
  measured_at: string;
}

interface LogView {
  id: string;
  agent_id: string | null;
  level: string;
  message: string;
  created_at: string;
}

interface StageHistoryView {
  id: string;
  stage: string;
  entered_at: string;
}

interface ApiKeyLike {
  id: string;
}

/* ─────────────────────────── 탭 ─────────────────────────── */

const TABS = [
  { id: 'overview', label: '개요' },
  { id: 'docs', label: '문서' },
  { id: 'env', label: '환경 구성' },
  { id: 'agents', label: '에이전트' },
  { id: 'logs', label: '로그' },
  { id: 'stages', label: '단계 이력' },
  { id: 'audit', label: '감사' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const isTabId = (value: string | null): value is TabId =>
  value !== null && TABS.some((t) => t.id === value);

/* ─────────────────────────── 표시 헬퍼 ─────────────────────────── */

const asStage = (value: string): ProjectStage | null =>
  (PROJECT_STAGES as readonly string[]).includes(value) ? (value as ProjectStage) : null;

const asBuildStatus = (value: string): BuildStatus | null =>
  (BUILD_STATUSES as readonly string[]).includes(value) ? (value as BuildStatus) : null;

const asLogLevel = (value: string): LogLevel | null =>
  (LOG_LEVELS as readonly string[]).includes(value) ? (value as LogLevel) : null;

const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(new Date(iso));

const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

const formatTime = (iso: string): string =>
  new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));

/** 문자열 숫자(NUMERIC 컬럼)는 빈 값일 수 있다. 0과 —를 섞지 않기 위해 null을 유지한다. */
const parseNumeric = (value: string | null): Measurable<number> => {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * 탭 숫자 배지용 개수. 서버가 total을 주지 않고 커서 페이지만 주므로
 * 한 페이지(최대 100)를 받아 세고, 더 있으면 "100+"로 정직하게 표기한다.
 * 왜 이렇게까지 하는가: 주석 5가 요구하는 것은 "탭을 열기 전에 안이 비었는지 아는 것"이고
 * 그 목적에는 정확한 총계가 아니라 0인지 아닌지와 대략의 규모면 충분하다.
 */
const COUNT_LIMIT = 100;

const countOf = (page: ApiPage<unknown> | null): string | null => {
  if (page === null) return null;
  return page.next_cursor === null ? String(page.items.length) : `${page.items.length}+`;
};

/* ─────────────────────── 환경 구성 → 서비스 카드 ─────────────────────── */

interface ServiceCard {
  key: string;
  role: string;
  name: string;
  detail: string;
  /** 도커 컨테이너가 아니라 외부 의존인가(주석 2 — 점선 카드). */
  external: boolean;
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * compose YAML의 최상위 services 이름만 뽑는다.
 * 왜 정규식인가: 새 의존성(YAML 파서)을 들일 수 없고, 여기서 필요한 것은 값 트리가 아니라
 * "어떤 서비스가 있는가" 한 줄뿐이다. 실패하면 빈 배열을 주고 stack_config 쪽으로 되돌아간다.
 */
function composeServiceNames(compose: unknown): string[] {
  if (typeof compose !== 'string') return [];
  const lines = compose.split('\n');
  const start = lines.findIndex((l) => /^services:\s*$/.test(l));
  if (start < 0) return [];

  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // 들여쓰기가 끝나면 services 블록도 끝난다.
    const m = /^\s{2}([A-Za-z0-9_.-]+):\s*$/.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

/**
 * 서비스 카드를 만든다(주석 1).
 * stack_config는 사용자가 보낸 stack_input 그대로라 스키마가 고정돼 있지 않다. 그래서
 * (1) 알려진 키(language/framework/database/services)를 먼저 읽고
 * (2) 없으면 docker_config.compose의 서비스 이름으로 되돌아간다.
 * 둘 다 실패하면 카드를 만들지 않고 호출부가 "표시할 구성이 없다"고 적는다.
 */
function toServiceCards(stack: Record<string, unknown>, docker: Record<string, unknown> | null) {
  const cards: ServiceCard[] = [];

  const language = str(stack.language);
  const framework = str(stack.framework);
  if (language !== null || framework !== null) {
    cards.push({
      key: 'app',
      role: 'app',
      name: framework ?? language ?? EM_DASH,
      detail: [language, str(stack.port)].filter((v): v is string => v !== null).join(' · '),
      external: false,
    });
  }

  const database = str(stack.database);
  if (database !== null) {
    cards.push({ key: 'db', role: 'db', name: database, detail: '', external: false });
  }

  const extras = Array.isArray(stack.extra_services) ? stack.extra_services : [];
  for (const extra of extras) {
    const name = str(extra);
    if (name !== null) {
      cards.push({ key: `extra:${name}`, role: 'service', name, detail: '', external: false });
    }
  }

  if (cards.length === 0) {
    for (const name of composeServiceNames(docker?.compose)) {
      cards.push({
        key: `compose:${name}`,
        role: 'service',
        name,
        detail: 'compose',
        external: false,
      });
    }
  }

  /*
   * GCS는 구성에 적혀 있든 아니든 항상 있다 — 문서 업로드가 signed URL로 GCS에 직접 올린다
   * (DocStore). 컨테이너가 아니므로 점선 카드로 분리한다.
   */
  if (cards.length > 0) {
    cards.push({
      key: 'storage',
      role: 'storage',
      name: 'GCS 버킷',
      detail: 'docs/ · signed URL',
      external: true,
    });
  }

  return cards;
}

/**
 * 현재 build_status에 이르는 경로(주석 3).
 * 지금 succeeded여도 policy_blocked를 거쳤는지 아닌지가 디버깅에 필요하므로,
 * 상태 하나가 아니라 상태 전이도의 경로를 문자열로 남긴다.
 * (서버가 전이 이력을 따로 주지 않아 상태 기계에서 역산한다 — 아래 "확신하지 못한 것" 참고.)
 */
function transitionPath(status: BuildStatus): BuildStatus[] {
  switch (status) {
    case 'generated':
      return ['generated'];
    case 'policy_passed':
    case 'policy_blocked':
      return ['generated', status];
    case 'approved':
    case 'rejected':
      return ['generated', 'policy_passed', status];
    case 'running':
      return ['generated', 'policy_passed', 'approved', 'running'];
    case 'succeeded':
    case 'failed':
      return ['generated', 'policy_passed', 'approved', 'running', status];
  }
}

/* ─────────────────────────── 공용 조각 ─────────────────────────── */

function Card({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel po-card">
      <h2 className="po-card__head">
        {title}
        {aside !== undefined && <span className="po-card__aside">{aside}</span>}
      </h2>
      <div className="panel__body">{children}</div>
    </section>
  );
}

/**
 * 부속 호출 하나가 실패해도 화면 전체가 무너지지 않게, 카드 안쪽만 상태 문구로 바꾼다.
 * 로딩·오류·빈 목록을 한 자리에서 처리해 화면마다 다른 문구가 나오는 것을 막는다.
 */
function Async<T>({
  state,
  empty,
  children,
}: {
  state: { data: T | null; error: ApiError | null; loading: boolean };
  empty?: string;
  children: (data: T) => ReactNode;
}) {
  if (state.loading && state.data === null) return <p className="meta po-note">불러오는 중…</p>;
  if (state.error !== null) {
    return <p className="meta po-note po-note--signal">불러오지 못했다 — {state.error.message}</p>;
  }
  if (state.data === null) return <p className="meta po-note">{empty ?? '자료가 없다.'}</p>;
  return <>{children(state.data)}</>;
}

/* ─────────────────────────── 화면 ─────────────────────────── */

export function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();

  /*
   * 탭 상태를 URL에 둔다 — 새로고침·링크 공유가 깨지지 않아야 하기 때문이다.
   * 알 수 없는 값(?tab=xxx)은 개요로 되돌린다. 오류 화면을 낼 일이 아니다.
   */
  const rawTab = params.get('tab');
  const tab: TabId = isTabId(rawTab) ? rawTab : 'overview';
  const selectTab = (next: TabId) => {
    const copy = new URLSearchParams(params);
    if (next === 'overview') copy.delete('tab');
    else copy.set('tab', next);
    setParams(copy, { replace: true });
  };

  const projectPath = id === undefined ? null : `/projects/${id}`;
  const project = useApi<ProjectView>(projectPath);

  /*
   * ── 지연 로딩 ──
   * 설계서 화면↔API 매핑표의 "주의"대로 탭을 열 때 그 탭의 데이터를 부른다.
   * useApi는 path가 null이면 요청하지 않으므로, 활성 탭이 아닌 경로는 null로 둔다.
   * 예외가 둘 있고 그 판단은 아래 주석에 남긴다.
   */
  const on = (want: TabId, path: string): string | null =>
    id !== undefined && tab === want ? path : null;

  /*
   * 예외 1 — 탭 숫자 배지(주석 5)는 탭을 열기 전에 알아야 하므로 개수만 먼저 가져온다.
   * "열기 전에 비었는지 안다"가 요구사항이라 지연시키면 기능 자체가 사라진다.
   * 대신 본문 데이터가 아니라 개수 산정용 한 페이지만 받고, 탭을 열면 그 탭이 자기 조건
   * (필터·정렬)으로 다시 부른다. 두 번 부르는 비용보다 배지가 늦게 뜨는 쪽이 나쁘다.
   */
  const docCount = useApi<ApiPage<DocumentView>>(
    id === undefined ? null : `/projects/${id}/documents?limit=${COUNT_LIMIT}`,
  );
  const agentCount = useApi<ApiPage<AgentView>>(
    id === undefined ? null : `/projects/${id}/agents?limit=${COUNT_LIMIT}`,
  );

  // 예외 2 — 헤더 메타(API 키 수)는 탭과 무관하게 항상 보이는 자리라 함께 부른다.
  const apiKeys = useApi<ApiPage<ApiKeyLike>>(
    id === undefined ? null : `/projects/${id}/api-keys?limit=${COUNT_LIMIT}`,
  );

  // 개요 탭
  const envLatest = useApi<ApiPage<EnvConfigView>>(
    on('overview', `/projects/${id}/env-configs?limit=1`),
  );
  const latestEnvId = envLatest.data?.items[0]?.id ?? null;
  const envDetail = useApi<EnvConfigDetail>(
    latestEnvId === null ? null : `/env-configs/${latestEnvId}`,
  );
  const policyChecks = useApi<{ items: PolicyCheckView[] }>(
    latestEnvId === null ? null : `/env-configs/${latestEnvId}/policy-checks`,
  );
  const health = useApi<ApiPage<HealthSnapshotView>>(
    on('overview', `/projects/${id}/health-snapshots?limit=1`),
  );
  const budget = useApi<BudgetUsage>(
    id !== undefined && (tab === 'overview' || tab === 'agents') ? `/projects/${id}/budget` : null,
  );

  // 나머지 탭
  const docs = useApi<ApiPage<DocumentView>>(on('docs', `/projects/${id}/documents?limit=50`));
  const envConfigs = useApi<ApiPage<EnvConfigView>>(
    on('env', `/projects/${id}/env-configs?limit=20`),
  );
  const agents = useApi<ApiPage<AgentView>>(on('agents', `/projects/${id}/agents?limit=50`));
  const stages = useApi<ApiPage<StageHistoryView>>(
    on('stages', `/projects/${id}/stage-history?limit=50`),
  );

  // 감사 탭. 다른 탭과 같은 지연 로딩 규칙을 따른다 — 열 때 처음 부른다.
  const audit = useApi<ApiPage<AuditLogView>>(on('audit', `/projects/${id}/audit-logs?limit=50`));

  // 로그 레벨 필터도 URL에 남긴다 — "이 프로젝트의 error 로그" 링크가 성립해야 한다.
  const setLevel = (next: LogLevel | null) => {
    const copy = new URLSearchParams(params);
    if (next === null) copy.delete('level');
    else copy.set('level', next);
    setParams(copy, { replace: true });
  };
  const logLevel = asLogLevel(params.get('level') ?? '');
  const logs = useApi<ApiPage<LogView>>(
    on('logs', `/projects/${id}/logs?limit=50${logLevel !== null ? `&level=${logLevel}` : ''}`),
  );

  const tabCounts: Partial<Record<TabId, string | null>> = useMemo(
    () => ({ docs: countOf(docCount.data), agents: countOf(agentCount.data) }),
    [docCount.data, agentCount.data],
  );

  if (id === undefined) {
    return <p className="meta po-note po-note--signal">프로젝트 id가 없는 주소다.</p>;
  }

  /*
   * 서버는 비멤버에게도 404를 준다(존재 여부를 숨기기 위해). 그래서 "없음"과 "권한 없음"을
   * 구분해 적지 않는다 — 구분해 적으면 서버가 숨긴 사실을 화면이 흘리게 된다.
   */
  if (project.error !== null) {
    const notFound = project.error.status === 404;
    return (
      <section>
        <h1 className="po__title">프로젝트</h1>
        <p className="meta po-note po-note--signal">
          {notFound ? '프로젝트를 찾을 수 없다.' : `불러오지 못했다 — ${project.error.message}`}
        </p>
      </section>
    );
  }

  const stage = project.data === null ? null : asStage(project.data.current_stage);

  return (
    <section>
      <header className="po__header">
        <div>
          <div className="meta">프로젝트</div>
          <div className="po__title-row">
            <h1 className="po__title">{project.data?.name ?? EM_DASH}</h1>
            {stage !== null && <StageBadge stage={stage} />}
          </div>
          <div className="po__meta">
            <span>
              생성 {project.data === null ? EM_DASH : formatDate(project.data.created_at)}
            </span>
            <span>
              최근 변경 {project.data === null ? EM_DASH : formatDateTime(project.data.updated_at)}
            </span>
            <span>API 키 {countOf(apiKeys.data) ?? EM_DASH}</span>
          </div>
        </div>
        <div className="po__actions">
          <Button>수정</Button>
          {/*
            솔리드는 이 화면에서 하나뿐이다. 다만 실행 API(POST /agents/:id/runs)는 에이전트용
            API 키 인증이라 브라우저 세션으로는 부를 수 없어, 눌리는 척하지 않고 잠가 둔다.
          */}
          <Button
            variant="solid"
            disabled
            title="실행 API가 에이전트 전용 API 키 인증이라 웹에서 호출할 수 없다."
          >
            에이전트 실행
          </Button>
        </div>
      </header>

      <div className="po__tabs" role="tablist" aria-label="프로젝트 상세">
        {TABS.map((t) => {
          const count = tabCounts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="po__tab"
              aria-selected={tab === t.id}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
              {count !== undefined && count !== null && (
                <span className="po__tab-count">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="po__panel" role="tabpanel">
        {tab === 'overview' && (
          <div className="po__two-col">
            <div className="po__panel">
              <Card
                title="개발환경 구성"
                aside={
                  envLatest.data?.items[0] !== undefined
                    ? `build_status: ${envLatest.data.items[0].build_status}`
                    : undefined
                }
              >
                <Async state={envLatest} empty="아직 환경 구성이 없다.">
                  {(page) => {
                    const config = page.items[0];
                    if (config === undefined)
                      return <p className="meta po-note">아직 환경 구성이 없다.</p>;
                    return (
                      <EnvConfigCard
                        config={config}
                        docker={envDetail.data?.docker_config ?? null}
                        checks={policyChecks.data?.items ?? null}
                      />
                    );
                  }}
                </Async>
              </Card>
            </div>

            <div className="po__panel">
              <Card
                title="헬스 스코어"
                aside={
                  health.data?.items[0] !== undefined
                    ? `measured_at ${formatDateTime(health.data.items[0].measured_at)}`
                    : undefined
                }
              >
                <Async state={health} empty="헬스 스냅샷이 없다.">
                  {(page) => {
                    const snap = page.items[0];
                    if (snap === undefined) {
                      return (
                        <p className="meta po-note">
                          헬스 스냅샷이 없다 — GitHub 미연동 프로젝트는 계산되지 않는다.
                        </p>
                      );
                    }
                    return <HealthPanel snapshot={snap} />;
                  }}
                </Async>
              </Card>

              <Card title="예산">
                <Async state={budget}>{(b) => <BudgetPanel budget={b} />}</Async>
              </Card>
            </div>
          </div>
        )}

        {tab === 'docs' && (
          <Card title="문서" aside="DocStore">
            <Async state={docs}>
              {(page) =>
                page.items.length === 0 ? (
                  <p className="meta po-note">문서가 없다.</p>
                ) : (
                  <table className="table po-table">
                    <thead>
                      <tr>
                        <th>제목</th>
                        <th>타입</th>
                        <th>업로드</th>
                        <th>커밋</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.items.map((d) => (
                        <tr key={d.id}>
                          <td>{d.title}</td>
                          <td>
                            <span className="badge">{d.type}</span>
                          </td>
                          <td className="po-mono">{d.upload_status}</td>
                          <td className="po-mono">{d.commit_ref ?? EM_DASH}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </Async>
          </Card>
        )}

        {tab === 'env' && (
          <Async state={envConfigs}>
            {(page) =>
              page.items.length === 0 ? (
                <Card title="환경 구성">
                  <p className="meta po-note">아직 환경 구성이 없다.</p>
                </Card>
              ) : (
                <>
                  {page.items.map((config) => (
                    <Card
                      key={config.id}
                      title={formatDateTime(config.created_at)}
                      aside={`build_status: ${config.build_status}`}
                    >
                      {/* 목록 응답에는 docker_config가 없다(서버가 상세에만 싣는다). */}
                      <EnvConfigCard config={config} docker={null} checks={null} />
                    </Card>
                  ))}
                </>
              )
            }
          </Async>
        )}

        {tab === 'agents' && (
          <div className="po__panel">
            <Card title="에이전트" aside="AgentRegistry">
              <Async state={agents}>
                {(page) =>
                  page.items.length === 0 ? (
                    <p className="meta po-note">등록된 에이전트가 없다.</p>
                  ) : (
                    <div className="po-list">
                      {page.items.map((a) => (
                        <div className="po-list__row" key={a.id}>
                          <span className="po-mono">{a.name}</span>
                          <span>최근 변경 {formatDateTime(a.updated_at)}</span>
                        </div>
                      ))}
                    </div>
                  )
                }
              </Async>
            </Card>
            <Card title="예산">
              <Async state={budget}>{(b) => <BudgetPanel budget={b} />}</Async>
            </Card>
          </div>
        )}

        {tab === 'logs' && (
          <Card
            title="로그"
            aside={
              <span className="po-chips">
                {/* 필터도 URL에 남는다 — 링크로 "이 프로젝트의 error 로그"를 공유할 수 있어야 한다. */}
                <button
                  type="button"
                  className="chip po-chip"
                  aria-pressed={logLevel === null}
                  onClick={() => setLevel(null)}
                >
                  전체
                </button>
                {LOG_LEVELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className="chip po-chip"
                    aria-pressed={logLevel === l}
                    onClick={() => setLevel(l)}
                  >
                    {l}
                  </button>
                ))}
              </span>
            }
          >
            <Async state={logs}>
              {(page) =>
                page.items.length === 0 ? (
                  <p className="meta po-note">로그가 없다.</p>
                ) : (
                  <div>
                    {page.items.map((l) => (
                      <LogRow
                        key={l.id}
                        time={formatTime(l.created_at)}
                        level={asLogLevel(l.level) ?? 'info'}
                        message={l.message}
                      />
                    ))}
                  </div>
                )
              }
            </Async>
          </Card>
        )}

        {tab === 'stages' && (
          <Card title="단계 이력" aside="STAGE_HISTORY">
            <Async state={stages}>
              {(page) =>
                page.items.length === 0 ? (
                  <p className="meta po-note">단계 이력이 없다.</p>
                ) : (
                  <ol className="po-timeline">
                    {page.items.map((s, i) => {
                      const parsed = asStage(s.stage);
                      return (
                        <li className="po-timeline__item" key={s.id}>
                          <span
                            className={
                              i === 0
                                ? 'po-timeline__dot po-timeline__dot--current'
                                : 'po-timeline__dot'
                            }
                            aria-hidden="true"
                          />
                          <span>
                            {parsed !== null ? (
                              <StageBadge stage={parsed} />
                            ) : (
                              <span>{s.stage}</span>
                            )}{' '}
                            진입
                            <span className="po-timeline__time">
                              {formatDateTime(s.entered_at)}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )
              }
            </Async>
          </Card>
        )}

        {tab === 'audit' && (
          <Card title="감사" aside="AUDIT_LOGS">
            <Async state={audit}>
              {(page) =>
                page.items.length === 0 ? (
                  <p className="meta po-note">이 프로젝트에 기록된 행위가 없다.</p>
                ) : (
                  <ol className="po-timeline">
                    {page.items.map((a) => (
                      <li className="po-timeline__item" key={a.id}>
                        <span className="po-timeline__dot" aria-hidden="true" />
                        <span>
                          {/*
                            action을 그대로 보여 준다. `env_config.approve` 같은 값은 설계서
                            Part 3이 정한 닫힌 집합이고, 한국어로 옮기면 서버가 기록한 값과
                            화면의 표기가 갈라져 로그를 대조할 때 오히려 방해가 된다.
                          */}
                          <span className="po-mono">{a.action}</span>
                          <span className="po-timeline__time">{formatDateTime(a.created_at)}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )
              }
            </Async>
          </Card>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────── 하위 조각 ─────────────────────────── */

function EnvConfigCard({
  config,
  docker,
  checks,
}: {
  config: EnvConfigView;
  docker: Record<string, unknown> | null;
  checks: PolicyCheckView[] | null;
}) {
  const cards = toServiceCards(config.stack_config, docker);
  const status = asBuildStatus(config.build_status);

  return (
    <>
      {cards.length === 0 ? (
        <p className="meta po-note">구성에서 서비스를 읽지 못했다.</p>
      ) : (
        <div className="po-services">
          {cards.map((c) => (
            <div
              key={c.key}
              className={c.external ? 'po-service po-service--external' : 'po-service'}
            >
              <span className="po-service__role">{c.role}</span>
              <span className="po-service__name">{c.name}</span>
              <span className="po-service__detail">{c.detail === '' ? EM_DASH : c.detail}</span>
              {/* 점선(색·형태)만으로는 부족하다. 외부 의존이라는 사실을 글자로도 남긴다. */}
              {c.external && <span className="po-service__role">외부 의존</span>}
            </div>
          ))}
        </div>
      )}

      {checks !== null && checks.length > 0 && (
        <p className="meta po-note">
          Policy Gate —{' '}
          {checks.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ' · '}
              <span className="po-mono">
                {c.tool} {c.verdict}
              </span>
            </span>
          ))}
        </p>
      )}
      {checks !== null &&
        checks
          .filter((c) => c.risk_notes !== null)
          .map((c) => (
            <p className="meta po-note" key={`note-${c.id}`}>
              {c.tool}: {c.risk_notes}
            </p>
          ))}

      {/* 주석 3 — 지금 상태만이 아니라 여기까지 온 경로를 남긴다. */}
      {status !== null && (
        <div className="po-transition">
          {transitionPath(status).map((s, i, arr) => (
            <span key={s}>
              {i > 0 && <span aria-hidden="true"> {'>'} </span>}
              {i === arr.length - 1 ? <StatusBadge status={s} /> : s}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function HealthPanel({ snapshot }: { snapshot: HealthSnapshotView }) {
  const composite = parseNumeric(snapshot.composite_score);
  const signal = composite !== null && isHealthSignal(composite);

  // 도넛 둘레. 차트 라이브러리 없이 stroke-dasharray로만 그린다.
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const filled =
    composite === null ? 0 : (Math.min(composite, HEALTH_MAX) / HEALTH_MAX) * circumference;

  const metrics: Array<{ label: string; score: Measurable<number> }> = [
    { label: '배포 빈도', score: snapshot.deploy_freq_score },
    { label: '리드타임', score: snapshot.lead_time_score },
    { label: '변경 실패율', score: snapshot.change_fail_score },
    { label: 'MTTR', score: snapshot.mttr_score },
  ];

  return (
    <div className="po-health">
      {/*
        주석 4 — 도넛 하나로 끝내지 않는다. 도넛은 합산이고, 옆의 4지표가 "왜 그 값인지"다.
        도넛은 장식이라 aria-hidden으로 두고 의미는 옆의 숫자·막대가 전한다.
      */}
      <svg className="po-health__dial" viewBox="0 0 120 120" aria-hidden="true">
        <circle
          className="po-health__track"
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="12"
        />
        <circle
          className={signal ? 'po-health__arc po-health__arc--signal' : 'po-health__arc'}
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform="rotate(-90 60 60)"
        />
        <text className="po-health__value" x="60" y="58" textAnchor="middle" fontSize="24">
          {composite === null ? EM_DASH : composite.toFixed(1)}
        </text>
        <text className="po-health__caption" x="60" y="76" textAnchor="middle" fontSize="10">
          composite / {HEALTH_MAX}
        </text>
      </svg>
      <div className="po-health__metrics">
        <p className="meta po-note">
          composite {composite === null ? EM_DASH : composite.toFixed(1)} / {HEALTH_MAX}
        </p>
        {metrics.map((m) => (
          <div className="po-health__metric" key={m.label}>
            <span>{m.label}</span>
            <HealthIndicator score={m.score} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetPanel({ budget }: { budget: BudgetUsage }) {
  const pct = budget.cost_usage_pct;
  const threshold = Number(budget.alert_threshold_pct);
  const over = pct !== null && Number.isFinite(threshold) && pct >= threshold;

  return (
    <>
      <p className="meta po-note">
        비용 ${budget.used_cost} / {budget.cost_limit === null ? EM_DASH : `$${budget.cost_limit}`}{' '}
        · 토큰 {budget.used_tokens} / {budget.token_limit === null ? EM_DASH : budget.token_limit} ·
        임계치 {budget.alert_threshold_pct}%
      </p>
      {/* 한도가 없으면 막대를 그리지 않는다 — 0%로 그리면 "안 썼다"로 읽힌다. */}
      {pct !== null && (
        <div
          className="po-meter"
          role="img"
          aria-label={`비용 사용률 ${pct.toFixed(0)}%${over ? ' — 임계치 초과' : ''}`}
        >
          <span
            className={over ? 'po-meter__fill po-meter__fill--signal' : 'po-meter__fill'}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      )}
      {over && <p className="meta po-note po-note--signal">임계치 초과 — 예산을 확인해야 한다.</p>}
    </>
  );
}
