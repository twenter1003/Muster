import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { HealthIndicator } from '../components/HealthIndicator';
import { apiFetch, type Page } from '../lib/api';
import { EM_DASH, HEALTH_MAX, HEALTH_SIGNAL_THRESHOLD, isHealthSignal } from '../lib/domain';
import { useApi } from '../lib/useApi';
import './ReportsPage.css';

/*
 * 리포트 — DORA · 비용 · 실행 품질 (설계서 07 · 목업 1f).
 *
 * 구조는 목업에서, 색·타이포는 tokens.css에서 온다. 목업의 보라(Nocturne)는 설계서가
 * 폐기했으므로 이 화면에는 hex가 한 글자도 없다 — SVG까지 var(--color-*)/currentColor만 쓴다.
 *
 * 데이터는 /reports/summary 한 번이 거의 전부다. 클라이언트가 AGENT_RUNS를 긁어 합산하면
 * numeric 비용을 부동소수점으로 더하게 되므로, 집계는 서버가 하고 여기서는 표시만 한다.
 */

/* ── 기간 토글 ────────────────────────────────────────────────────────────
 * 상태를 URL에 두는 이유: 리포트는 남에게 보내는 화면이다. "분기 기준으로 봐"를 말로
 * 옮기지 않고 링크 하나로 끝내려면 기간이 주소에 있어야 한다.
 */
const RANGES = [
  { key: '7d', label: '7일', days: 7 },
  { key: '30d', label: '30일', days: 30 },
  { key: '90d', label: '분기', days: 90 },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

/** 서버 기본도 30일이다(reports.service.ts의 DEFAULT_WINDOW_DAYS). 양쪽을 같은 값으로 맞춘다. */
const DEFAULT_RANGE: RangeKey = '30d';

const DAY_MS = 24 * 60 * 60 * 1000;

function toRangeKey(raw: string | null): RangeKey {
  const hit = RANGES.find((r) => r.key === raw);
  return hit === undefined ? DEFAULT_RANGE : hit.key;
}

/* ── 서버 응답 타입 (reports.service.ts의 ReportSummary · aggregate.ts를 그대로 옮긴 것) ── */

interface CostByProjectView {
  items: { project_id: string; name: string; cost: string }[];
  others: { project_count: number; cost: string } | null;
  total: string;
}

interface RunOutcomesView {
  succeeded: number;
  failed: number;
  cancelled: number;
  running: number;
  /** 종료된 실행이 0건이면 null이다. 0%가 아니다 — 0건과 모름을 구분한다. */
  success_rate: number | null;
  /** bigint 합계라 문자열로 온다. number로 옮기지 않는다. */
  tokens_used: string;
}

interface PolicyGateView {
  total_checks: number;
  configs_checked: number;
  first_pass_configs: number;
  first_pass_rate: number | null;
  trivy_blocked: number;
  conftest_blocked: number;
  top_block_reasons: {
    reason: string;
    count: number;
    /** 가장 최근에 그 사유로 막힌 구성. 사유에서 실제 구성으로 건너갈 수 있게 서버가 준다. */
    latest: { env_config_id: string; project_id: string };
  }[];
}

interface DoraView {
  deploy_freq_score: number | null;
  lead_time_score: number | null;
  change_fail_score: number | null;
  mttr_score: number | null;
  composite_score: number | null;
  /** DORA만 요청 구간을 따르지 않고 to 기준 고정 창을 본다. 화면에 그대로 드러낸다. */
  window_days: number;
  projects_counted: number;
}

interface ReportSummaryView {
  window: { from: string; to: string };
  cost_by_project: CostByProjectView;
  run_outcomes: RunOutcomesView;
  policy_gate: PolicyGateView;
  dora: DoraView;
}

interface HealthSnapshotView {
  id: string;
  project_id: string;
  /** numeric이라 문자열로 온다. 좌표 계산 직전에만 숫자로 바꾼다. */
  composite_score: string;
  measured_at: string;
}

/* ── 표시 포맷 ──────────────────────────────────────────────────────────── */

/**
 * 비용 표시. 문자열을 숫자로 바꿨다가 되돌리지 않는다 — numeric 정밀도를 서버에서 지켜
 * 보낸 값을 클라이언트에서 부동소수점으로 왕복시키면 그 노력이 사라진다.
 * 소수 2자리를 넘는 꼬리 0만 문자열 수준에서 떨어뜨린다(반올림하지 않는다).
 */
function formatCost(raw: string): string {
  const [int, frac] = raw.split('.');
  if (frac === undefined) return `$${int}`;
  const trimmed = frac.length > 2 ? frac.slice(0, 2) + frac.slice(2).replace(/0+$/, '') : frac;
  return `$${int}.${trimmed === '' ? '00' : trimmed}`;
}

/** 0~1 비율 → "74%". null이면 EM_DASH다. */
function formatRate(rate: number | null): string {
  return rate === null ? EM_DASH : `${Math.round(rate * 100)}%`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? EM_DASH : iso.slice(0, 10);
}

function formatDayLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 비율을 막대 길이로만 쓴다. 여기서만 Number()를 거치는데, 결과가 화면의 **숫자**가 아니라
 * 픽셀 폭이기 때문이다. 표시되는 금액은 언제나 서버가 준 문자열 그대로다.
 */
function barWidth(cost: string, total: string): string {
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0) return '0%';
  const ratio = Number(cost) / t;
  return `${Math.max(0, Math.min(1, ratio)) * 100}%`;
}

