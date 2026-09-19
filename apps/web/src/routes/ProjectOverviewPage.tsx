import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { LogRow } from '../components/LogRow';
import { StageBadge } from '../components/StageBadge';
import { type Page as ApiPage } from '../lib/api';
import { ApiKeyModal } from '../components/ApiKeyModal';
import {
  Async,
  Card,
  asLogLevel,
  asStage,
  formatDate,
  formatDateTime,
  formatTime,
  type AgentView,
  type BudgetUsage,
  type DocumentView,
  type EnvConfigDetail,
  type EnvConfigView,
  type HealthSnapshotView,
  type PolicyCheckView,
  type ProjectView,
} from '../components/ProjectOverviewShared';
import { EnvConfigCard } from '../components/EnvConfigCard';
import { InstallWorkflowRow } from '../components/InstallWorkflowRow';
import { AgentRow } from '../components/AgentRow';
import { CreateAgentDialog } from '../components/CreateAgentDialog';
import { DeleteProjectCard } from '../components/DeleteProjectCard';
import { HealthPanel } from '../components/HealthPanel';
import { DocumentUpload } from '../components/DocumentUpload';
import { DocumentTable } from '../components/DocumentTable';
import { BudgetPanel } from '../components/BudgetPanel';
import { EditProjectDialog } from '../components/EditProjectDialog';
import { useApi } from '../lib/useApi';
import { useSse } from '../lib/useSse';
import { EM_DASH, LOG_LEVELS, type LogLevel } from '../lib/domain';
import './ProjectOverviewPage.css';

/* ─────────────────────────── 이 화면 전용 타입 ───────────────────────────
 * 여러 하위 컴포넌트가 함께 쓰는 타입(ProjectView, DocumentView 등)은
 * components/ProjectOverviewShared.tsx로 옮겼다. 이 화면에서만 쓰는 타입만 남는다.
 */

/** SSE `budget_alert` 페이로드 (common/events/domain-events.ts · BudgetThresholdExceededEvent). */
interface BudgetAlertEvent {
  project_id: string;
  metric: 'tokens' | 'cost';
  used: string;
  limit: string;
  usage_pct: number;
  threshold_pct: number;
  occurred_at: string;
}

/** 설계서 Part 4 §8의 감사 기록. project_name은 서버가 조인해 실어 준다. */
interface AuditLogView {
  id: string;
  action: string;
  created_at: string;
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
  const [editing, setEditing] = useState(false);
  const [managingKeys, setManagingKeys] = useState(false);

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

  /*
   * 예산 경보를 받으면 예산 카드를 다시 부른다.
   *
   * 넘어서는 순간은 이벤트로만 존재한다 — 서버는 임계치를 **넘는 순간에만** 발행하고,
   * 열려 있는 화면은 그때 이미 조회를 끝낸 뒤다. 새로고침하기 전까지 이 화면은 한도 아래로
   * 보이고, 그 사이에 실행이 계속 돈다.
   *
   * 배너를 따로 띄우지 않고 다시 부르는 쪽을 택했다. 경보 페이로드의 숫자로 화면을 고치면
   * 화면이 두 개의 진실(조회 결과와 이벤트)을 갖게 되고, 둘이 어긋날 때 어느 쪽이 맞는지
   * 화면 안에서는 알 수 없다. 다시 부르면 진실은 계속 하나다.
   */
  const budgetStream = useSse(id ?? null, 1);
  const alert = budgetStream.events.find((e) => e.type === 'budget_alert');
  const alertData = alert?.data as BudgetAlertEvent | undefined;
  // 재조회 열쇠. EventSource의 lastEventId는 서버가 id를 싣지 않아 빈 문자열이라 쓸 수 없다.
  const alertKey = alertData ? `${alertData.metric}:${alertData.occurred_at}` : null;
  const reloadBudget = budget.reload;
  useEffect(() => {
    if (alertKey !== null) reloadBudget();
  }, [alertKey, reloadBudget]);

  // 나머지 탭
  const docs = useApi<ApiPage<DocumentView>>(on('docs', `/projects/${id}/documents?limit=50`));
  const envConfigs = useApi<ApiPage<EnvConfigView>>(
    on('env', `/projects/${id}/env-configs?limit=20`),
  );
  const agents = useApi<ApiPage<AgentView>>(on('agents', `/projects/${id}/agents?limit=50`));
  const [creatingAgent, setCreatingAgent] = useState(false);
  const navigate = useNavigate();
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
            <button
              type="button"
              className="po__meta-link"
              onClick={() => setManagingKeys(true)}
              title="API 키 관리 열기"
            >
              API 키 {countOf(apiKeys.data) ?? EM_DASH} ⚙️
            </button>
          </div>
        </div>
        <div className="po__actions">
          <Button onClick={() => setManagingKeys(true)} disabled={project.data === null}>
            API 키 관리
          </Button>
          <Button onClick={() => setEditing(true)} disabled={project.data === null}>
            수정
          </Button>
          {/*
            실행 버튼은 여기 없다. POST /agents/:id/runs가 세션 인증도 받게 되면서 웹에서
            부를 수 있게 됐지만, 그 요청에는 **어느 에이전트인지**가 반드시 필요하다.
            화면 머리에 버튼 하나를 두면 그 대상을 화면이 임의로 고르게 되므로,
            에이전트 탭의 각 줄로 내려 보냈다.
          */}
        </div>
      </header>

