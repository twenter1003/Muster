import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { HealthIndicator } from '../components/HealthIndicator';
import { KpiCard } from '../components/KpiCard';
import { LogRow } from '../components/LogRow';
import { StageBadge } from '../components/StageBadge';
import { StatusBadge } from '../components/StatusBadge';
import { apiFetch, type Page } from '../lib/api';
import {
  BUILD_STATUSES,
  EM_DASH,
  HEALTH_MAX,
  LOG_LEVELS,
  PROJECT_STAGES,
  type BuildStatus,
  type LogLevel,
  type ProjectStage,
} from '../lib/domain';
import { useApi } from '../lib/useApi';
import { useSse } from '../lib/useSse';
import './DashboardPage.css';

/*
 * 대시보드 — "오늘 무엇을 처리해야 하는가" (설계서 03 · 목업 1a).
 *
 * 구조와 정보 밀도는 목업에서, 색·타이포·배지 규칙은 tokens.css / domain.ts / components에서
 * 가져온다. 목업의 보라 액센트 체계는 설계서가 폐기했으므로 여기에 hex는 한 글자도 없다.
 */

/** 로딩 중인 KPI 값. 아직 안 온 것과 없는 것(EM_DASH)을 절대 섞지 않는다. */
const LOADING = '···';

/* ── 서버 응답 타입 (각 컨트롤러의 toView를 그대로 옮긴 것) ───────────────────── */

interface ProjectView {
  id: string;
  name: string;
  current_stage: string;
  created_at: string;
  updated_at: string;
}

interface HealthSnapshotView {
  id: string;
  project_id: string;
  /** numeric 컬럼이라 문자열로 온다. 표시 직전에만 숫자로 바꾼다. */
  composite_score: string;
  measured_at: string;
}

interface ConfigView {
  id: string;
  project_id: string;
  build_status: string;
  stack_config: Record<string, unknown>;
  created_at: string;
}

interface PolicyCheckView {
  id: string;
  tool: string;
  verdict: string;
  risk_notes: string | null;
  checked_at: string;
}

interface LogView {
  id: string;
  level: string;
  message: string;
  created_at: string;
}

/**
 * 토큰 수를 K/M으로 줄여 쓴다. KPI 카드 한 칸에 1325650이 그대로 들어가면 자릿수를 세게 된다.
 * 문자열로 받은 값을 BigInt로 다룬다 — number로 옮기면 큰 값에서 정밀도를 잃는다.
 */
