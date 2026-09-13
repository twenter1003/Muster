import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { HealthIndicator } from '../components/HealthIndicator';
import { StageBadge } from '../components/StageBadge';
import { StatusBadge } from '../components/StatusBadge';
import { ApiError, apiFetch, apiPost, type Page } from '../lib/api';
import { Modal } from '../components/Modal';
import {
  EM_DASH,
  PROJECT_STAGES,
  readStack,
  type BuildStatus,
  type Measurable,
  type ProjectStage,
} from '../lib/domain';
import { useApi } from '../lib/useApi';
import './ProjectListPage.css';

/* ───────────────────────── 서버 응답 계약 ─────────────────────────
 * 목록은 GET /projects 하나뿐이고, 표가 보여 주는 나머지 컬럼(문서·에이전트·환경·헬스·비용)은
 * 전부 프로젝트별 하위 경로에서만 온다. 그래서 응답 타입도 목록/부속으로 나뉜다.
 */

interface ProjectView {
  id: string;
  name: string;
  current_stage: string;
  created_at: string;
  updated_at: string;
}

interface EnvConfigView {
  id: string;
  build_status: string;
  stack_config: Record<string, unknown>;
  created_at: string;
}

interface HealthSnapshotView {
  composite_score: string;
  measured_at: string;
}

interface BudgetView {
  used_cost: string;
}

const PAGE_LIMIT = 20;

/** 서버의 CreateProjectDto가 정한 상한. 넘으면 400이 오므로 입력에서 먼저 막는다. */
const NAME_MAX = 200;

/** 서버가 문자열로 준 stage를 화면 타입으로 좁힌다. 모르는 값이면 배지를 그리지 않는다. */
function toStage(value: string): ProjectStage | null {
  return (PROJECT_STAGES as readonly string[]).includes(value) ? (value as ProjectStage) : null;
}

/* ───────────────────────── 점진적 채움 ─────────────────────────
 * 부속 호출이 4종 × 프로젝트 수(N+1)라서, 전부 모아 한 번에 그리면 목록이 몇 초간 비어 보인다.
 * 그래서 각 칸은 세 상태를 갖는다: 아직 안 옴(loading) / 값(value) / 측정 불가(null → —).
 * loading과 —를 섞지 않는 것이 핵심이다 — —는 "없음"이라는 확정된 사실이라서,
 * 아직 안 온 값에 —를 찍으면 사용자가 없는 사실을 읽게 된다.
 */

type Slot<T> = { status: 'loading' } | { status: 'ready'; value: Measurable<T> };

const LOADING: Slot<never> = { status: 'loading' };
const ready = <T,>(value: Measurable<T>): Slot<T> => ({ status: 'ready', value });

interface RowDetail {
  docCount: Slot<number>;
  agentCount: Slot<number>;
  env: Slot<{ status: BuildStatus; stack: string[] }>;
  health: Slot<number>;
  cost: Slot<string>;
}

const EMPTY_DETAIL: RowDetail = {
  docCount: LOADING,
  agentCount: LOADING,
  env: LOADING,
  health: LOADING,
  cost: LOADING,
};

type DetailPatch = Partial<RowDetail>;

type DetailAction =
  | { type: 'patch'; projectId: string; patch: DetailPatch }
  | { type: 'reset' };

function detailsReducer(
  state: Record<string, RowDetail>,
  action: DetailAction,
): Record<string, RowDetail> {
  if (action.type === 'reset') return {};
  const current = state[action.projectId] ?? EMPTY_DETAIL;
  return { ...state, [action.projectId]: { ...current, ...action.patch } };
}

/** 부속 호출 하나의 실패가 행 전체를 무너뜨리지 않게, 실패는 "측정 불가(—)"로 흡수한다. */
async function slotFrom<R, T>(
  path: string,
  pick: (res: R) => Measurable<T>,
): Promise<Slot<T>> {
  try {
    return ready(pick(await apiFetch<R>(path)));
  } catch {
    return ready<T>(null);
  }
}

/* ───────────────────────── 필터 ─────────────────────────
 * 서버에 stage/stack 쿼리 파라미터가 없어 전부 클라이언트 필터다. 즉 "현재 페이지 안에서"만
 * 거른다는 뜻이라, 페이지 밖의 프로젝트는 걸러지지 않는다. 프로젝트가 한 자릿수인 지금은
 * 한 페이지에 다 들어오므로 차이가 없고, 늘어나면 서버 필터로 옮겨야 한다.
 */
