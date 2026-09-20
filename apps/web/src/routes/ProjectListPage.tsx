import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { HealthIndicator } from '../components/HealthIndicator';
import { ApiKeyModal } from '../components/ApiKeyModal';
import { apiFetch, type Page } from '../lib/api';
import { EM_DASH } from '../lib/domain';
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

export function ProjectListPage() {
  const navigate = useNavigate();

  // 검색, 필터, 정렬 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');
  const [sortBy, setSortBy] = useState<SortOptionType>('created_desc');

  // API 키 모달 타겟 프로젝트
  const [apiKeyTarget, setApiKeyTarget] = useState<{ id: string; name: string } | null>(null);

  // 통합 1회 호출 (GET /projects?summary=true) — N+1 개별 호출 방식은 폐기했다(DESIGN_DRIFT 16번).
  const [data, setData] = useState<Page<ProjectSummaryView> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul', []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    apiFetch<Page<ProjectSummaryView>>(
      `/projects?summary=true&limit=50&tz=${encodeURIComponent(tz)}`,
    )
      .then((res) => {
        if (!active) return;
        setData(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tz]);

  const unifiedProjects = useMemo<ProjectListItemLike[]>(() => data?.items ?? [], [data]);

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

  if (!loading && error === null && unifiedProjects.length === 0 && !searchQuery) {
    return <Navigate to="/import" replace />;
  }

  return (
    <section className="page plist">
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
          <p className="meta">통합 대시보드 데이터를 즉시 불러오는 중…</p>
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
            const deployStatus = p.deploy_status ?? p.latest_deploy_status ?? null;
            const lastLog = p.last_log ?? p.latest_log_message ?? null;
            const healthVal = p.health_score ?? null;
            const activeAgents = p.active_agents ?? [];
            const cleanRepo = cleanRepoUrl(p.repo_url);

            return (
              <div key={p.id} className="plist__card-wrapper">
                <Link to={`/projects/${p.id}`} className="plist__card">
                  <div className="plist__card-head">
                    <div className="plist__card-head-title">
                      <span className="plist__name">{p.name}</span>
                      {cleanRepo && <span className="meta plist__repo-sub">{cleanRepo}</span>}
                    </div>

                    <div className="plist__card-status-badges">
                      {deployStatus && (
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
                    {lastLog ? lastLog : <span className="plist__dash">{EM_DASH}</span>}
                  </p>

                  <div className="plist__card-foot">
                    <HealthIndicator score={healthVal} />

                    {p.tokens ? (
                      <TokenUsageDisplay
                        today={p.tokens.today}
                        total={p.tokens.total}
                        todayCost={p.tokens.todayCost ?? p.tokens.today_cost}
                        totalCost={p.tokens.totalCost ?? p.tokens.total_cost}
                      />
                    ) : (
                      <span className="plist__dash">{EM_DASH}</span>
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
