import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { HealthIndicator } from '../components/HealthIndicator';
import { LogRow } from '../components/LogRow';
import { Panel } from '../components/Panel';
import type { ApiError, Page } from '../lib/api';
import { EM_DASH, LOG_LEVELS, formatDateTime, type LogLevel } from '../lib/domain';
import { listPath } from '../lib/listQuery';
import { useApi } from '../lib/useApi';
import './LogsHealthPage.css';

/* ───────────────────────── 서버 응답 계약 ─────────────────────────
 * GET /logs?level= 와 GET /health-snapshots —
 * apps/api/src/modules/ingest/cross-project-ingest.controller.ts.
 * 뷰는 프로젝트 하위 경로(project-ingest.controller.ts)의 것과 같고 project_name만 더해진다.
 */
interface LogView {
  id: string;
  project_id: string;
  project_name: string;
  agent_id: string | null;
  level: string;
  message: string;
  created_at: string;
}

interface HealthSnapshotView {
  id: string;
  project_id: string;
  project_name: string;
  /** DORA 4지표. 측정할 이벤트가 없으면 null이다 — 0이 아니다. */
  deploy_freq_score: number | null;
  lead_time_score: number | null;
  change_fail_score: number | null;
  mttr_score: number | null;
  /** 숫자 컬럼이라 문자열로 온다(정밀도를 잃지 않으려고 서버가 그대로 넘긴다). */
  composite_score: string;
  measured_at: string;
}

const LOG_LIMIT = 50;
/** 스냅샷은 프로젝트마다 주기적으로 쌓인다. 최신 한 장씩 고르려면 넉넉히 받아 둬야 한다. */
const HEALTH_LIMIT = 100;

function toLevel(value: string | null): LogLevel | null {
  return value !== null && (LOG_LEVELS as readonly string[]).includes(value)
    ? (value as LogLevel)
    : null;
}

/**
 * 프로젝트마다 가장 최근 스냅샷 한 장만 남긴다.
 *
 * 서버는 측정 시각 내림차순으로 전부 준다. 그대로 그리면 같은 프로젝트가 스무 줄씩
 * 반복되고, "어느 프로젝트가 나쁜가"라는 이 패널의 질문이 묻힌다. 히스토리는 프로젝트
 * 개요와 리포트가 이미 보여 주므로 여기서는 현재 상태만 쓴다.
 *
 * 서버 필터가 아니라 여기서 줄이는 것이 정당한 이유: 이것은 행을 **거르는** 일이 아니라
 * 같은 대상의 중복을 접는 일이라 건수를 속이지 않는다. 다만 한 페이지 안에서만 접으므로,
 * 받은 장수가 상한에 닿았으면 화면이 그 사실을 말한다.
 */
export function latestPerProject(items: readonly HealthSnapshotView[]): HealthSnapshotView[] {
  const seen = new Map<string, HealthSnapshotView>();
  for (const item of items) {
    const kept = seen.get(item.project_id);
    if (kept === undefined || new Date(item.measured_at) > new Date(kept.measured_at)) {
      seen.set(item.project_id, item);
    }
  }
  return [...seen.values()].sort((a, b) => a.project_name.localeCompare(b.project_name, 'ko'));
}

/** 서버에 아직 없는 조회인지. 없는 기능과 빈 목록은 화면에서 달리 말해야 한다. */
function isMissingEndpoint(error: ApiError | null): boolean {
  return error !== null && error.status === 404;
}

function scoreText(score: number | null): string {
  return score === null ? EM_DASH : score.toFixed(1);
}

/**
 * 로그 · 헬스 — 내가 속한 모든 프로젝트의 지금(설계서 Part 4 §7).
 *
 * 탭이 아니라 두 패널을 위아래로 둔다. 두 데이터가 같은 질문의 두 시제이기 때문이다 —
 * 헬스는 "어쩌다 이렇게 됐나"(며칠 단위로 움직이는 상태), 로그는 "지금 무슨 일이 나고
 * 있나"(분 단위). 탭으로 가르면 헬스가 떨어진 프로젝트를 보면서 그 프로젝트의 error 로그를
 * 같이 볼 수 없고, 그 둘을 잇는 것이 이 화면의 유일한 쓸모다. 헬스가 위인 이유는 줄 수가
 * 프로젝트 수로 고정돼 있어서다 — 길이가 예측 불가능한 로그를 위에 두면 헬스가 화면 밖으로
 * 밀린다.
 *
 * 신호색은 두 군데에서만 쓴다: 로그 레벨 error(LogRow의 규칙)와 헬스 2.5 미만
 * (HealthIndicator의 규칙). 둘 다 컴포넌트가 정하고 이 화면은 고르지 않는다.
 */