interface Filters {
  stages: ReadonlySet<ProjectStage>;
  stack: string | null;
}

const NO_FILTERS: Filters = { stages: new Set(), stack: null };

export function ProjectListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const board = params.get('view') === 'board';

  const [cursor, setCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [details, dispatch] = useReducer(detailsReducer, {});

  const path = `/projects?limit=${PAGE_LIMIT}${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
  const { data, error, loading } = useApi<Page<ProjectView>>(path);

  const projects = useMemo(() => data?.items ?? [], [data]);

  // 행이 화면에 나온 뒤 부속 값을 채운다. 프로젝트마다 4개의 호출이 각자 도착하는 대로
  // 자기 칸만 갱신하므로, 느린 호출 하나가 나머지 칸을 붙잡지 않는다.
  useEffect(() => {
    if (projects.length === 0) return;
    let live = true;

    const apply = (projectId: string, patch: DetailPatch) => {
      if (live) dispatch({ type: 'patch', projectId, patch });
    };

    for (const p of projects) {
      dispatch({ type: 'patch', projectId: p.id, patch: EMPTY_DETAIL });

      void slotFrom<Page<unknown>, number>(`/projects/${p.id}/documents?limit=100`, (r) =>
        r.items.length,
      ).then((docCount) => apply(p.id, { docCount }));

      void slotFrom<Page<unknown>, number>(`/projects/${p.id}/agents?limit=100`, (r) =>
        r.items.length,
      ).then((agentCount) => apply(p.id, { agentCount }));

      void slotFrom<Page<EnvConfigView>, { status: BuildStatus; stack: string[] }>(
        `/projects/${p.id}/env-configs?limit=1`,
        (r) => {
          const latest = r.items[0];
          if (!latest) return null;
          return {
            status: latest.build_status as BuildStatus,
            stack: readStack(latest.stack_config),
          };
        },
      ).then((env) => apply(p.id, { env }));

      // 레포 미연동 프로젝트는 스냅샷이 아예 없다. 그때는 0.0이 아니라 —다(설계서 주석 3).
      void slotFrom<Page<HealthSnapshotView>, number>(
        `/projects/${p.id}/health-snapshots?limit=1`,
        (r) => {
          const latest = r.items[0];
          if (!latest) return null;
          const score = Number(latest.composite_score);
          return Number.isFinite(score) ? score : null;
        },
      ).then((health) => apply(p.id, { health }));

      void slotFrom<BudgetView, string>(`/projects/${p.id}/budget`, (r) => r.used_cost).then(
        (cost) => apply(p.id, { cost }),
      );
    }

    return () => {
      live = false;
    };
  }, [projects]);

  const detailOf = useCallback(
    (id: string): RowDetail => details[id] ?? EMPTY_DETAIL,
    [details],
  );

  // 스택 필터의 선택지는 이미 도착한 env-config에서만 나온다. 아직 안 온 프로젝트는
  // 값이 도착하면 선택지에 추가된다.
  const stackOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      const env = detailOf(p.id);
      if (env.env.status !== 'ready' || env.env.value === null) continue;
      for (const s of new Set(env.env.value.stack)) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [projects, detailOf]);

  const visible = useMemo(
    () =>
      projects.filter((p) => {
        const stage = toStage(p.current_stage);
        if (filters.stages.size > 0 && (stage === null || !filters.stages.has(stage))) return false;
        if (filters.stack !== null) {
          const env = detailOf(p.id).env;
          if (env.status !== 'ready' || env.value === null) return false;
          if (!env.value.stack.includes(filters.stack)) return false;
        }
        return true;
      }),
    [projects, filters, detailOf],
  );

  const toggleStage = (stage: ProjectStage) => {
    setFilters((f) => {
      const next = new Set(f.stages);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return { ...f, stages: next };
    });
  };

  // 보기 전환을 URL에 두는 이유: 새로고침·링크 공유로 보기가 초기화되면 "보드로 보라"고
  // 링크를 건네는 일이 성립하지 않는다. 필터는 두 보기가 같은 상태를 공유한다.
  const setView = (next: 'table' | 'board') => {
    const p = new URLSearchParams(params);
    if (next === 'board') p.set('view', 'board');
    else p.delete('view');
    setParams(p, { replace: true });
  };

  return (
    <section className="page plist">
      <CreateProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        // 만들자마자 그 프로젝트로 보낸다. 방금 만든 것에 문서와 환경 구성을 붙이는 것이
        // 다음 할 일이지, 목록으로 돌아와 방금 만든 이름을 다시 찾는 것이 아니다.
        onCreated={(id) => navigate(`/projects/${id}`)}
      />
      <header className="page__head">
        <h1 className="page__title">
          프로젝트{' '}
          <span className="page__count">
            {projects.length}개 · <span className="plist__mono">deleted_at IS NULL</span>
          </span>
        </h1>
        <div className="plist__actions">
          <div className="plist__views" role="group" aria-label="보기 전환">
            <Button aria-pressed={!board} onClick={() => setView('table')}>
              표
            </Button>
            <Button aria-pressed={board} onClick={() => setView('board')}>
              보드
            </Button>
          </div>
          {/* 화면당 솔리드는 하나. 이 화면에서 할 일은 프로젝트 생성이다. */}
          <Button variant="solid" onClick={() => setCreating(true)}>
            + 프로젝트 생성
          </Button>
        </div>
      </header>

      <div className="plist__body">
        <aside className="plist__rail" aria-label="필터">
          <div className="plist__rail-group">
            <h2 className="plist__rail-label">진행 단계</h2>
            <div className="chip-row">
              {PROJECT_STAGES.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  className="chip plist__chip"
                  aria-pressed={filters.stages.has(stage)}
                  onClick={() => toggleStage(stage)}
                >
                  {stage}
                </button>
              ))}
            </div>
          </div>

          <div className="plist__rail-group">
            <h2 className="plist__rail-label">스택</h2>
            {stackOptions.length === 0 ? (
              <p className="meta">환경 구성이 있는 프로젝트가 없다.</p>
            ) : (
              <div className="chip-row">
                <button
                  type="button"
                  className="chip plist__chip"
                  aria-pressed={filters.stack === null}
                  onClick={() => setFilters((f) => ({ ...f, stack: null }))}
                >
                  전체
                </button>
                {stackOptions.map(([name, count]) => (
                  <button
                    key={name}
                    type="button"
                    className="chip plist__chip"
                    aria-pressed={filters.stack === name}
                    onClick={() => setFilters((f) => ({ ...f, stack: name }))}
                  >
                    {name} <span className="plist__chip-count">{count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button className="plist__reset" onClick={() => setFilters(NO_FILTERS)}>
            조건 초기화
          </Button>
        </aside>

        <div className="plist__content">
          <p className="meta">
            정렬: 최근 활동 ↓ · 커서 페이지네이션 limit {PAGE_LIMIT}
            {filters.stages.size > 0 || filters.stack !== null
              ? ` · 필터 적용 ${visible.length}/${projects.length}`
              : ''}
          </p>

          {error !== null ? (
            <p className="error-note" role="alert">
              목록을 불러오지 못했다: {error.message}
            </p>
          ) : loading ? (
            <p className="meta">불러오는 중…</p>
          ) : visible.length === 0 ? (
            <p className="meta">조건에 맞는 프로젝트가 없다.</p>
          ) : board ? (
            <BoardView projects={visible} detailOf={detailOf} />
          ) : (
            <TableView projects={visible} detailOf={detailOf} />
          )}

          <div className="plist__foot">
            <span className="meta">
              {visible.length}개 표시 · {data?.next_cursor === null ? '마지막 페이지' : '다음 있음'}
            </span>
            <div className="plist__pager">
              <Button disabled={cursor === null} onClick={() => setCursor(null)}>
                처음
              </Button>
              <Button
                disabled={!data?.next_cursor}
                onClick={() => setCursor(data?.next_cursor ?? null)}
              >
                다음
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** 아직 안 온 값과 없는 값을 한 곳에서 갈라, 화면 어디서도 둘이 섞이지 않게 한다. */
function SlotCell<T>({ slot, render }: { slot: Slot<T>; render: (value: T) => JSX.Element | string }) {
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

interface ViewProps {
  projects: ProjectView[];
  detailOf: (id: string) => RowDetail;
}

function TableView({ projects, detailOf }: ViewProps) {
  return (
    // 좁은 폭에서 표만 가로로 스크롤한다. 화면 전체가 밀리면 사이드바까지 따라 나간다.
    <div className="scroll-x">
      <table className="table plist__table">
        <thead>
          <tr>
            <th scope="col">프로젝트 · 스택</th>
            <th scope="col">단계</th>
            <th scope="col" className="plist__col-docs">
              문서
            </th>
            <th scope="col">에이전트</th>
            <th scope="col">환경 상태</th>
            <th scope="col">헬스</th>
            <th scope="col">비용</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const d = detailOf(p.id);
            const stage = toStage(p.current_stage);
            return (
              <tr key={p.id}>
                <td>
                  <Link className="plist__name" to={`/projects/${p.id}`}>
                    {p.name}
                  </Link>
                  <div className="meta plist__sub">
                    <SlotCell
                      slot={d.env}
                      render={(env) =>
                        env.stack.length > 0 ? env.stack.join(' · ') : '스택 정보 없음'
                      }
                    />
                  </div>
                </td>
                <td>{stage === null ? <span className="plist__dash">{EM_DASH}</span> : <StageBadge stage={stage} />}</td>
                <td className="plist__col-docs plist__num">
                  <SlotCell slot={d.docCount} render={(n) => String(n)} />
                </td>
                <td className="plist__num">
                  <SlotCell slot={d.agentCount} render={(n) => String(n)} />
                </td>
                <td>
                  <SlotCell slot={d.env} render={(env) => <StatusBadge status={env.status} />} />
                </td>
                <td>
                  <SlotCell slot={d.health} render={(score) => <HealthIndicator score={score} />} />
                </td>
                <td className="plist__num">
                  <SlotCell slot={d.cost} render={(cost) => `$${cost}`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 보드 — 목업 1b의 단계 칸반을 이 목록의 두 번째 보기로 흡수한 것이다.
 * 카드를 끌어 옮기는 기능은 넣지 않았다: 단계 전환은 이력이 남는 쓰기 동작이라
 * 별도 과업이고, 여기서는 링크로만 프로젝트에 들어간다.
 */
function BoardView({ projects, detailOf }: ViewProps) {
  return (
    <div className="scroll-x">
      <div className="plist__board">
        {PROJECT_STAGES.map((stage) => {
          const inStage = projects.filter((p) => p.current_stage === stage);
          return (
            <section key={stage} className="plist__column" aria-label={stage}>
              <header className="plist__column-head">
                <StageBadge stage={stage} />
                <span className="page__count">{inStage.length}</span>
              </header>
              {inStage.map((p) => {
                const d = detailOf(p.id);
                return (
                  <Link key={p.id} to={`/projects/${p.id}`} className="plist__card">
                    <span className="plist__name">{p.name}</span>
                    <span className="meta plist__sub">
                      <SlotCell
                        slot={d.env}
                        render={(env) =>
                          env.stack.length > 0 ? env.stack.join(' · ') : '스택 정보 없음'
                        }
                      />
                    </span>
                    <span className="plist__card-foot">
                      <SlotCell slot={d.env} render={(env) => <StatusBadge status={env.status} />} />
                      <SlotCell slot={d.health} render={(score) => <HealthIndicator score={score} />} />
                    </span>
                  </Link>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── 프로젝트 생성 ─────────────────────────
 * 서버가 요구하는 것은 이름 하나뿐이다(CreateProjectDto). 단계나 스택을 여기서 더 묻지 않는
 * 이유는, 만들기 전에 정해야 하는 것이 아니라 만든 뒤에 바꿔 나가는 값이기 때문이다.
 * 폼이 길어질수록 "일단 만들어 보는" 일이 어려워진다.
 */

function CreateProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 닫혔다 다시 열 때 지난번에 쓰다 만 이름이 남아 있으면, 그게 새 프로젝트의 이름이 된다.
  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
    }
  }, [open]);

  const trimmed = name.trim();
  const tooLong = trimmed.length > NAME_MAX;
  const canSave = trimmed.length > 0 && !tooLong && !saving;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setError(null);

    apiPost<ProjectView>('/projects', { name: trimmed }).then(
      (created) => onCreated(created.id),
      (err: unknown) => {
        setSaving(false);
        setError(err instanceof ApiError ? `${err.message} (${err.code})` : String(err));
      },
    );
  };

  return (
    <Modal open={open} title="프로젝트 생성" onClose={saving ? () => undefined : onClose}>
      <form className="modal__form" onSubmit={submit}>
        <div className="field">
          <label className="meta" htmlFor="new-project-name">
            이름
          </label>
          <input
            id="new-project-name"
            className="input modal__input"
            value={name}
            maxLength={NAME_MAX}
            placeholder="kiosk-pos"
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <span className="meta">
            {trimmed.length}/{NAME_MAX}자 · 나중에 바꿀 수 있습니다
          </span>
        </div>

        {error !== null && (
          <p className="error-note" role="alert">
            만들지 못했다: {error}
          </p>
        )}

        <div className="modal__actions">
          <Button type="button" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button type="submit" variant="solid" disabled={!canSave}>
            {saving ? '만드는 중…' : '만들기'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