/* ── 헬스 추이 (프로젝트별 N+1) ──────────────────────────────────────────── */

interface Series {
  project_id: string;
  name: string;
  points: { t: number; score: number }[];
}

/**
 * 프로젝트별 헬스 스냅샷을 각각 가져온다.
 *
 * 왜 N+1을 감수하는가: 전역 스냅샷 엔드포인트가 없고 프로젝트가 한 자릿수다(대시보드도
 * 같은 선택을 했다). 대신 하나가 실패해도 catch로 삼켜 그 계열만 빠지게 한다 — 한 프로젝트의
 * 500이 차트 전체를 지우지 않는다.
 */
function useHealthSeries(
  projects: readonly { project_id: string; name: string }[] | null,
  window: { from: string; to: string } | null,
): { series: Series[]; loading: boolean } {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);

  // 배열·객체는 렌더마다 새 참조라 그대로 의존성에 넣으면 무한 루프가 된다. 키로 눌러 둔다.
  const key =
    projects === null || window === null
      ? null
      : `${window.from}|${window.to}|${projects.map((p) => p.project_id).join(',')}`;

  useEffect(() => {
    if (projects === null || window === null || key === null) return;
    if (projects.length === 0) {
      setSeries([]);
      return;
    }

    let live = true;
    setLoading(true);
    const from = new Date(window.from).getTime();
    const to = new Date(window.to).getTime();

    void Promise.all(
      projects.map((p) =>
        apiFetch<Page<HealthSnapshotView>>(`/projects/${p.project_id}/health-snapshots?limit=50`)
          .then((page): Series => ({
            project_id: p.project_id,
            name: p.name,
            points: page.items
              .map((s) => ({
                t: new Date(s.measured_at).getTime(),
                score: Number(s.composite_score),
              }))
              .filter((pt) => Number.isFinite(pt.t) && Number.isFinite(pt.score))
              // 목록은 최신순(keyset desc)으로 온다. 선은 시간순이어야 한다.
              .filter((pt) => pt.t >= from && pt.t <= to)
              .sort((a, b) => a.t - b.t),
          }))
          .catch((): Series => ({ project_id: p.project_id, name: p.name, points: [] })),
      ),
    ).then((result) => {
      if (!live) return;
      setSeries(result);
      setLoading(false);
    });

    return () => {
      live = false;
    };
    // 의존성은 key 하나다. projects/window는 렌더마다 새 참조라 그대로 넣으면 무한 루프가
    // 되고, key가 그 둘의 내용(프로젝트 id 목록 + 구간)을 그대로 대표한다.
  }, [key]);

  return { series, loading };
}

/* ── 내보내기 ──────────────────────────────────────────────────────────────
 * 목업의 "내보내기"에 대응하는 서버 엔드포인트가 없다. 없는 기능을 버튼으로 만들면
 * 누를 때마다 거짓말이 되므로, 화면이 이미 들고 있는 집계만 CSV로 떨어뜨린다 —
 * 서버에 없는 데이터를 지어내지 않는다.
 */
