import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { HealthIndicator } from '../components/HealthIndicator';
import { apiFetch, type Page } from '../lib/api';
import { EM_DASH, type Measurable } from '../lib/domain';
import { useApi } from '../lib/useApi';
import { formatCost, formatTokenCount } from '../lib/tokenIntelligence';
import './ProjectListPage.css';

interface ProjectView {
  id: string;
  name: string;
  current_stage: string;
  created_at: string;
  updated_at: string;
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

/* ───────────────────────── 점진적 채움 ─────────────────────────
 * 부속 호출이 3종 × 프로젝트 수(N+1)라서, 전부 모아 한 번에 그리면 목록이 몇 초간 비어 보인다.
 * ProjectDetailPage와 같은 이유로 같은 패턴을 쓴다 — 아직 안 옴(loading)과 측정 불가(null)를
 * 섞지 않는다.
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
  const { data, error, loading } = useApi<Page<ProjectView>>('/projects?limit=50');
  const projects = useMemo(() => data?.items ?? [], [data]);
  const [details, dispatch] = useReducer(detailsReducer, {});

  useEffect(() => {
    if (projects.length === 0) return;
    let live = true;

    const apply = (projectId: string, patch: DetailPatch) => {
      if (live) dispatch({ type: 'patch', projectId, patch });
    };

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';

    for (const p of projects) {
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
  }, [projects]);

  const detailOf = useCallback((id: string): RowDetail => details[id] ?? EMPTY_DETAIL, [details]);

  if (!loading && error === null && projects.length === 0) {
    return <Navigate to="/import" replace />;
  }

  return (
    <section className="page plist">
      <header className="page__head">
        <div>
          <h1 className="page__title">
            프로젝트 <span className="page__count">{projects.length}개</span>
          </h1>
          <p className="meta">GitHub에서 가져온 레포입니다</p>
        </div>
        <Button className="plist__import-cta" onClick={() => navigate('/import')}>
          + 레포 더 가져오기
        </Button>
      </header>

      {error !== null ? (
        <p className="error-note" role="alert">
          목록을 불러오지 못했다: {error.message}
        </p>
      ) : loading ? (
        <p className="meta">불러오는 중…</p>
      ) : (
        <div className="plist__grid">
          {projects.map((p) => {
            const d = detailOf(p.id);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="plist__card">
                <div className="plist__card-head">
                  <span className="plist__name">{p.name}</span>
                  <SlotCell
                    slot={d.deployStatus}
                    render={(status) => (
                      <span className={status === 'failure' ? 'badge badge--signal' : 'badge'}>
                        {status === 'success' ? '성공' : status === 'failure' ? '실패' : status}
                      </span>
                    )}
                  />
                </div>
                <p className="meta plist__card-log">
                  <SlotCell slot={d.lastLog} render={(m) => m} />
                </p>
                <div className="plist__card-foot">
                  <SlotCell slot={d.health} render={(score) => <HealthIndicator score={score} />} />
                  <SlotCell
                    slot={d.tokens}
                    render={({ today, total, todayCost, totalCost }) => {
                      const todayNum = Number(today);
                      const totalCostStr = formatCost(totalCost);
                      const todayCostStr = formatCost(todayCost);
                      if (todayNum > 0) {
                        return (
                          <span
                            className="plist__token-count"
                            title={`총 ${formatTokenCount(total)} 토큰 (${totalCostStr}) · 오늘 ${formatTokenCount(today)} 토큰 (${todayCostStr})`}
                          >
                            {formatTokenCount(total)} ({totalCostStr}) · 오늘{' '}
                            {formatTokenCount(today)} ({todayCostStr})
                          </span>
                        );
                      }
                      return (
                        <span
                          className="plist__token-count"
                          title={`총 ${formatTokenCount(total)} 토큰 (${totalCostStr})`}
                        >
                          {formatTokenCount(total)} 토큰 ({totalCostStr})
                        </span>
                      );
                    }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
