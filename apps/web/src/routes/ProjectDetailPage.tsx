import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { HealthIndicator } from '../components/HealthIndicator';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ApiError, apiFetch, type Page } from '../lib/api';
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

type DeleteMode = 'site' | 'repo';

/**
 * 확인을 이름 입력으로 받는다 — 삭제는 레포 연동(웹훅)까지 함께 해제되는 되돌릴 수 없는
 * 동작이라, 버튼 한 번으로 끝나면 무엇이 사라지는지 읽지 않고 누르게 된다.
 *
 * 연동된 레포가 있으면 "Muster에서만 제거"와 "GitHub 레포 자체도 삭제"를 나눠 묻는다.
 * 후자는 완전히 다른 무게의 동작(실제 GitHub 데이터가 영구히 사라짐)이라 기본값이 아니다.
 */
function DeleteProjectDialog({
  projectId,
  projectName,
  repoFullName,
  open,
  onClose,
}: {
  projectId: string;
  projectName: string;
  /** 연동된 레포가 없으면 null — 그때는 "GitHub 레포도 삭제" 선택지 자체를 안 보여준다. */
  repoFullName: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<DeleteMode>('site');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmTarget = mode === 'repo' && repoFullName !== null ? repoFullName : projectName;
  const matches = typed.trim() === confirmTarget;

  const changeMode = (next: DeleteMode) => {
    setMode(next);
    setTyped(''); // 확인 대상이 바뀌므로 이전에 입력해 둔 것은 더 이상 맞지 않는다.
  };

  const remove = () => {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);

    const path =
      mode === 'repo' ? `/projects/${projectId}?delete_repo=true` : `/projects/${projectId}`;

    apiFetch<void>(path, { method: 'DELETE' }).then(
      // 지운 프로젝트에 머물면 다음 조회가 전부 404다. 목록으로 돌려보낸다.
      () => navigate('/', { replace: true }),
      (err: unknown) => {
        setBusy(false);
        setError(err instanceof ApiError ? `${err.message} (${err.code})` : String(err));
      },
    );
  };

  return (
    <Modal open={open} title="프로젝트 삭제" onClose={busy ? () => undefined : onClose}>
      <div className="modal__form">
        {repoFullName !== null && (
          <div className="detail__delete-modes" role="radiogroup" aria-label="삭제 범위">
            <label className="detail__delete-mode">
              <input
                type="radio"
                name="delete-mode"
                checked={mode === 'site'}
                disabled={busy}
                onChange={() => changeMode('site')}
              />
              <span>
                <strong>Muster에서만 제거</strong>
                <span className="meta"> — GitHub 레포는 그대로 둔다. 웹훅 연동만 해제한다.</span>
              </span>
            </label>
            <label className="detail__delete-mode">
              <input
                type="radio"
                name="delete-mode"
                checked={mode === 'repo'}
                disabled={busy}
                onChange={() => changeMode('repo')}
              />
              <span>
                <strong>GitHub 레포 자체도 삭제</strong>
                <span className="meta">
                  {' '}
                  — {repoFullName}의 코드·이슈·PR이 GitHub에서 영구히 사라진다. 되돌릴 수 없다.
                </span>
              </span>
            </label>
          </div>
        )}

        {mode === 'repo' ? (
          <p className="meta">
            GitHub 레포 삭제 권한(<code>delete_repo</code>)이 로그인 토큰에 없으면 실패한다 — 그러면
            로그아웃 후 다시 로그인해야 한다.
          </p>
        ) : (
          <p className="meta">
            레포 연동(웹훅)과 이 프로젝트의 문서·에이전트·로그·감사 기록이 함께 사라진다. 되돌릴 수
            없다.
          </p>
        )}
        <p className="meta">
          지우려면 {mode === 'repo' ? 'GitHub 레포 이름' : '프로젝트 이름'}{' '}
          <strong>{confirmTarget}</strong>을(를) 그대로 입력한다.
        </p>
        <input
          className="input modal__input"
          aria-label={mode === 'repo' ? '확인을 위한 레포 이름' : '확인을 위한 프로젝트 이름'}
          value={typed}
          disabled={busy}
          placeholder={confirmTarget}
          onChange={(e) => setTyped(e.target.value)}
        />
        {error !== null && (
          <p className="error-note" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <Button type="button" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button type="button" onClick={remove} disabled={!matches || busy}>
            {busy ? '지우는 중…' : '삭제'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [level, setLevel] = useState<LogLevel | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      {project.data && (
        <DeleteProjectDialog
          projectId={id}
          projectName={project.data.name}
          repoFullName={
            git.data?.integration
              ? git.data.integration.repo_url.replace('https://github.com/', '')
              : null
          }
          open={deleting}
          onClose={() => setDeleting(false)}
        />
      )}

      <div className="detail__toprow">
        <Link to="/" className="meta">
          ← 프로젝트 목록
        </Link>
        <Button onClick={() => setDeleting(true)} disabled={!project.data}>
          프로젝트 삭제
        </Button>
      </div>

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
