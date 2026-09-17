import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { HealthIndicator } from '../components/HealthIndicator';
import { ApiKeyModal } from '../components/ApiKeyModal';
import { BenchmarkHud } from '../components/BenchmarkHud';
import { useBenchmark } from '../lib/benchmarkContext';
import { apiFetch, type Page } from '../lib/api';
import { EM_DASH, type Measurable } from '../lib/domain';
import { useApi } from '../lib/useApi';
import { formatCost, formatTokenCount } from '../lib/tokenIntelligence';
import {
  cleanRepoUrl,
  matchesSearch,
  matchesStatus,
  sortProjects,
  type ProjectListItemLike,
  type SortOptionType,
  type StatusFilterType,
} from '../lib/projectListUtils';
import './ProjectListPage.css';

export interface ProjectView {
  id: string;
  name: string;
  current_stage: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectSummaryView extends ProjectView {
  repo_url: string | null;
  health_score: number | null;
  deploy_status?: string | null;
  latest_deploy_status?: string | null;
  last_log?: string | null;
  latest_log_message?: string | null;
  tokens: {
    today: string;
    total: string;
    month: string;
    todayCost?: string;
    totalCost?: string;
    today_cost?: string;
    total_cost?: string;
  } | null;
  active_agents: string[];
}

interface HealthSnapshotView {
  composite_score: string;
  measured_at: string;
}

interface DeploymentEventView {
  kind: string;
  status: string;
  commit_sha: string;
  occurred_at: string;
}

interface LogView {
  message: string;
  created_at: string;
}

interface UsageBreakdown {
  today_tokens: string;
  month_tokens: string;
  total_tokens?: string;
  today_cost?: string;
  month_cost?: string;
  total_cost?: string;
}

interface TokenUsageSummary {
  today: string;
  total: string;
  month: string;
  todayCost?: string;
  totalCost?: string;
}

/* ───────────────────────── Variant A: 점진적 채움 ─────────────────────────
 * 부속 호출이 3종 × 프로젝트 수(N+1)라서, 슬롯 로딩 및 레이아웃 시프트가 발생한다.
 */
type Slot<T> = { status: 'loading' } | { status: 'ready'; value: Measurable<T> };

const LOADING: Slot<never> = { status: 'loading' };
const ready = <T,>(value: Measurable<T>): Slot<T> => ({ status: 'ready', value });

interface RowDetail {
  health: Slot<number>;
  deployStatus: Slot<string>;
  lastLog: Slot<string>;
  tokens: Slot<TokenUsageSummary>;
}

const EMPTY_DETAIL: RowDetail = {
  health: LOADING,
  deployStatus: LOADING,
  lastLog: LOADING,
  tokens: LOADING,
};

type DetailPatch = Partial<RowDetail>;
type DetailAction = { type: 'patch'; projectId: string; patch: DetailPatch };

function detailsReducer(
  state: Record<string, RowDetail>,
  action: DetailAction,
): Record<string, RowDetail> {
  const current = state[action.projectId] ?? EMPTY_DETAIL;
  return { ...state, [action.projectId]: { ...current, ...action.patch } };
}

async function slotFrom<R, T>(path: string, pick: (res: R) => Measurable<T>): Promise<Slot<T>> {
  try {
    return ready(pick(await apiFetch<R>(path)));
  } catch {
    return ready<T>(null);
  }
}

function SlotCell<T>({
  slot,
  render,
}: {
  slot: Slot<T>;
  render: (value: T) => JSX.Element | string;
}) {
  if (slot.status === 'loading') {
    return (
      <span className="plist__loading" aria-label="불러오는 중">
        ···
      </span>
    );
  }
  if (slot.value === null) return <span className="plist__dash">{EM_DASH}</span>;
  return <>{render(slot.value)}</>;
}

export function ProjectListPage() {
  const navigate = useNavigate();
  const { variant, recordMetrics } = useBenchmark();

  // 검색, 필터, 정렬 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');
  const [sortBy, setSortBy] = useState<SortOptionType>('created_desc');

  // API 키 모달 타겟 프로젝트
  const [apiKeyTarget, setApiKeyTarget] = useState<{ id: string; name: string } | null>(null);

  // Variant A 전용 상태
  const { data: rawData, error: rawError, loading: rawLoading } = useApi<Page<ProjectView>>(
    variant === 'A' ? '/projects?limit=50' : null,
  );
  const [details, dispatch] = useReducer(detailsReducer, {});

  // Variant B 전용 상태 (통합 1회 호출)
  const [bData, setBData] = useState<Page<ProjectSummaryView> | null>(null);
  const [bLoading, setBLoading] = useState(variant === 'B');
  const [bError, setBError] = useState<Error | null>(null);

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul', []);

  // ───────────────────────── Variant B 로딩 및 벤치마크 실측 ─────────────────────────
  useEffect(() => {
    if (variant !== 'B') return;
    let active = true;
    setBLoading(true);
    setBError(null);
    const startMs = performance.now();

    apiFetch<Page<ProjectSummaryView>>(`/projects?summary=true&limit=50&tz=${encodeURIComponent(tz)}`)
      .then((res) => {
        if (!active) return;
        const durationMs = performance.now() - startMs;
        setBData(res);
        setBLoading(false);
        recordMetrics('B', {
          reqCount: 1,
          durationMs,
          layoutShifts: 0,
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setBError(err instanceof Error ? err : new Error(String(err)));
        setBLoading(false);
      });

    return () => {
      active = false;
    };
  }, [variant, tz, recordMetrics]);

  // ───────────────────────── Variant A 로딩 및 벤치마크 실측 ─────────────────────────
  const aProjects = useMemo(() => rawData?.items ?? [], [rawData]);
  const aStartTimeRef = useRef<number>(0);
  const aShiftsRef = useRef<number>(0);

  useEffect(() => {
    if (variant !== 'A' || aProjects.length === 0) return;
    let live = true;
    aStartTimeRef.current = performance.now();
    aShiftsRef.current = 0;

    let pendingSlots = aProjects.length * 4;
    const totalRequests = 1 + pendingSlots;

    const apply = (projectId: string, patch: DetailPatch) => {
      if (!live) return;
      aShiftsRef.current += 1;
      dispatch({ type: 'patch', projectId, patch });

      pendingSlots -= 1;
      if (pendingSlots <= 0) {
        const durationMs = performance.now() - aStartTimeRef.current;
        recordMetrics('A', {
          reqCount: totalRequests,
          durationMs,
          layoutShifts: aShiftsRef.current,
        });
      }
    };

    for (const p of aProjects) {
      dispatch({ type: 'patch', projectId: p.id, patch: EMPTY_DETAIL });

      void slotFrom<Page<HealthSnapshotView>, number>(
        `/projects/${p.id}/health-snapshots?limit=1`,
        (r) => {
          const latest = r.items[0];
          if (!latest) return null;
          const score = Number(latest.composite_score);
          return Number.isFinite(score) ? score : null;
        },
      ).then((health) => apply(p.id, { health }));

      void slotFrom<Page<DeploymentEventView>, string>(
        `/projects/${p.id}/deployment-events?limit=10`,
        (r) => r.items.find((e) => e.kind === 'deployment')?.status ?? null,
      ).then((deployStatus) => apply(p.id, { deployStatus }));

      void slotFrom<Page<LogView>, string>(`/projects/${p.id}/logs?limit=1`, (r) => {
        const latest = r.items[0];
        return latest ? latest.message : null;
      }).then((lastLog) => apply(p.id, { lastLog }));

      void slotFrom<UsageBreakdown, TokenUsageSummary>(
        `/projects/${p.id}/token-usage?tz=${encodeURIComponent(tz)}`,
        (r) => ({
          today: r.today_tokens ?? '0',
          total: r.total_tokens ?? r.month_tokens ?? r.today_tokens ?? '0',
          month: r.month_tokens ?? '0',
          todayCost: r.today_cost ?? '0',
          totalCost: r.total_cost ?? r.month_cost ?? r.today_cost ?? '0',
        }),
      ).then((tokens) => apply(p.id, { tokens }));
    }

    return () => {
      live = false;
    };
  }, [variant, aProjects, tz, recordMetrics]);

  const detailOf = useCallback((id: string): RowDetail => details[id] ?? EMPTY_DETAIL, [details]);

  // 통합 정규화된 프로젝트 리스트 모델
  const unifiedProjects = useMemo<ProjectListItemLike[]>(() => {
    if (variant === 'B') {
      return bData?.items ?? [];
    }
    return aProjects.map((p) => {
      const d = detailOf(p.id);
      return {
        id: p.id,
        name: p.name,
        current_stage: p.current_stage,
        created_at: p.created_at,
        updated_at: p.updated_at,
        repo_url: null,
        health_score: d.health.status === 'ready' ? d.health.value : null,
        deploy_status: d.deployStatus.status === 'ready' ? d.deployStatus.value : null,
        last_log: d.lastLog.status === 'ready' ? d.lastLog.value : null,
        tokens:
          d.tokens.status === 'ready' && d.tokens.value
            ? {
                today: d.tokens.value.today,
                total: d.tokens.value.total,
                month: d.tokens.value.month,
                todayCost: d.tokens.value.todayCost,
                totalCost: d.tokens.value.totalCost,
              }
            : null,
        active_agents: [],
      };
    });
  }, [variant, bData, aProjects, detailOf]);

  // 필터 및 검색 적용
  const filteredProjects = useMemo(() => {
    const list = unifiedProjects.filter(
      (p) => matchesSearch(p, searchQuery) && matchesStatus(p, statusFilter),
    );
    return sortProjects(list, sortBy);
  }, [unifiedProjects, searchQuery, statusFilter, sortBy]);

  // 필터별 카운트 계산
  const statusCounts = useMemo(() => {
    const all = unifiedProjects.length;
    let live = 0;
    let success = 0;
    let failure = 0;

    for (const p of unifiedProjects) {
      if ((p.active_agents?.length ?? 0) > 0) live++;
      const status = p.deploy_status ?? p.latest_deploy_status;
      if (status === 'success') success++;
      if (status === 'failure') failure++;
    }

    return { all, live, success, failure };
  }, [unifiedProjects]);

  const loading = variant === 'B' ? bLoading : rawLoading;
  const error = variant === 'B' ? bError : rawError;

  if (!loading && error === null && unifiedProjects.length === 0 && !searchQuery) {
    return <Navigate to="/import" replace />;
  }

  return (
    <section className="page plist">
      {/* 플로팅 A/B 벤치마크 컨트롤러 */}
      <BenchmarkHud />

      {/* API 키 관리 모달 연동 */}
      {apiKeyTarget && (
        <ApiKeyModal
          open={Boolean(apiKeyTarget)}
          projectId={apiKeyTarget.id}
          projectName={apiKeyTarget.name}
          onClose={() => setApiKeyTarget(null)}
        />
      )}

      <header className="page__head plist__header-main">
        <div>
          <div className="plist__title-row">
            <h1 className="page__title">
              프로젝트 <span className="page__count">{unifiedProjects.length}개</span>
            </h1>
            <span
              className={`badge ${variant === 'B' ? 'badge--ok' : 'badge--caution'}`}
              title={
                variant === 'B'
                  ? 'Treatment: 1회 통합 호출로 고속 로딩'
                  : 'Control: 41개 개별 호출 점진 로딩'
              }
            >
              {variant === 'B' ? '● Variant B 고속 모드' : '○ Variant A 점진 모드'}
            </span>
          </div>
          <p className="meta">GitHub에서 연동된 저장소와 에이전트 관제 목록입니다.</p>
        </div>
        <div className="plist__head-actions">
          <Button className="plist__import-cta" onClick={() => navigate('/import')}>
            + 레포 더 가져오기
          </Button>
        </div>
      </header>

      {/* 스마트 검색창, 상태 필터 칩, 정렬 컨트롤 바 */}
      <div className="plist__control-bar">
        <div className="plist__search-wrap">
          <svg
            className="plist__search-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="input plist__search-input"
            placeholder="프로젝트 이름 또는 GitHub 레포 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="프로젝트 및 레포 검색"
          />
          {searchQuery && (
            <button
              type="button"
              className="plist__search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="검색어 지우기"
            >
              ✕
            </button>
          )}
        </div>

        <div className="plist__filter-sort-row">
          <div className="chip-row plist__filter-chips" role="group" aria-label="상태 필터">
            <button
              type="button"
              className={`chip ${statusFilter === 'all' ? 'chip--active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              전체 ({statusCounts.all})
            </button>
            <button
              type="button"
              className={`chip ${statusFilter === 'live' ? 'chip--active' : ''}`}
              onClick={() => setStatusFilter('live')}
            >
              <span className="plist__live-dot" /> 작업 중 ({statusCounts.live})
            </button>
            <button
              type="button"
              className={`chip ${statusFilter === 'deploy_success' ? 'chip--active' : ''}`}
              onClick={() => setStatusFilter('deploy_success')}
            >
              배포 성공 ({statusCounts.success})
            </button>
            <button
              type="button"
              className={`chip ${statusFilter === 'deploy_failure' ? 'chip--active' : ''}`}
              onClick={() => setStatusFilter('deploy_failure')}
            >
              배포 실패 ({statusCounts.failure})
            </button>
          </div>

          <div className="plist__sort-wrap">
            <span className="plist__sort-label meta">정렬:</span>
            <select
              className="input plist__sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOptionType)}
              aria-label="정렬 기준"
            >
              <option value="created_desc">최근 생성순</option>
              <option value="updated_desc">최근 활동순</option>
              <option value="tokens_desc">토큰 사용순</option>
              <option value="cost_desc">비용순</option>
              <option value="health_desc">헬스 스코어순</option>
            </select>
          </div>
        </div>
      </div>

      {error !== null ? (
        <p className="error-note" role="alert">
          목록을 불러오지 못했다: {error.message}
        </p>
      ) : loading ? (
        <div className="plist__loading-state">
          <p className="meta">
            {variant === 'B'
              ? '통합 대시보드 데이터를 즉시 불러오는 중…'
              : '프로젝트 목록 및 41개 세부 지표를 점진적으로 불러오는 중…'}
          </p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="plist__empty-search">
          <p className="meta">검색 조건에 맞는 프로젝트가 없습니다.</p>
          {(searchQuery || statusFilter !== 'all') && (
            <Button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
            >
              필터 초기화
            </Button>
          )}
        </div>
      ) : (
        <div className="plist__grid">
          {filteredProjects.map((p) => {
            // Variant A 모드일 때는 세부 슬롯 렌더링 유지
            const d = detailOf(p.id);
            const deployStatus =
              variant === 'B'
                ? (p.deploy_status ?? p.latest_deploy_status ?? null)
                : null;
            const lastLog =
              variant === 'B'
                ? (p.last_log ?? p.latest_log_message ?? null)
                : null;
            const healthVal =
              variant === 'B' ? (p.health_score ?? null) : null;
            const activeAgents = p.active_agents ?? [];
            const cleanRepo = cleanRepoUrl(p.repo_url);

            return (
              <div key={p.id} className="plist__card-wrapper">
                <Link to={`/projects/${p.id}`} className="plist__card">
                  <div className="plist__card-head">
                    <div className="plist__card-head-title">
                      <span className="plist__name">{p.name}</span>
                      {cleanRepo && (
                        <span className="meta plist__repo-sub">{cleanRepo}</span>
                      )}
                    </div>

                    <div className="plist__card-status-badges">
                      {variant === 'B' ? (
                        deployStatus && (
                          <span
                            className={
                              deployStatus === 'failure'
                                ? 'badge badge--signal'
                                : deployStatus === 'success'
                                  ? 'badge badge--ok'
                                  : 'badge'
                            }
                          >
                            {deployStatus === 'success'
                              ? '성공'
                              : deployStatus === 'failure'
                                ? '실패'
                                : deployStatus}
                          </span>
                        )
                      ) : (
                        <SlotCell
                          slot={d.deployStatus}
                          render={(status) => (
                            <span
                              className={status === 'failure' ? 'badge badge--signal' : 'badge'}
                            >
                              {status === 'success' ? '성공' : status === 'failure' ? '실패' : status}
                            </span>
                          )}
                        />
                      )}
                    </div>
                  </div>

                  {/* 활성 에이전트 작업 중 펄스 뱃지 */}
                  {activeAgents.length > 0 && (
                    <div className="plist__agent-pulse-row">
                      <span className="plist__pulse-badge">
                        <span className="plist__pulse-dot" />
                        {activeAgents.join(', ')} 작업 중
                      </span>
                    </div>
                  )}

                  <p className="meta plist__card-log">
                    {variant === 'B' ? (
                      lastLog ? (
                        lastLog
                      ) : (
                        <span className="plist__dash">{EM_DASH}</span>
                      )
                    ) : (
                      <SlotCell slot={d.lastLog} render={(m) => m} />
                    )}
                  </p>

                  <div className="plist__card-foot">
                    {variant === 'B' ? (
                      <HealthIndicator score={healthVal} />
                    ) : (
                      <SlotCell
                        slot={d.health}
                        render={(score) => <HealthIndicator score={score} />}
                      />
                    )}

                    {variant === 'B' ? (
                      p.tokens ? (
                        <TokenUsageDisplay
                          today={p.tokens.today}
                          total={p.tokens.total}
                          todayCost={p.tokens.todayCost ?? p.tokens.today_cost}
                          totalCost={p.tokens.totalCost ?? p.tokens.total_cost}
                        />
                      ) : (
                        <span className="plist__dash">{EM_DASH}</span>
                      )
                    ) : (
                      <SlotCell
                        slot={d.tokens}
                        render={({ today, total, todayCost, totalCost }) => (
                          <TokenUsageDisplay
                            today={today}
                            total={total}
                            todayCost={todayCost}
                            totalCost={totalCost}
                          />
                        )}
                      />
                    )}
                  </div>
                </Link>

                {/* 프로젝트 카드 퀵 액션 (외부 레포 이동 & 🔑 API 키 모달 바로열기) */}
                <div className="plist__quick-actions-bar">
                  {p.repo_url && (
                    <a
                      href={p.repo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="plist__quick-btn"
                      title="GitHub 레포 새 탭 열기"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg
                        className="plist__github-icon"
                        viewBox="0 0 24 24"
                        width="13"
                        height="13"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                      </svg>
                      <span>GitHub</span>
                    </a>
                  )}
                  <button
                    type="button"
                    className="plist__quick-btn"
                    title="API 키 관리 모달 열기"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setApiKeyTarget({ id: p.id, name: p.name });
                    }}
                  >
                    <span>🔑 API 키</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TokenUsageDisplay({
  today = '0',
  total = '0',
  todayCost,
  totalCost,
}: {
  today?: string;
  total?: string;
  todayCost?: string;
  totalCost?: string;
}) {
  const todayNum = Number(today ?? 0);
  const totalCostStr = formatCost(totalCost);
  const todayCostStr = formatCost(todayCost);

  if (todayNum > 0) {
    return (
      <span
        className="plist__token-count"
        title={`총 ${formatTokenCount(total)} 토큰 (${totalCostStr}) · 오늘 ${formatTokenCount(today)} 토큰 (${todayCostStr})`}
      >
        {formatTokenCount(total)} (<span className="cost-text">{totalCostStr}</span>) · 오늘{' '}
        {formatTokenCount(today)} (<span className="cost-text">{todayCostStr}</span>)
      </span>
    );
  }
  return (
    <span
      className="plist__token-count"
      title={`총 ${formatTokenCount(total)} 토큰 (${totalCostStr})`}
    >
      {formatTokenCount(total)} 토큰 (<span className="cost-text">{totalCostStr}</span>)
    </span>
  );
}
