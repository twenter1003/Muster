import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HealthIndicator } from '../components/HealthIndicator';
import { type Page } from '../lib/api';
import { EM_DASH, LOG_LEVELS, formatDateTime, type LogLevel, type Measurable } from '../lib/domain';
import { useApi } from '../lib/useApi';
import './ProjectDetailPage.css';

interface ProjectView {
  id: string;
  name: string;
}

interface GitIntegrationView {
  repo_url: string;
}

interface HealthSnapshotView {
  composite_score: string;
}

interface CommitSummary {
  sha: string;
  message: string;
  authored_at: string | null;
  url: string;
}

interface DeploymentEventView {
  id: string;
  kind: string;
  status: string;
  commit_sha: string;
  occurred_at: string;
}

interface LogView {
  id: string;
  level: string;
  message: string;
  created_at: string;
}

interface DocumentView {
  id: string;
  title: string;
  type: string;
  created_at: string;
}

interface UsageBreakdown {
  today_tokens: string;
  month_tokens: string;
  daily: Array<{ date: string; tokens: string }>;
}

const LEVEL_LABEL: Record<LogLevel, string> = { error: 'Error', warn: 'Warn', info: 'Info' };

function healthScore(data: Page<HealthSnapshotView> | null): Measurable<number> {
  const latest = data?.items[0];
  if (!latest) return null;
  const score = Number(latest.composite_score);
  return Number.isFinite(score) ? score : null;
}