function formatTokens(raw: string): string {
  let n: bigint;
  try {
    n = BigInt(raw);
  } catch {
    return EM_DASH;
  }

  if (n >= 1_000_000n) return `${(Number(n) / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000n) return `${(Number(n) / 1_000).toFixed(1)}K`;
  return n.toString();
}

interface ReportSummaryView {
  cost_by_project: { total: string };
  run_outcomes: {
    succeeded: number;
    failed: number;
    cancelled: number;
    running: number;
    /** bigint 합계라 문자열로 온다 — number로 옮기면 큰 값에서 정밀도를 잃는다. */
    tokens_used: string;
  };
  dora: {
    deploy_freq_score: number | null;
    lead_time_score: number | null;
    change_fail_score: number | null;
    mttr_score: number | null;
    composite_score: number | null;
    window_days: number;
    projects_counted: number;
  };
}

/** SSE `log` 이벤트 페이로드 (common/events/domain-events.ts · LogAppendedEvent). */
interface LogAppendedEvent {
  log_entry_id: string;
  level: string;
  message: string;
  created_at: string;
}

/* ── 문자열 → 유니온 좁히기 ────────────────────────────────────────────────
 * 서버는 enum 값을 string으로 내보낸다. 컴포넌트는 유니온을 요구하므로 여기서 한 번만
 * 검사해서 넘긴다. 캐스팅으로 뚫으면 서버에 값이 추가됐을 때 화면이 조용히 틀린다.
 */
const isStage = (v: string): v is ProjectStage =>
  (PROJECT_STAGES as readonly string[]).includes(v);
const isLogLevel = (v: string): v is LogLevel => (LOG_LEVELS as readonly string[]).includes(v);
const isBuildStatus = (v: string): v is BuildStatus =>
  (BUILD_STATUSES as readonly string[]).includes(v);

/** 시각 표기는 "09:41"만. 대시보드는 오늘을 보는 화면이라 날짜는 헤더에 한 번이면 된다. */
function hhmm(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? EM_DASH
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/* ── 프로젝트별 부속 데이터 (N+1) ──────────────────────────────────────────── */

interface ProjectDetail {
  /** 최신 스냅샷의 composite. 스냅샷이 없거나 조회가 실패하면 null → 화면에서 EM_DASH. */
  health: number | null;
  configs: ConfigView[];
}

/**
 * 프로젝트별 헬스·환경구성을 각각 따로 채운다.
 *
 * 왜 N+1을 감수하는가: 전역 집계 엔드포인트가 없고 프로젝트 수가 한 자릿수다. 대신 두 가지를
 * 지킨다 — (1) 응답이 오는 대로 state에 넣어 화면이 점진적으로 차오르게 하고,
 * (2) 부속 호출 하나가 실패해도 catch로 삼켜 그 칸만 비운다. 하나가 500이어도 화면은 선다.
 * 프로젝트가 수십 개가 되면 이 훅을 서버 집계 엔드포인트 하나로 갈아끼운다.
 */
function useProjectDetails(projects: readonly ProjectView[] | null) {
  const [details, setDetails] = useState<Record<string, ProjectDetail>>({});

  useEffect(() => {
    if (projects === null) return;

    let live = true;
    setDetails({});

    for (const project of projects) {
      void Promise.all([
        apiFetch<Page<HealthSnapshotView>>(`/projects/${project.id}/health-snapshots?limit=1`).catch(
          () => null,
        ),
        apiFetch<Page<ConfigView>>(`/projects/${project.id}/env-configs?limit=20`).catch(() => null),
      ]).then(([health, configs]) => {
        if (!live) return;
        const latest = health?.items[0];
        const score = latest === undefined ? Number.NaN : Number(latest.composite_score);
        setDetails((prev) => ({
          ...prev,
          [project.id]: {
            health: Number.isFinite(score) ? score : null,
            configs: configs?.items ?? [],
          },
        }));
      });
    }

    return () => {
      // 언마운트 뒤 도착한 응답이 state를 건드리지 않게 한다.
      live = false;
    };
  }, [projects]);

  /** 승인 성공을 목록에 즉시 반영한다. 재조회를 기다리면 방금 누른 버튼이 살아 있는 것처럼 보인다. */
  const patchConfig = useCallback((configId: string, status: BuildStatus) => {
    setDetails((prev) => {
      const next: Record<string, ProjectDetail> = {};
      for (const [pid, detail] of Object.entries(prev)) {
        next[pid] = {
          ...detail,
          configs: detail.configs.map((c) =>
            c.id === configId ? { ...c, build_status: status } : c,
          ),
        };
      }
      return next;
    });
  }, []);

  return { details, patchConfig };
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

export function DashboardPage() {
  const navigate = useNavigate();
  const projectsState = useApi<Page<ProjectView>>('/projects?limit=100');
  const projects = projectsState.data?.items ?? null;

  // 오늘 구간. DORA는 서버가 고정 관측창(90일)을 쓰므로 from에 영향을 받지 않는다.
  const [from] = useState(todayStartIso);
  const summaryState = useApi<ReportSummaryView>(`/reports/summary?from=${encodeURIComponent(from)}`);
  const summary = summaryState.data;

  const { details, patchConfig } = useProjectDetails(projects);
  const loadedCount = projects === null ? 0 : projects.filter((p) => p.id in details).length;
  const allLoaded = projects !== null && loadedCount === projects.length;

  /** 승인 대기 = policy_passed 구성. 차단 건은 대기가 아니라 거부라 여기 들어가지 않는다. */
  const gateItems = useMemo(() => {
    if (projects === null) return [];
    const rows: { project: ProjectView; config: ConfigView }[] = [];
    for (const project of projects) {
      for (const config of details[project.id]?.configs ?? []) {
        if (config.build_status === 'policy_passed' || config.build_status === 'policy_blocked') {
          rows.push({ project, config });
        }
      }
    }
    return rows;
  }, [projects, details]);

  const waitingCount = gateItems.filter((r) => r.config.build_status === 'policy_passed').length;

  const measured = useMemo(
    () =>
      Object.values(details)
        .map((d) => d.health)
        .filter((h): h is number => h !== null),
    [details],
  );
  const averageHealth =
    measured.length === 0 ? null : measured.reduce((a, b) => a + b, 0) / measured.length;

  const stageHint = useMemo(() => {
    if (projects === null) return null;
    const counts = new Map<string, number>();
    for (const p of projects) counts.set(p.current_stage, (counts.get(p.current_stage) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([stage, n]) => `${stage} ${n}`)
      .join(' · ');
  }, [projects]);

  return (
    <section className="dash">
      <header className="dash__header">
        <div>
          <h1 className="page__title">전체 현황</h1>
          <p className="dash__subtitle">
            {new Date().toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}{' '}
            · 실시간 갱신
          </p>
        </div>
        <div className="dash__actions">
          <Button onClick={() => projectsState.reload()}>새로고침</Button>
          {/*
           * 화면에서 유일한 솔리드 버튼이다(설계서 10). Policy Gate 위젯의 "승인"은
           * 아웃라인으로 둔다 — 솔리드가 둘이면 "지금 할 일"이 복수가 되어 규칙이 깨진다.
           */}
          <Button variant="solid" onClick={() => navigate('/projects')}>
            + 프로젝트 생성
          </Button>
        </div>
      </header>

      {projectsState.error !== null && (
        <p className="dash__error" role="status">
          프로젝트 목록을 불러오지 못했다 — {projectsState.error.message}
        </p>
      )}

      {/* 주석 1: 다섯 중 "승인 대기"만 requiresAction. 나머지는 보고 지나가는 숫자다. */}
      <div className="dash__kpis">
        <KpiCard
          label="활성 프로젝트"
          value={projects === null ? LOADING : String(projects.length)}
          hint={stageHint ?? LOADING}
        />
        <KpiCard
          label="실행 중 에이전트"
          value={summary === null ? LOADING : String(summary.run_outcomes.running)}
          hint={
            summary === null
              ? LOADING
              : `오늘 완료 ${summary.run_outcomes.succeeded}건 · 실패 ${summary.run_outcomes.failed}`
          }
        />
        <KpiCard
          label="평균 헬스 스코어"
          value={
            averageHealth !== null
              ? `${averageHealth.toFixed(1)} / ${HEALTH_MAX}`
              : allLoaded
                ? EM_DASH // 전부 도착했는데 측정된 게 없다 = 측정 불가. 0.0이 아니다.
                : LOADING
          }
          hint={
            projects === null ? LOADING : `${measured.length}/${projects.length} 프로젝트 측정됨`
          }
        />
        <KpiCard
          label="오늘 토큰"
          /*
           * 서버가 run_outcomes.tokens_used로 합산해 준다. 프로젝트 → 에이전트 → 실행을
           * 3중 N+1로 도는 대신 GROUP BY 한 번이면 되는 값이라 서버에 두었다.
           */
          value={summary === null ? LOADING : formatTokens(summary.run_outcomes.tokens_used)}
          hint={summary === null ? LOADING : `오늘 비용 $${summary.cost_by_project.total}`}
        />
        <KpiCard
          label="승인 대기"
          value={projects === null ? LOADING : String(waitingCount)}
          hint="policy_passed 구성"
          requiresAction
        />
      </div>

      <div className="dash__grid">
        <ProjectProgressWidget
          projects={projects}
          details={details}
          loading={projectsState.loading}
        />
        <StreamWidget projects={projects} />
        <PolicyGateWidget items={gateItems} loading={!allLoaded} onApproved={patchConfig} />
        <DoraWidget summary={summary} loading={summaryState.loading} />
      </div>
    </section>
  );
}

/* ── 위젯: 프로젝트 진행 상황 ────────────────────────────────────────────── */

function ProjectProgressWidget({
  projects,
  details,
  loading,
}: {
  projects: readonly ProjectView[] | null;
  details: Record<string, ProjectDetail>;
  loading: boolean;
}) {
  return (
    <section className="widget widget--wide" aria-labelledby="w-projects">
      <div className="widget__head">
        <h2 className="widget__title" id="w-projects">
          프로젝트 진행 상황
        </h2>
        <span className="widget__meta">current_stage 기준</span>
      </div>
      {projects === null ? (
        <p className="widget__empty">{loading ? '불러오는 중' : '표시할 프로젝트가 없다.'}</p>
      ) : (
        <table className="dash-table">
          <thead>
            <tr>
              <th scope="col">프로젝트</th>
              <th scope="col">단계</th>
              <th scope="col">헬스</th>
              <th scope="col">최근 활동</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const detail = details[p.id];
              return (
                <tr key={p.id}>
                  <td className="dash-table__name">{p.name}</td>
                  <td>{isStage(p.current_stage) ? <StageBadge stage={p.current_stage} /> : EM_DASH}</td>
                  <td>
                    {/* 주석 2: 붉어지는 기준은 HealthIndicator 안의 HEALTH_SIGNAL_THRESHOLD 하나뿐이다.
                        여기서 2.5를 다시 적으면 화면마다 기준이 갈라진다. */}
                    {detail === undefined ? (
                      <span className="dash-table__pending">{LOADING}</span>
                    ) : (
                      <HealthIndicator score={detail.health} />
                    )}
                  </td>
                  <td className="dash-table__time">{hhmm(p.updated_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ── 위젯: 에이전트 실행 스트림 ──────────────────────────────────────────── */

/**
 * 주석 4: SSE의 `log` 이벤트를 그대로 받는다.
 *
 * **전역 스트림이 없다는 것이 이 위젯의 제약이다.** `/projects/:id/stream`뿐이라 목업의
 * "전체 로그"를 그대로 만들려면 프로젝트 수만큼 EventSource를 열어야 한다. 그렇게 하지 않는다:
 * HTTP/1.1의 호스트당 동시 연결 한도가 6이고 vite dev 프록시가 HTTP/1.1이라, 프로젝트 7개면
 * 스트림만으로 한도를 먹고 같은 오리진의 나머지 API 호출이 통째로 대기열에 걸린다. 즉 스트림을
 * 다 보려다 대시보드의 다른 위젯이 안 뜨는 거래가 된다.
 * 그래서 **한 프로젝트를 골라 하나만 구독한다.** 전역 스트림 엔드포인트가 생기면 셀렉터를 지우고
 * 그쪽으로 옮긴다.
 *
 * 연결 상태 점을 함께 두는 이유도 같은 주석에 있다 — 이벤트가 안 오는 것이 "조용한 것"인지
 * "끊긴 것"인지 스트림만 봐서는 구분되지 않는다. 최근 로그를 한 번 조회해 초기 화면을 채우는
 * 것도 같은 이유다. 갓 연결된 빈 목록은 "로그가 없다"가 아니라 "아직 안 왔다"이다.
 */
function StreamWidget({ projects }: { projects: readonly ProjectView[] | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  const projectId = selected ?? projects?.[0]?.id ?? null;

  const seedState = useApi<Page<LogView>>(
    projectId === null ? null : `/projects/${projectId}/logs?limit=8`,
  );
  const { events, state } = useSse(projectId);

  const live = events
    .filter((e) => e.type === 'log')
    .map((e) => {
      const payload = e.data as LogAppendedEvent;
      return {
        key: e.id || payload.log_entry_id,
        time: hhmm(payload.created_at),
        level: payload.level,
        message: payload.message,
      };
    });

  const seeded = (seedState.data?.items ?? []).map((l) => ({
    key: l.id,
    time: hhmm(l.created_at),
    level: l.level,
    message: l.message,
  }));

  // 라이브가 먼저, 그 아래에 조회분. 같은 로그가 양쪽에 있으면 라이브 쪽만 남긴다.
  const liveKeys = new Set(live.map((r) => r.key));
  const rows = [...live, ...seeded.filter((r) => !liveKeys.has(r.key))].slice(0, 8);

  const connection =
    projectId === null
      ? { label: `스트림 ${EM_DASH}`, mod: '' }
      : state === 'open'
        ? { label: '스트림 연결됨', mod: '' }
        : state === 'connecting'
          ? { label: '스트림 연결 중', mod: ' stream-dot--connecting' }
          : { label: '스트림 중지', mod: ' stream-dot--closed' };

  return (
    <section className="widget" aria-labelledby="w-stream">
      <div className="widget__head">
        <h2 className="widget__title" id="w-stream">
          에이전트 실행 스트림
        </h2>
        <span className="widget__meta">event: log</span>
      </div>

      <div className="stream__bar">
        <label className="stream__label" htmlFor="stream-project">
          프로젝트
        </label>
        <select
          id="stream-project"
          className="stream__select"
          value={projectId ?? ''}
          onChange={(e) => setSelected(e.target.value)}
          disabled={projects === null}
        >
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="stream__state">
          <span className={`sse-dot${connection.mod}`} aria-hidden="true" />
          {connection.label}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="widget__empty">
          {seedState.loading ? '불러오는 중' : '아직 들어온 로그가 없다.'}
        </p>
      ) : (
        <div className="stream__rows">
          {rows.map((r) => (
            <LogRow
              key={r.key}
              time={r.time}
              // 레벨이 셋 중 하나가 아니면 info로 둔다. error로 올리면 없던 경보를 만든다.
              level={isLogLevel(r.level) ? r.level : 'info'}
              message={r.message}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ── 위젯: Policy Gate 대기 ─────────────────────────────────────────────── */

/**
 * 주석 3: 대시보드에서 바로 승인까지 끝낸다. 단 policy_blocked에는 **승인 버튼이 없다.**
 * 서버가 차단한 구성은 사람이 승인해도 통과하지 않는다는 계약(Part 1 §3.2.1)을, 버튼을
 * 비활성화하는 게 아니라 아예 만들지 않는 것으로 드러낸다. 비활성 버튼은 "권한이 있으면 되는 일"
 * 처럼 읽히지만 이건 권한 문제가 아니다.
 */
function PolicyGateWidget({
  items,
  loading,
  onApproved,
}: {
  items: readonly { project: ProjectView; config: ConfigView }[];
  loading: boolean;
  onApproved: (configId: string, status: BuildStatus) => void;
}) {
  return (
    <section className="widget" aria-labelledby="w-gate">
      <div className="widget__head">
        <h2 className="widget__title" id="w-gate">
          Policy Gate 대기
        </h2>
        <span className="badge">{loading ? LOADING : `${items.length}건`}</span>
      </div>
      {items.length === 0 ? (
        <p className="widget__empty">{loading ? '불러오는 중' : '대기 중인 구성이 없다.'}</p>
      ) : (
        <div className="gate">
          {items.map(({ project, config }) => (
            <GateCard
              key={config.id}
              projectName={project.name}
              config={config}
              onApproved={onApproved}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GateCard({
  projectName,
  config,
  onApproved,
}: {
  projectName: string;
  config: ConfigView;
  onApproved: (configId: string, status: BuildStatus) => void;
}) {
  const blocked = config.build_status === 'policy_blocked';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRisk, setShowRisk] = useState(false);

  // 위험 설명은 눌렀을 때만 가져온다. 차단 건이 여럿이어도 열기 전에는 호출이 없다.
  const checks = useApi<{ items: PolicyCheckView[] }>(
    showRisk ? `/env-configs/${config.id}/policy-checks` : null,
  );

  const approve = () => {
    setBusy(true);
    setError(null);
    apiFetch<ConfigView>(`/env-configs/${config.id}/approve`, { method: 'POST' })
      // 서버가 돌려준 상태를 그대로 반영한다. 유니온 밖 값이면 approved로 단정하지 않고 무시한다.
      .then((updated) => {
        if (isBuildStatus(updated.build_status)) onApproved(config.id, updated.build_status);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '승인에 실패했다.'))
      .finally(() => setBusy(false));
  };

  // Object.keys를 쓰면 "database · language · framework"처럼 **키 이름**이 찍힌다.
  // 보여줄 것은 값("postgresql 16 · node · nestjs")이다. stack_config는 사용자 입력이
  // 그대로 저장되는 자유 객체라 값의 타입을 보장할 수 없으므로 문자열·숫자만 추린다.
  const stack = Object.values(config.stack_config)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    .map(String)
    .filter((v) => v.trim() !== '')
    .join(' · ');
  const status = config.build_status;
  const badgeStatus: BuildStatus = blocked ? 'policy_blocked' : 'policy_passed';

  return (
    <article className={blocked ? 'gate-card gate-card--blocked' : 'gate-card'}>
      <div className="gate-card__head">
        <span className="gate-card__project">{projectName}</span>
        <StatusBadge status={badgeStatus} />
      </div>
      <p className="gate-card__stack">{stack === '' ? EM_DASH : stack}</p>

      {blocked ? (
        <>
          <p className="gate-card__note">승인 절차와 무관하게 차단됐다.</p>
          <div className="gate-card__actions">
            <Button onClick={() => setShowRisk((v) => !v)}>위험 설명</Button>
          </div>
          {showRisk && (
            <div className="gate-card__risk">
              {checks.loading && <p className="widget__empty">불러오는 중</p>}
              {checks.error !== null && (
                <p className="widget__empty">검사 결과를 불러오지 못했다.</p>
              )}
              {(checks.data?.items ?? []).map((c) => (
                <p key={c.id} className="gate-card__risk-line">
                  <span className="gate-card__tool">{c.tool}</span> {c.verdict}
                  {c.risk_notes !== null && ` — ${c.risk_notes}`}
                </p>
              ))}
              {checks.data !== null && checks.data.items.length === 0 && (
                <p className="widget__empty">기록된 검사 결과가 없다.</p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="gate-card__actions">
            {/* 아웃라인이다. 이 화면의 솔리드는 헤더의 "+ 프로젝트 생성" 하나뿐이다. */}
            <Button onClick={approve} disabled={busy || status !== 'policy_passed'}>
              {busy ? '승인 중' : '승인'}
            </Button>
          </div>
          {error !== null && <p className="gate-card__note">{error}</p>}
        </>
      )}
    </article>
  );
}

/* ── 위젯: DORA 종합 ────────────────────────────────────────────────────── */

/** 4지표는 /reports/summary 한 번으로 끝난다. 프로젝트별로 긁어 평균 내지 않는다. */
function DoraWidget({
  summary,
  loading,
}: {
  summary: ReportSummaryView | null;
  loading: boolean;
}) {
  const dora = summary?.dora ?? null;
  const metrics: { label: string; score: number | null }[] =
    dora === null
      ? []
      : [
          { label: '배포 빈도', score: dora.deploy_freq_score },
          { label: '변경 리드타임', score: dora.lead_time_score },
          { label: '변경 실패율', score: dora.change_fail_score },
          { label: 'MTTR', score: dora.mttr_score },
        ];

  return (
    <section className="widget" aria-labelledby="w-dora">
      <div className="widget__head">
        <h2 className="widget__title" id="w-dora">
          DORA 종합
        </h2>
        <span className="widget__meta">
          composite{' '}
          {dora?.composite_score != null ? dora.composite_score.toFixed(1) : loading ? LOADING : EM_DASH}
        </span>
      </div>
      {dora === null ? (
        <p className="widget__empty">{loading ? '불러오는 중' : '집계를 불러오지 못했다.'}</p>
      ) : (
        <div className="dora">
          {metrics.map((m) => (
            <div key={m.label} className="dora__row">
              <span>{m.label}</span>
              {/* 지표 점수도 헬스와 같은 4점 척도라 HealthIndicator를 그대로 쓴다 —
                  비슷한 막대를 새로 만들면 임계 규칙이 두 벌이 된다. */}
              <HealthIndicator score={m.score} />
            </div>
          ))}
          <p className="widget__meta">
            최근 {dora.window_days}일 · 프로젝트 {dora.projects_counted}개 · 이벤트 0건 지표는
            평균에서 제외
          </p>
        </div>
      )}
    </section>
  );
}

export default DashboardPage;