function buildCsv(summary: ReportSummaryView): string {
  const rows: string[][] = [
    ['section', 'key', 'value'],
    ['window', 'from', summary.window.from],
    ['window', 'to', summary.window.to],
    ...summary.cost_by_project.items.map((i) => ['cost_by_project', i.name, i.cost]),
    ...(summary.cost_by_project.others === null
      ? []
      : [
          [
            'cost_by_project',
            `기타 ${summary.cost_by_project.others.project_count}개`,
            summary.cost_by_project.others.cost,
          ],
        ]),
    ['cost_by_project', 'total', summary.cost_by_project.total],
    ['run_outcomes', 'succeeded', String(summary.run_outcomes.succeeded)],
    ['run_outcomes', 'failed', String(summary.run_outcomes.failed)],
    ['run_outcomes', 'cancelled', String(summary.run_outcomes.cancelled)],
    ['run_outcomes', 'running', String(summary.run_outcomes.running)],
    // null은 빈 칸으로 둔다. 0을 적으면 "전부 실패"로 읽힌다.
    ['run_outcomes', 'success_rate', summary.run_outcomes.success_rate?.toString() ?? ''],
    ['run_outcomes', 'tokens_used', summary.run_outcomes.tokens_used],
    ['policy_gate', 'total_checks', String(summary.policy_gate.total_checks)],
    ['policy_gate', 'configs_checked', String(summary.policy_gate.configs_checked)],
    ['policy_gate', 'first_pass_configs', String(summary.policy_gate.first_pass_configs)],
    ['policy_gate', 'first_pass_rate', summary.policy_gate.first_pass_rate?.toString() ?? ''],
    ['policy_gate', 'trivy_blocked', String(summary.policy_gate.trivy_blocked)],
    ['policy_gate', 'conftest_blocked', String(summary.policy_gate.conftest_blocked)],
    ...summary.policy_gate.top_block_reasons.map((r) => [
      'block_reason',
      r.reason,
      String(r.count),
    ]),
    ['dora', 'window_days', String(summary.dora.window_days)],
    ['dora', 'deploy_freq_score', summary.dora.deploy_freq_score?.toString() ?? ''],
    ['dora', 'lead_time_score', summary.dora.lead_time_score?.toString() ?? ''],
    ['dora', 'change_fail_score', summary.dora.change_fail_score?.toString() ?? ''],
    ['dora', 'mttr_score', summary.dora.mttr_score?.toString() ?? ''],
    ['dora', 'composite_score', summary.dora.composite_score?.toString() ?? ''],
  ];

  // 값에 쉼표·따옴표·줄바꿈이 들어올 수 있다(차단 사유는 자유 텍스트다). RFC 4180대로 감싼다.
  return rows.map((cols) => cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

function downloadCsv(summary: ReportSummaryView): void {
  const blob = new Blob(['﻿', buildCsv(summary)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `muster-report-${formatDate(summary.window.from)}_${formatDate(summary.window.to)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── 화면 ─────────────────────────────────────────────────────────────── */

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const range = toRangeKey(params.get('range'));

  // from/to를 클라이언트가 확정해 보낸다. 서버 기본값에 기대면 토글을 눌러도 URL만 바뀌고
  // 요청은 같아진다.
  const path = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? 30;
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);
    return `/reports/summary?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  }, [range]);

  const summary = useApi<ReportSummaryView>(path);
  const data = summary.data;

  const chartProjects = data?.cost_by_project.items ?? null;
  const { series, loading: seriesLoading } = useHealthSeries(chartProjects, data?.window ?? null);

  const selectRange = (key: RangeKey) => {
    const next = new URLSearchParams(params);
    next.set('range', key);
    setParams(next, { replace: true });
  };

  return (
    <section className="rp">
      <header className="rp__header">
        <div>
          <h1 className="page__title rp__title">리포트</h1>
          <p className="meta">
            {data === null
              ? summary.loading
                ? '집계를 불러오는 중'
                : EM_DASH
              : `${formatDate(data.window.from)} ~ ${formatDate(data.window.to)} · 내가 속한 프로젝트 ${data.dora.projects_counted}개`}
          </p>
        </div>

        <div className="rp__controls">
          {/* 기간 토글. 선택 상태는 색이 아니라 aria-pressed + 테두리로 드러낸다. */}
          <div className="rp__toggle" role="group" aria-label="집계 기간">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className="chip rp__chip"
                aria-pressed={r.key === range}
                onClick={() => selectRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          {/* 이 화면의 솔리드는 이것 하나다. 서버 내보내기 API가 없어 화면이 이미 가진
              집계만 CSV로 만든다. */}
          <Button
            variant="solid"
            disabled={data === null}
            onClick={() => data && downloadCsv(data)}
          >
            CSV 내보내기
          </Button>
        </div>
      </header>

      {summary.error !== null && (
        <p className="rp__error" role="alert">
          집계를 불러오지 못했다 — {summary.error.message}
        </p>
      )}

      <div className="rp__row rp__row--top">
        <HealthTrend
          series={series}
          window={data?.window ?? null}
          loading={summary.loading || seriesLoading}
        />
        <DoraWidget
          dora={data?.dora ?? null}
          rangeDays={RANGES.find((r) => r.key === range)?.days ?? 30}
          loading={summary.loading}
        />
      </div>

      <div className="rp__row rp__row--bottom">
        <CostWidget cost={data?.cost_by_project ?? null} loading={summary.loading} />
        <RunOutcomesWidget outcomes={data?.run_outcomes ?? null} loading={summary.loading} />
        <PolicyWidget gate={data?.policy_gate ?? null} loading={summary.loading} />
      </div>
    </section>
  );
}

/* ── 헬스 스코어 추이 ───────────────────────────────────────────────────── */

/*
 * 차트 기하. 라이브러리를 들이지 않는다 — 필요한 것이 폴리라인 하나라서, 번들 100KB와
 * 테마 연동 문제를 같이 떠안을 이유가 없다.
 */
const CHART = { w: 560, h: 200, left: 30, right: 552, top: 20, bottom: 170 } as const;

/**
 * 계열 구분은 **선 스타일**이 맡는다(설계서 07 주석 1). 색 하나로 계열을 나누지 않는 팔레트라
 * 색으로는 구분할 수 없고, 색맹 사용자에게도 선 모양이 더 안전하다. 범례에는 같은 선 모양을
 * 그려 두되 스크린 리더가 읽을 수 있게 텍스트("실선"/"파선")를 함께 쓴다.
 */
const DASH_PATTERNS = [
  { dash: undefined, label: '실선' },
  { dash: '5 4', label: '파선' },
  { dash: '1 4', label: '점선' },
  { dash: '9 4 2 4', label: '일점쇄선' },
  { dash: '2 3 7 3', label: '혼합선' },
] as const;

function patternOf(index: number) {
  return DASH_PATTERNS[index % DASH_PATTERNS.length];
}

function HealthTrend({
  series,
  window,
  loading,
}: {
  series: readonly Series[];
  window: { from: string; to: string } | null;
  loading: boolean;
}) {
  const from = window === null ? 0 : new Date(window.from).getTime();
  const to = window === null ? 0 : new Date(window.to).getTime();
  const span = to - from;

  const x = (t: number) =>
    span <= 0 ? CHART.left : CHART.left + ((t - from) / span) * (CHART.right - CHART.left);
  const y = (score: number) =>
    CHART.bottom -
    (Math.max(0, Math.min(HEALTH_MAX, score)) / HEALTH_MAX) * (CHART.bottom - CHART.top);

  const drawable = series.filter((s) => s.points.length >= 2);
  const thin = series.filter((s) => s.points.length < 2);

  return (
    <section className="card rp-card" aria-labelledby="rp-trend">
      <div className="card__head">
        <h2 className="card__title" id="rp-trend">
          헬스 스코어 추이
        </h2>
        <span className="rp-card__meta">HEALTH_SNAPSHOTS · composite</span>
      </div>

      <div className="card__body">
        {window === null ? (
          <p className="rp-empty">{loading ? '불러오는 중' : '집계가 없다.'}</p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${CHART.w} ${CHART.h}`}
              className="rp-chart"
              role="img"
              aria-label={`프로젝트별 헬스 스코어 추이. ${drawable.map((s) => s.name).join(', ') || '그릴 계열 없음'}`}
            >
              {/* 격자·축은 장식이라 잉크를 흐리게 쓴다. 색은 전부 토큰에서 온다. */}
              <g stroke="var(--color-rule)" strokeWidth="1">
                {[1, 2, 3, 4].map((s) => (
                  <line key={s} x1={CHART.left} y1={y(s)} x2={CHART.right} y2={y(s)} />
                ))}
              </g>
              {/* 신호 임계선. 값은 domain.ts의 상수에서만 온다 — 화면마다 2.5를 적으면 갈라진다. */}
              <line
                x1={CHART.left}
                y1={y(HEALTH_SIGNAL_THRESHOLD)}
                x2={CHART.right}
                y2={y(HEALTH_SIGNAL_THRESHOLD)}
                stroke="var(--color-signal)"
                strokeWidth="1"
                strokeDasharray="2 4"
              />
              <g fill="var(--color-ink-mid)" fontSize="9">
                {[1, 2, 3, 4].map((s) => (
                  <text key={s} x="6" y={y(s) + 3}>
                    {s}
                  </text>
                ))}
              </g>
              <g fill="var(--color-ink-mid)" fontSize="9.5" textAnchor="middle">
                {[0, 0.5, 1].map((f) => (
                  <text key={f} x={CHART.left + f * (CHART.right - CHART.left)} y={CHART.h - 12}>
                    {formatDayLabel(from + f * span)}
                  </text>
                ))}
              </g>
              {drawable.map((s, i) => (
                <polyline
                  key={s.project_id}
                  points={s.points
                    .map((p) => `${x(p.t).toFixed(1)},${y(p.score).toFixed(1)}`)
                    .join(' ')}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeDasharray={patternOf(i).dash}
                />
              ))}
            </svg>

            {/* 범례는 링크다 — 리포트는 읽고 끝나는 화면이 아니다(주석 4). */}
            <ul className="rp-legend">
              {series.map((s, i) => {
                const last = s.points[s.points.length - 1];
                const signal = last !== undefined && isHealthSignal(last.score);
                return (
                  <li key={s.project_id} className="rp-legend__item">
                    <span className="rp-legend__line" aria-hidden="true">
                      <svg viewBox="0 0 24 4" className="rp-legend__svg">
                        <line
                          x1="0"
                          y1="2"
                          x2="24"
                          y2="2"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeDasharray={patternOf(i).dash}
                        />
                      </svg>
                    </span>
                    <Link to={`/projects/${s.project_id}`} className="rp-legend__name">
                      {s.name === '' ? s.project_id : s.name}
                    </Link>
                    {/* 선 모양은 스크린 리더가 못 읽는다. 텍스트로 병기한다. */}
                    <span className="rp-legend__style">{patternOf(i).label}</span>
                    <span
                      className={
                        signal ? 'rp-legend__last rp-legend__last--signal' : 'rp-legend__last'
                      }
                    >
                      {last === undefined ? EM_DASH : last.score.toFixed(1)}
                    </span>
                  </li>
                );
              })}
              {series.length === 0 && (
                <li className="rp-empty">{loading ? '불러오는 중' : '집계된 프로젝트가 없다.'}</li>
              )}
            </ul>

            {/* 점이 1개 이하면 선을 그리지 않는다. 한 점을 이어 "추세"처럼 보이게 하면 거짓이다. */}
            {thin.length > 0 && (
              <p className="rp-note">
                스냅샷이 2개 미만이라 선을 그리지 않은 프로젝트:{' '}
                {thin.map((s) => s.name || s.project_id).join(', ')}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ── DORA ────────────────────────────────────────────────────────────── */

function DoraWidget({
  dora,
  rangeDays,
  loading,
}: {
  dora: DoraView | null;
  rangeDays: number;
  loading: boolean;
}) {
  const metrics =
    dora === null
      ? []
      : [
          { label: '배포 빈도', score: dora.deploy_freq_score },
          { label: '변경 리드타임', score: dora.lead_time_score },
          { label: '변경 실패율', score: dora.change_fail_score },
          { label: 'MTTR', score: dora.mttr_score },
        ];

  return (
    <section className="card rp-card" aria-labelledby="rp-dora">
      <div className="card__head">
        <h2 className="card__title" id="rp-dora">
          DORA 지표별 등급
        </h2>
        <span className="rp-card__meta">
          composite {dora?.composite_score != null ? dora.composite_score.toFixed(1) : EM_DASH}
        </span>
      </div>

      <div className="card__body rp-dora">
        {dora === null ? (
          <p className="rp-empty">{loading ? '불러오는 중' : '집계를 불러오지 못했다.'}</p>
        ) : (
          <>
            {/*
             * DORA만 선택한 기간을 따르지 않는다. 등급 구간이 90일 관측 창을 분모로 만들어져
             * 있어서(서버 dora.ts의 WINDOW_DAYS), 7일치를 그대로 넣으면 빈도가 1/13로 계산된다.
             * 이 사실을 숨기면 "7일 기준 배포 빈도"로 잘못 읽히므로 카드 맨 위에 못박는다.
             */}
            {dora.window_days !== rangeDays && (
              <p className="rp-callout">
                선택한 기간은 {rangeDays}일이지만 DORA만 최근 <strong>{dora.window_days}일</strong>{' '}
                고정 창으로 계산한다 — 등급 구간이 {dora.window_days}일을 분모로 정의돼 있기
                때문이다.
              </p>
            )}
            {dora.window_days === rangeDays && (
              <p className="rp-callout">DORA 관측 창 {dora.window_days}일 — 선택 기간과 같다.</p>
            )}

            {metrics.map((m) => (
              <div key={m.label} className="rp-dora__row">
                <span>{m.label}</span>
                {/* 4점 척도라 헬스와 같은 컴포넌트를 쓴다. 막대를 새로 만들면 임계 규칙이 두 벌이 된다. */}
                <HealthIndicator score={m.score} />
              </div>
            ))}

            <p className="rp-note">
              1인 사이드 프로젝트 특성을 반영해 완화된 등급 구간을 적용했다. 이벤트가 0건인 지표는
              평균 계산에서 제외된다({EM_DASH}로 표시된 지표가 그것이다). 프로젝트{' '}
              {dora.projects_counted}개 합산.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/* ── 프로젝트별 비용 ─────────────────────────────────────────────────────── */

function CostWidget({ cost, loading }: { cost: CostByProjectView | null; loading: boolean }) {
  return (
    <section className="card rp-card" aria-labelledby="rp-cost">
      <div className="card__head">
        <h2 className="card__title" id="rp-cost">
          프로젝트별 비용
        </h2>
        <span className="rp-card__meta">{cost === null ? EM_DASH : formatCost(cost.total)}</span>
      </div>

      <div className="card__body rp-bars">
        {cost === null ? (
          <p className="rp-empty">{loading ? '불러오는 중' : '집계를 불러오지 못했다.'}</p>
        ) : cost.items.length === 0 ? (
          <p className="rp-empty">구간 안에 기록된 실행 비용이 없다.</p>
        ) : (
          <>
            {cost.items.map((item) => (
              <div key={item.project_id} className="rp-bar">
                <div className="rp-bar__head">
                  {/* 각 항목에서 해당 프로젝트로 들어간다(주석 4). */}
                  <Link to={`/projects/${item.project_id}`} className="rp-bar__name">
                    {item.name === '' ? item.project_id : item.name}
                  </Link>
                  <span className="rp-bar__value">{formatCost(item.cost)}</span>
                </div>
                <div className="rp-bar__track">
                  <span
                    className="rp-bar__fill"
                    style={{ width: barWidth(item.cost, cost.total) }}
                  />
                </div>
              </div>
            ))}
            {cost.others !== null && (
              <div className="rp-bar">
                <div className="rp-bar__head">
                  {/* 묶인 것은 프로젝트 하나가 아니라 여럿이라 목록으로 보낸다. */}
                  <Link to="/projects" className="rp-bar__name">
                    기타 {cost.others.project_count}개
                  </Link>
                  <span className="rp-bar__value">{formatCost(cost.others.cost)}</span>
                </div>
                <div className="rp-bar__track">
                  <span
                    className="rp-bar__fill rp-bar__fill--muted"
                    style={{ width: barWidth(cost.others.cost, cost.total) }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ── 실행 결과 분포 ─────────────────────────────────────────────────────── */

function RunOutcomesWidget({
  outcomes,
  loading,
}: {
  outcomes: RunOutcomesView | null;
  loading: boolean;
}) {
  const terminal =
    outcomes === null ? 0 : outcomes.succeeded + outcomes.failed + outcomes.cancelled;

  const rows =
    outcomes === null
      ? []
      : [
          { label: 'succeeded', count: outcomes.succeeded, muted: false },
          { label: 'failed', count: outcomes.failed, muted: true },
          { label: 'cancelled', count: outcomes.cancelled, muted: true },
          { label: 'running', count: outcomes.running, muted: true },
        ];

  return (
    <section className="card rp-card" aria-labelledby="rp-runs">
      <div className="card__head">
        <h2 className="card__title" id="rp-runs">
          실행 결과 분포
        </h2>
        <span className="rp-card__meta">
          AGENT_RUNS {outcomes === null ? EM_DASH : `${terminal + outcomes.running}건`}
        </span>
      </div>

      <div className="card__body rp-bars">
        {outcomes === null ? (
          <p className="rp-empty">{loading ? '불러오는 중' : '집계를 불러오지 못했다.'}</p>
        ) : (
          <>
            <div className="rp-figure">
              {/* 성공률도 회색이다 — 통과율과 같은 이유로 기준선이 아직 없다. */}
              <span className="rp-figure__value">{formatRate(outcomes.success_rate)}</span>
              <span className="meta">
                성공률
                {outcomes.success_rate === null && ' · 종료된 실행이 0건이라 계산할 수 없다'}
              </span>
            </div>

            {rows.map((r) => (
              <div key={r.label} className="rp-bar">
                <div className="rp-bar__head">
                  <span className="rp-bar__name rp-bar__name--plain">{r.label}</span>
                  <span className="rp-bar__value">{r.count}</span>
                </div>
                <div className="rp-bar__track">
                  <span
                    className={r.muted ? 'rp-bar__fill rp-bar__fill--muted' : 'rp-bar__fill'}
                    style={{
                      width:
                        terminal + outcomes.running === 0
                          ? '0%'
                          : `${(r.count / (terminal + outcomes.running)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}

            <p className="rp-note">토큰 {outcomes.tokens_used} · running은 성공률 분모에서 뺀다.</p>
          </>
        )}
      </div>
    </section>
  );
}

/* ── Policy Gate ─────────────────────────────────────────────────────── */

function PolicyWidget({ gate, loading }: { gate: PolicyGateView | null; loading: boolean }) {
  return (
    <section className="card rp-card" aria-labelledby="rp-policy">
      <div className="card__head">
        <h2 className="card__title" id="rp-policy">
          Policy Gate 통과율
        </h2>
        <span className="rp-card__meta">
          {gate === null ? EM_DASH : `검사 ${gate.total_checks}건`}
        </span>
      </div>

      <div className="card__body rp-bars">
        {gate === null ? (
          <p className="rp-empty">{loading ? '불러오는 중' : '집계를 불러오지 못했다.'}</p>
        ) : (
          <>
            {/*
             * 통과율은 회색이다(주석 3). 아직 "몇 %면 좋은가"의 기준선이 없어서, 색으로
             * 평가하면 없는 기준을 만들어 낸 셈이 된다. 기준선이 정해지면 그때 색을 붙인다.
             */}
            <div className="rp-figure">
              <span className="rp-figure__value">{formatRate(gate.first_pass_rate)}</span>
              <span className="meta">
                {gate.first_pass_rate === null
                  ? '검사를 거친 환경 구성이 0건이라 계산할 수 없다'
                  : `구성 ${gate.configs_checked}개 중 1차 통과 ${gate.first_pass_configs}개`}
              </span>
            </div>

            <div className="rp-bar">
              <div className="rp-bar__head">
                <span className="rp-bar__name rp-bar__name--plain">trivy</span>
                <span className="rp-bar__value">차단 {gate.trivy_blocked}</span>
              </div>
            </div>
            <div className="rp-bar">
              <div className="rp-bar__head">
                <span className="rp-bar__name rp-bar__name--plain">conftest</span>
                <span className="rp-bar__value">차단 {gate.conftest_blocked}</span>
              </div>
            </div>

            {/*
             * 차단 사유 순위(주석 2). 통과율만으로는 규칙을 고칠지 프롬프트를 고칠지 알 수 없다.
             */}
            <div className="rp-reasons">
              <h3 className="rp-reasons__title">최다 차단 사유</h3>
              {gate.top_block_reasons.length === 0 ? (
                <p className="rp-empty">기록된 차단 사유가 없다.</p>
              ) : (
                <ol className="rp-reasons__list">
                  {gate.top_block_reasons.map((r) => (
                    <li key={r.reason} className="rp-reasons__item">
                      {/* 사유만 보여 주던 때에는 "그래서 어느 구성인가"를 사용자가
                          프로젝트를 하나씩 열어 찾아야 했다. 가장 최근 건으로 보낸다. */}
                      <Link
                        className="rp-reasons__text"
                        to={`/projects/${r.latest.project_id}?tab=env`}
                        title="가장 최근에 이 사유로 막힌 구성 보기"
                      >
                        {r.reason}
                      </Link>
                      <span className="rp-bar__value">{r.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default ReportsPage;