export function LogsHealthPage() {
  const [params, setParams] = useSearchParams();
  const level = toLevel(params.get('level'));
  const [cursor, setCursor] = useState<string | null>(null);

  // 레벨 필터는 서버가 건다. 한 페이지를 받아 놓고 error만 고르면 "error 2건"이 전체가
  // 아니라 이 페이지 안의 수가 되는데, error를 세는 화면에서 그 거짓말은 특히 나쁘다.
  const logs = useApi<Page<LogView>>(listPath('/logs', { limit: LOG_LIMIT, cursor, level }));
  const health = useApi<Page<HealthSnapshotView>>(
    listPath('/health-snapshots', { limit: HEALTH_LIMIT }),
  );

  const logItems = logs.data?.items ?? [];
  const healthItems = health.data?.items ?? [];
  const latest = latestPerProject(healthItems);

  const select = (next: LogLevel | null) => {
    const p = new URLSearchParams(params);
    if (next === null) p.delete('level');
    else p.set('level', next);
    setParams(p, { replace: true });
    // 조건이 바뀌면 이전 조건에서 받은 커서는 무효다.
    setCursor(null);
  };

  return (
    <section className="page loghealth">
      <header className="page__head">
        <h1 className="page__title">
          로그 · 헬스 <span className="page__count">내가 속한 프로젝트 전체</span>
        </h1>
      </header>

      <Panel
        title="프로젝트 헬스"
        aside={health.loading ? '불러오는 중…' : `${latest.length}개 프로젝트`}
      >
        <p className="meta">
          프로젝트마다 가장 최근 스냅샷 한 장 · 2.5 미만이 신호
          {healthItems.length >= HEALTH_LIMIT &&
            ` · 스냅샷 ${HEALTH_LIMIT}장 상한에 걸려 오래된 프로젝트가 빠졌을 수 있다`}
        </p>

        {isMissingEndpoint(health.error) ? (
          <p className="meta">가로지르는 헬스 조회가 서버에 아직 없다.</p>
        ) : health.error !== null ? (
          <p className="error-note" role="alert">
            헬스를 불러오지 못했다: {health.error.message}
          </p>
        ) : health.loading ? (
          <p className="meta">불러오는 중…</p>
        ) : latest.length === 0 ? (
          // 0.0이 아니라 "없다"다. 레포를 연동하지 않으면 스냅샷 자체가 만들어지지 않는다.
          <p className="meta">측정된 스냅샷이 없다. 헬스는 GitHub 연동이 있어야 계산된다.</p>
        ) : (
          <div className="scroll-x">
            <table className="table loghealth__table">
              <thead>
                <tr>
                  <th scope="col">프로젝트</th>
                  <th scope="col">종합</th>
                  <th scope="col">배포 빈도</th>
                  <th scope="col">리드 타임</th>
                  <th scope="col">변경 실패</th>
                  <th scope="col">MTTR</th>
                  <th scope="col">측정</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((snapshot) => {
                  const composite = Number(snapshot.composite_score);
                  return (
                    <tr key={snapshot.id}>
                      <td>
                        <Link className="loghealth__project" to={`/projects/${snapshot.project_id}`}>
                          {snapshot.project_name}
                        </Link>
                      </td>
                      <td>
                        {/* 숫자로 못 읽히면 —다. 서버가 문자열로 주므로 화면이 확인한다. */}
                        <HealthIndicator score={Number.isFinite(composite) ? composite : null} />
                      </td>
                      <td className="loghealth__num">{scoreText(snapshot.deploy_freq_score)}</td>
                      <td className="loghealth__num">{scoreText(snapshot.lead_time_score)}</td>
                      <td className="loghealth__num">{scoreText(snapshot.change_fail_score)}</td>
                      <td className="loghealth__num">{scoreText(snapshot.mttr_score)}</td>
                      <td className="loghealth__num">
                        <time dateTime={snapshot.measured_at}>
                          {formatDateTime(snapshot.measured_at)}
                        </time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="로그"
        aside={
          <div className="chip-row" role="group" aria-label="로그 레벨 필터">
            <button
              type="button"
              className="chip loghealth__tab"
              aria-pressed={level === null}
              onClick={() => select(null)}
            >
              전체
            </button>
            {LOG_LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                className="chip loghealth__tab"
                aria-pressed={level === l}
                onClick={() => select(l)}
              >
                {l}
              </button>
            ))}
          </div>
        }
      >
        <p className="meta">
          최근 순 · 커서 페이지네이션 limit {LOG_LIMIT} · 레벨 필터는 서버가 건다(전체 기준)
        </p>

        {isMissingEndpoint(logs.error) ? (
          <p className="meta">가로지르는 로그 조회가 서버에 아직 없다.</p>
        ) : logs.error !== null ? (
          <p className="error-note" role="alert">
            로그를 불러오지 못했다: {logs.error.message}
          </p>
        ) : logs.loading ? (
          <p className="meta">불러오는 중…</p>
        ) : logItems.length === 0 ? (
          <p className="meta">
            {level === null ? '적재된 로그가 없다.' : `${level} 레벨 로그가 한 건도 없다.`}
          </p>
        ) : (
          <ul className="loghealth__logs">
            {logItems.map((log) => (
              <li key={log.id} className="loghealth__log">
                {/* 레벨 색은 LogRow가 정한다 — error만 채운 배지다. 이 화면이 다시 정하면
                    같은 규칙이 두 곳에 생긴다. */}
                <LogRow
                  time={formatDateTime(log.created_at)}
                  level={toLevel(log.level) ?? 'info'}
                  message={log.message}
                />
                {/* 프로젝트 이름은 LogRow 밖이다. 안에 넣으려면 LogRow에 링크 슬롯을
                    뚫어야 하는데, 그 컴포넌트는 프로젝트 개요에서도 쓰이고 거기서는
                    프로젝트가 하나뿐이라 넣을 것이 없다. */}
                <Link className="meta loghealth__log-project" to={`/projects/${log.project_id}`}>
                  {log.project_name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="loghealth__foot">
          <span className="meta">
            {logs.loading
              ? '세는 중…'
              : `${logItems.length}건 표시 · ${logs.data?.next_cursor ? '다음 있음' : '마지막 페이지'}`}
          </span>
          <div className="loghealth__pager">
            <Button disabled={cursor === null} onClick={() => setCursor(null)}>
              처음
            </Button>
            <Button
              disabled={!logs.data?.next_cursor}
              onClick={() => setCursor(logs.data?.next_cursor ?? null)}
            >
              다음
            </Button>
          </div>
        </div>
      </Panel>
    </section>
  );
}