      {project.data !== null && (
        <>
          <EditProjectDialog
            open={editing}
            project={project.data}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              // 저장된 값을 화면 상태에 직접 써넣지 않고 다시 읽는다. 서버가 updated_at 같은
              // 파생 값을 함께 바꾸므로, 응답만 믿고 일부만 갈아 끼우면 화면이 반쯤 낡는다.
              project.reload();
            }}
          />
          <ApiKeyModal
            open={managingKeys}
            projectId={project.data.id}
            projectName={project.data.name}
            onClose={() => setManagingKeys(false)}
            onKeysChanged={() => apiKeys.reload()}
          />
        </>
      )}

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

              {project.data !== null && <DeleteProjectCard project={project.data} />}
            </div>
          </div>
        )}

        {tab === 'docs' && (
          <Card title="문서" aside="DocStore">
            {id !== undefined && <DocumentUpload projectId={id} onUploaded={docs.reload} />}
            <Async state={docs}>
              {(page) =>
                page.items.length === 0 ? (
                  <p className="meta po-note">문서가 없다.</p>
                ) : (
                  <DocumentTable items={page.items} onChanged={docs.reload} />
                )
              }
            </Async>
          </Card>
        )}

        {tab === 'env' && (
          <>
            {/* 만드는 화면(/projects/:id/env/new)은 있었는데 들어가는 링크가 어디에도 없어
                주소를 직접 쳐야 했다. 시작점은 프로젝트 안이어야 한다 — 환경 구성은
                프로젝트에 달리고, 환경 카탈로그는 계정 전체를 보는 곳이라 "어느 프로젝트에"가 없다. */}
            <Card title="환경 구성" aside="EnvCatalog">
              <div className="po-listhead">
                <p className="meta">
                  언어·프레임워크·DB를 고르면 Docker 구성을 만들어 준다. 템플릿을 미리 만들어
                  두었다면 거기서 고를 수도 있다(환경 카탈로그).
                </p>
                <Button variant="solid" onClick={() => navigate(`/projects/${id}/env/new`)}>
                  새 환경 구성
                </Button>
              </div>
              {id !== undefined && <InstallWorkflowRow projectId={id} />}
            </Card>
            <Async state={envConfigs}>
              {(page) =>
                page.items.length === 0 ? (
                  <Card title="기록">
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
                        <EnvConfigCard
                          config={config}
                          docker={null}
                          checks={null}
                          retry={
                            id === undefined
                              ? undefined
                              : { projectId: id, onChanged: envConfigs.reload }
                          }
                        />
                      </Card>
                    ))}
                  </>
                )
              }
            </Async>
          </>
        )}

        {tab === 'agents' && (
          <div className="po__panel">
            <Card title="에이전트" aside="AgentRegistry">
              {/* 등록이 목록과 같은 카드에 있는 이유: 에이전트가 0개일 때 이 화면이 답해야 하는
                  물음은 "무엇이 있나"가 아니라 "어떻게 만드나"다. AgentRegistry 화면은 계정
                  전체를 보는 곳이라 "어느 프로젝트에"가 없어 등록을 둘 수 없다. */}
              {id !== undefined && (
                <div className="po-listhead">
                  <p className="meta">
                    에이전트를 등록하면 줄마다 실행 버튼이 생긴다. 설정은 나중에 채워도 된다.
                  </p>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <Button onClick={() => setManagingKeys(true)}>API 키 발급 및 연동</Button>
                    <Button variant="solid" onClick={() => setCreatingAgent(true)}>
                      에이전트 등록
                    </Button>
                  </div>
                </div>
              )}
              <Async state={agents}>
                {(page) =>
                  page.items.length === 0 ? (
                    <p className="meta po-note">등록된 에이전트가 없다.</p>
                  ) : (
                    <div className="po-list">
                      {page.items.map((a) => (
                        <AgentRow key={a.id} agent={a} />
                      ))}
                    </div>
                  )
                }
              </Async>
            </Card>
            <Card title="예산">
              <Async state={budget}>{(b) => <BudgetPanel budget={b} />}</Async>
            </Card>

            {creatingAgent && id !== undefined && (
              <CreateAgentDialog
                projectId={id}
                onClose={() => setCreatingAgent(false)}
                onCreated={() => {
                  setCreatingAgent(false);
                  agents.reload();
                  agentCount.reload();
                }}
              />
            )}
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