/** daily 사용량을 0~1로 정규화해 간단한 꺾은선으로 그린다. 값이 전부 0이면 바닥선만 남긴다. */
function Sparkline({ daily }: { daily: Array<{ date: string; tokens: string }> }) {
  const values = daily.map((d) => Number(d.tokens));
  const max = Math.max(1, ...values);
  const w = 240;
  const h = 40;
  const step = daily.length > 1 ? w / (daily.length - 1) : 0;
  const points = values.map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`).join(' ');

  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="detail__sparkline"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [level, setLevel] = useState<LogLevel | null>(null);

  const project = useApi<ProjectView>(id ? `/projects/${id}` : null);
  const git = useApi<{ integration: GitIntegrationView | null }>(
    id ? `/projects/${id}/git-integration` : null,
  );
  const health = useApi<Page<HealthSnapshotView>>(
    id ? `/projects/${id}/health-snapshots?limit=1` : null,
  );
  const commits = useApi<{ items: CommitSummary[] }>(id ? `/projects/${id}/commits` : null);
  const deployments = useApi<Page<DeploymentEventView>>(
    id ? `/projects/${id}/deployment-events?limit=10` : null,
  );
  const logs = useApi<Page<LogView>>(
    id ? `/projects/${id}/logs?limit=5${level ? `&level=${level}` : ''}` : null,
  );
  const usage = useApi<UsageBreakdown>(id ? `/projects/${id}/token-usage` : null);
  const documents = useApi<Page<DocumentView>>(id ? `/projects/${id}/documents?limit=5` : null);

  const deploys = useMemo(
    () => (deployments.data?.items ?? []).filter((e) => e.kind === 'deployment').slice(0, 4),
    [deployments.data],
  );
  const workflows = useMemo(
    () => (deployments.data?.items ?? []).filter((e) => e.kind === 'workflow_run').slice(0, 4),
    [deployments.data],
  );
  const latestDeploy = deploys[0];

  if (!id) return null;

  return (
    <section className="page detail">
      <Link to="/" className="meta">
        ← 프로젝트 목록
      </Link>

      <header className="detail__head">
        <div className="detail__head-row">
          <h1 className="page__title">{project.data?.name ?? EM_DASH}</h1>
          {latestDeploy && (
            <span className={latestDeploy.status === 'failure' ? 'badge badge--signal' : 'badge'}>
              {latestDeploy.status === 'success' ? '배포 성공' : '배포 실패'}
            </span>
          )}
          <HealthIndicator score={healthScore(health.data)} />
        </div>
        {git.data?.integration && (
          <p className="meta">{git.data.integration.repo_url.replace('https://', '')}</p>
        )}
      </header>

      <div className="detail__grid">
        <div className="panel">
          <p className="panel__head">최근 커밋</p>
          <div className="panel__body">
            {commits.loading ? (
              <p className="meta">불러오는 중…</p>
            ) : commits.error !== null ? (
              <p className="error-note" role="alert">
                불러오지 못했다: {commits.error.message}
              </p>
            ) : (commits.data?.items.length ?? 0) === 0 ? (
              <p className="meta">아직 커밋이 없다.</p>
            ) : (
              commits.data!.items.map((c) => (
                <a
                  key={c.sha}
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="detail__row"
                >
                  <span className="meta detail__sha">{c.sha.slice(0, 7)}</span>
                  <span className="detail__row-text">{c.message}</span>
                  <span className="meta">
                    {c.authored_at ? formatDateTime(c.authored_at) : EM_DASH}
                  </span>
                </a>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <p className="panel__head">Claude 토큰 사용량</p>
          <div className="panel__body">
            {usage.loading ? (
              <p className="meta">불러오는 중…</p>
            ) : usage.data === null ? (
              <p className="meta">{EM_DASH}</p>
            ) : (
              <>
                <p className="detail__big">
                  {usage.data.month_tokens} <span className="meta">이번 달 누적</span>
                </p>
                <Sparkline daily={usage.data.daily} />
                <p className="meta">오늘 {usage.data.today_tokens} 토큰</p>
              </>
            )}
          </div>
        </div>

        <div className="panel">
          <p className="panel__head">배포 상황</p>
          <div className="panel__body">
            {deployments.loading ? (
              <p className="meta">불러오는 중…</p>
            ) : deploys.length === 0 ? (
              <p className="meta">배포 기록이 없다.</p>
            ) : (
              deploys.map((d) => (
                <div key={d.id} className="detail__row">
                  <span className={d.status === 'failure' ? 'badge badge--signal' : 'badge'}>
                    {d.status === 'success' ? '성공' : '실패'}
                  </span>
                  <span className="detail__row-text">{d.commit_sha.slice(0, 7)}</span>
                  <span className="meta">{formatDateTime(d.occurred_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <p className="panel__head">빌드 · 테스트 워크플로</p>
          <div className="panel__body">
            {deployments.loading ? (
              <p className="meta">불러오는 중…</p>
            ) : workflows.length === 0 ? (
              <p className="meta">실행 기록이 없다.</p>
            ) : (
              workflows.map((w) => (
                <div key={w.id} className="detail__row">
                  <span className={w.status === 'failure' ? 'badge badge--signal' : 'badge'}>
                    {w.status === 'success' ? '성공' : '실패'}
                  </span>
                  <span className="detail__row-text">{w.commit_sha.slice(0, 7)}</span>
                  <span className="meta">{formatDateTime(w.occurred_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <p className="panel__head">
            에러 로그
            <span className="chip-row detail__chips">
              <button
                type="button"
                className="chip"
                aria-pressed={level === null}
                onClick={() => setLevel(null)}
              >
                전체
              </button>
              {LOG_LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className="chip"
                  aria-pressed={level === l}
                  onClick={() => setLevel(l)}
                >
                  {LEVEL_LABEL[l]}
                </button>
              ))}
            </span>
          </p>
          <div className="panel__body">
            {logs.loading ? (
              <p className="meta">불러오는 중…</p>
            ) : (logs.data?.items.length ?? 0) === 0 ? (
              <p className="meta">로그가 없다.</p>
            ) : (
              logs.data!.items.map((l) => (
                <div key={l.id} className="detail__row">
                  <span className={l.level === 'error' ? 'badge badge--signal' : 'badge'}>
                    {l.level.toUpperCase()}
                  </span>
                  <span className="detail__row-text">{l.message}</span>
                  <span className="meta">{formatDateTime(l.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <p className="panel__head">문서</p>
          <div className="panel__body">
            {documents.loading ? (
              <p className="meta">불러오는 중…</p>
            ) : (documents.data?.items.length ?? 0) === 0 ? (
              <p className="meta">등록된 문서가 없다.</p>
            ) : (
              documents.data!.items.map((doc) => (
                <div key={doc.id} className="detail__row">
                  <span className="detail__row-text">{doc.title}</span>
                  <span className="meta">{formatDateTime(doc.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
