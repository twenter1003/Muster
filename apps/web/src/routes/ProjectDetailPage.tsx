import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { HealthIndicator } from '../components/HealthIndicator';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ApiKeyModal } from '../components/ApiKeyModal';
import { GoalChecklistDrawer, getUpNextItems } from '../components/GoalChecklistDrawer';
import { ApiError, apiFetch, apiPatch, apiPost, type Page } from '../lib/api';
import { EM_DASH, LOG_LEVELS, formatDateTime, type LogLevel, type Measurable } from '../lib/domain';
import { shouldConfirmDraftOverwrite } from '../lib/goalsDraft';
import { getAnalyzeButtonLabel, getUnanalyzedStatusText } from '../lib/goalsProgress';
import {
  getGoalsProgressStats,
  parseGoalChecklist,
  toggleGoalChecklist,
} from '../lib/goalChecklist';
import { formatCost, formatTokenCount, getWasteBadge } from '../lib/tokenIntelligence';
import {
  buildTokenUsageUrl,
  getAgentLabel,
  type AgentFilterType,
  type TokenGranularity,
} from '../lib/agentFilter';
import { TokenStockChart } from '../components/TokenStockChart';
import { ModelUsageBreakdown, type ModelUsageItem } from '../components/ModelUsageBreakdown';
import { formatElapsedTime } from '../lib/projectListUtils';
import { useSse } from '../lib/useSse';
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

interface SessionRunView {
  id: string;
  agent_name: string;
  tokens_used: number;
  cost: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  waste?: {
    level: 'NORMAL' | 'CAUTION' | 'HIGH_WASTE';
    reason: string;
    estimated_wasted_tokens: number;
  };
}

interface WasteInsightSummary {
  total_wasted_tokens: number;
  waste_percentage: number;
  high_waste_sessions_count: number;
  recommendation: string;
}

interface UsageBreakdown {
  today_tokens: string;
  month_tokens: string;
  total_tokens?: string;
  today_cost?: string;
  month_cost?: string;
  total_cost?: string;
  daily: Array<{ date: string; tokens: string; cost?: string }>;
  granularity?: TokenGranularity;
  time_series?: Array<{ key: string; label: string; tokens: string; cost: string }>;
  model_breakdown?: ModelUsageItem[];
  waste_insight?: WasteInsightSummary;
  recent_runs?: SessionRunView[];
}

interface GoalsView {
  content_md: string | null;
  updated_at: string | null;
}

interface RemainingItem {
  title: string;
  description: string;
}

interface ProgressView {
  percent: number;
  summary: string;
  remaining_items: RemainingItem[];
  based_on_commit_sha: string | null;
  analyzed_at: string;
}

const LEVEL_LABEL: Record<LogLevel, string> = { error: 'Error', warn: 'Warn', info: 'Info' };

function healthScore(data: Page<HealthSnapshotView> | null): Measurable<number> {
  const latest = data?.items[0];
  if (!latest) return null;
  const score = Number(latest.composite_score);
  return Number.isFinite(score) ? score : null;
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

/**
 * 목표/요구사항 + 진행률. GitHub 원본 데이터(커밋·배포·로그)와 달리 이 카드만 해석이다 —
 * Gemini가 문서·커밋을 읽고 만든 추정치라는 것을 항상 옆에 적어 둔다.
 *
 * 편집은 별도 라우트가 아니라 이 카드 안에서 펼쳐진다 — "화면은 넷뿐"이라는 IA 원칙
 * (DESIGN_DRIFT.md 11번)을 지킨다.
 */
function GoalsProgressCard({ projectId }: { projectId: string }) {
  const goals = useApi<GoalsView>(`/projects/${projectId}/goals`);
  const progressState = useApi<{ progress: ProgressView | null }>(
    `/projects/${projectId}/progress`,
  );

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const progress = progressState.data?.progress ?? null;
  const checklistItems = useMemo(
    () => parseGoalChecklist(goals.data?.content_md),
    [goals.data?.content_md],
  );
  const stats = useMemo(
    () => getGoalsProgressStats(goals.data?.content_md),
    [goals.data?.content_md],
  );
  const upNextItems = useMemo(() => getUpNextItems(checklistItems, 3), [checklistItems]);
  const remainingPendingCount = Math.max(0, stats.total - stats.completed - upNextItems.length);

  const startEditing = () => {
    setDraftText(goals.data?.content_md ?? '');
    setError(null);
    setEditing(true);
  };

  const handleToggleCheck = (index: number) => {
    if (!goals.data?.content_md || saving || analyzing) return;
    const newContent = toggleGoalChecklist(goals.data.content_md, index);
    setSaving(true);
    setError(null);
    apiPatch<GoalsView>(`/projects/${projectId}/goals`, { content_md: newContent }).then(
      () => {
        setSaving(false);
        goals.reload();
        analyze();
      },
      (err: unknown) => {
        setSaving(false);
        setError(err instanceof ApiError ? `${err.message} (${err.code})` : String(err));
      },
    );
  };

  const runGenerateDraft = () => {
    setConfirmOverwrite(false);
    setDrafting(true);
    setError(null);
    apiPost<{ content_md: string }>(`/projects/${projectId}/goals/draft`).then(
      (res) => {
        setDrafting(false);
        setDraftText(res.content_md);
      },
      (err: unknown) => {
        setDrafting(false);
        setError(err instanceof ApiError ? `${err.message} (${err.code})` : String(err));
      },
    );
  };

  /** 편집 중인 내용이 있으면 먼저 확인을 받는다 — 초안은 저장 전까지 서버에 없어 되돌릴 수 없다. */
  const generateDraft = () => {
    if (shouldConfirmDraftOverwrite(draftText)) {
      setConfirmOverwrite(true);
      return;
    }
    runGenerateDraft();
  };

  const analyze = () => {
    setAnalyzing(true);
    setError(null);
    apiPost<ProgressView>(`/projects/${projectId}/progress/analyze`).then(
      () => {
        setAnalyzing(false);
        progressState.reload();
      },
      (err: unknown) => {
        setAnalyzing(false);
        if (err instanceof ApiError && err.code === 'CONFLICT') {
          setError('먼저 목표를 확정해 주세요.');
          startEditing();
        } else {
          setError(err instanceof ApiError ? `${err.message} (${err.code})` : String(err));
        }
      },
    );
  };

  const saveGoals = () => {
    if (draftText.trim() === '') return;
    setSaving(true);
    setError(null);
    apiPatch<GoalsView>(`/projects/${projectId}/goals`, { content_md: draftText }).then(
      () => {
        setSaving(false);
        setEditing(false);
        goals.reload();
        analyze();
      },
      (err: unknown) => {
        setSaving(false);
        setError(err instanceof ApiError ? `${err.message} (${err.code})` : String(err));
      },
    );
  };

  return (
    <div className="panel detail__panel--wide detail__goals-panel">
      <div className="detail__goals-card-head">
        <span className="panel__head" style={{ margin: 0 }}>
          목표 · 진행률
        </span>
        {stats.total > 0 && (
          <button
            type="button"
            className="detail__goals-drawer-trigger-btn"
            onClick={() => setDrawerOpen(true)}
          >
            전체 체크리스트 보기 ({stats.total}개) ↗
          </button>
        )}
      </div>
      <div className="panel__body">
        {editing ? (
          <div className="detail__goals-editor">
            <textarea
              className="input detail__goals-textarea"
              value={draftText}
              disabled={drafting || saving}
              placeholder="목표/요구사항을 마크다운 체크리스트(- [ ])로 적는다. 또는 아래 버튼으로 AI 초안을 만든다."
              onChange={(e) => setDraftText(e.target.value)}
            />
            {error !== null && (
              <p className="error-note" role="alert">
                {error}
              </p>
            )}
            <div className="detail__goals-actions">
              <Button type="button" onClick={generateDraft} disabled={drafting || saving}>
                {drafting ? '만드는 중…' : 'AI 초안 생성'}
              </Button>
              <Button type="button" onClick={() => setEditing(false)} disabled={drafting || saving}>
                취소
              </Button>
              <Button
                type="button"
                onClick={saveGoals}
                disabled={drafting || saving || draftText.trim() === ''}
              >
                {saving ? '저장하는 중…' : '저장'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="detail__goals-summary">
            {!goals.loading && (
              <p className="meta">
                {goals.data?.content_md
                  ? `목표 확정됨 · ${formatDateTime(goals.data.updated_at!)}`
                  : '아직 목표를 확정하지 않았다.'}
              </p>
            )}
            {goals.loading || progressState.loading ? (
              <p className="meta">불러오는 중…</p>
            ) : progress ? (
              <>
                <div className="detail__goals-bar" aria-hidden="true">
                  <div
                    className="detail__goals-bar-fill"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <p className="detail__big">
                  {progress.percent}%{' '}
                  <span className="meta">
                    {stats.total > 0
                      ? `(${stats.completed}/${stats.total} 완료 · 결정론적 마일스톤)`
                      : 'AI 추정 진행률'}
                  </span>
                </p>
                <p className="meta">{progress.summary}</p>
                {checklistItems.length > 0 ? (
                  <div className="detail__goals-hud">
                    <div className="detail__goals-hud-head">
                      <span className="detail__goals-hud-label">⚡ 다음에 할 일 (Up Next)</span>
                      {remainingPendingCount > 0 && (
                        <span className="meta">외 {remainingPendingCount}개 대기 중</span>
                      )}
                    </div>

                    {upNextItems.length > 0 ? (
                      <div className="detail__goals-upnext-list">
                        {upNextItems.map((item) => (
                          <label key={item.index} className="detail__goals-upnext-item">
                            <input
                              type="checkbox"
                              checked={item.completed}
                              disabled={saving || analyzing}
                              onChange={() => handleToggleCheck(item.index)}
                            />
                            <span className="detail__goals-upnext-title">{item.title}</span>
                            <span className="meta">대기</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="detail__goals-all-done">
                        <span className="badge badge--ok">모든 목표 달성 완료</span>
                        <span className="meta">
                          전체 {stats.total}개 마일스톤을 모두 완료했습니다.
                        </span>
                      </div>
                    )}

                    <div className="detail__goals-cta-row">
                      <button
                        type="button"
                        className="detail__goals-cta-btn"
                        onClick={() => setDrawerOpen(true)}
                      >
                        전체 체크리스트 관리 ({stats.total}개) ↗
                      </button>
                    </div>
                  </div>
                ) : (
                  progress.remaining_items.length > 0 && (
                    <ul className="detail__goals-remaining">
                      {progress.remaining_items.map((item, i) => (
                        <li key={i}>
                          <strong>{item.title}</strong>
                          {item.description && <span className="meta"> — {item.description}</span>}
                        </li>
                      ))}
                    </ul>
                  )
                )}
                <p className="meta">{formatDateTime(progress.analyzed_at)} 분석</p>
              </>
            ) : checklistItems.length > 0 ? (
              <>
                <div className="detail__goals-hud">
                  <div className="detail__goals-hud-head">
                    <span className="detail__goals-hud-label">⚡ 다음에 할 일 (Up Next)</span>
                    {remainingPendingCount > 0 && (
                      <span className="meta">외 {remainingPendingCount}개 대기 중</span>
                    )}
                  </div>

                  {upNextItems.length > 0 ? (
                    <div className="detail__goals-upnext-list">
                      {upNextItems.map((item) => (
                        <label key={item.index} className="detail__goals-upnext-item">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            disabled={saving || analyzing}
                            onChange={() => handleToggleCheck(item.index)}
                          />
                          <span className="detail__goals-upnext-title">{item.title}</span>
                          <span className="meta">대기</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="detail__goals-all-done">
                      <span className="badge badge--ok">모든 목표 달성 완료</span>
                      <span className="meta">
                        전체 {stats.total}개 마일스톤을 모두 완료했습니다.
                      </span>
                    </div>
                  )}

                  <div className="detail__goals-cta-row">
                    <button
                      type="button"
                      className="detail__goals-cta-btn"
                      onClick={() => setDrawerOpen(true)}
                    >
                      전체 체크리스트 관리 ({stats.total}개) ↗
                    </button>
                  </div>
                </div>
                <p className="meta">{getUnanalyzedStatusText(analyzing)}</p>
              </>
            ) : (
              <p className="meta">{getUnanalyzedStatusText(analyzing)}</p>
            )}
            {error !== null && (
              <p className="error-note" role="alert">
                {error}
              </p>
            )}
            <div className="detail__goals-actions">
              <Button type="button" onClick={analyze} disabled={analyzing}>
                {getAnalyzeButtonLabel(analyzing, progress !== null)}
              </Button>
              <Button type="button" onClick={startEditing}>
                목표 직접 편집
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 전체 체크리스트 슬라이드 드로어 */}
      <GoalChecklistDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        contentMd={goals.data?.content_md}
        saving={saving}
        analyzing={analyzing}
        onToggleCheck={handleToggleCheck}
        onEditGoals={() => {
          setDrawerOpen(false);
          startEditing();
        }}
        onAnalyzeProgress={analyze}
      />
      <Modal
        open={confirmOverwrite}
        title="편집 중인 내용을 덮어쓸까?"
        onClose={() => setConfirmOverwrite(false)}
      >
        <div className="modal__form">
          <p className="meta">
            지금 편집 중인 내용이 새 AI 초안으로 바뀐다. 저장하지 않았다면 되돌릴 수 없다.
          </p>
          <div className="modal__actions">
            <Button type="button" onClick={() => setConfirmOverwrite(false)}>
              취소
            </Button>
            <Button type="button" onClick={runGenerateDraft}>
              덮어쓰기
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [level, setLevel] = useState<LogLevel | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [agentFilter, setAgentFilter] = useState<AgentFilterType>('all');

  // 빠른 프로젝트 전환기 목록
  const allProjects = useApi<Page<ProjectView>>('/projects?limit=50');

  // 원클릭 전체 동기화 상태
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

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
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul', []);
  const [chartGranularity, setChartGranularity] = useState<TokenGranularity>('day');
  const usage = useApi<UsageBreakdown>(
    id ? buildTokenUsageUrl(id, agentFilter, tz, chartGranularity) : null,
  );
  const documents = useApi<Page<DocumentView>>(id ? `/projects/${id}/documents?limit=5` : null);

  const { events: sseEvents, state: sseState } = useSse(id ?? null);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [agentStartTimes, setAgentStartTimes] = useState<Record<string, number>>({});
  const [agentHeartbeats, setAgentHeartbeats] = useState<
    Record<
      string,
      {
        tokens_used: number;
        cost: string;
        delta_tokens: number;
        delta_cost: string;
        last_tick_at: number;
      }
    >
  >({});
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));

  // 에이전트 작업 중 실시간 1초 카운트업 타이머
  useEffect(() => {
    if (activeAgents.length === 0) return;
    const interval = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeAgents.length]);

  useEffect(() => {
    if (!sseEvents.length) return;
    const latest = sseEvents[0];
    if (latest.type === 'agent_run_started') {
      const payload = latest.data as { agent_name?: string };
      const name = payload?.agent_name ?? 'agent';
      const curSec = Math.floor(Date.now() / 1000);
      setActiveAgents((prev) => (prev.includes(name) ? prev : [...prev, name]));
      setAgentStartTimes((prev) => ({ ...prev, [name]: prev[name] ?? curSec }));
      setAgentHeartbeats((prev) => ({
        ...prev,
        [name]: {
          tokens_used: 0,
          cost: '0',
          delta_tokens: 0,
          delta_cost: '0',
          last_tick_at: Date.now(),
        },
      }));
      usage.reload();
    } else if (latest.type === 'agent_run_heartbeat') {
      const payload = latest.data as {
        agent_name?: string;
        tokens_used?: number;
        cost?: string;
        delta_tokens?: number;
        delta_cost?: string;
      };
      const name = payload?.agent_name ?? 'agent';
      const curSec = Math.floor(Date.now() / 1000);
      setActiveAgents((prev) => (prev.includes(name) ? prev : [...prev, name]));
      setAgentStartTimes((prev) => ({ ...prev, [name]: prev[name] ?? curSec }));
      setAgentHeartbeats((prev) => ({
        ...prev,
        [name]: {
          tokens_used: payload.tokens_used ?? 0,
          cost: payload.cost ?? '0',
          delta_tokens: payload.delta_tokens ?? 0,
          delta_cost: payload.delta_cost ?? '0',
          last_tick_at: Date.now(),
        },
      }));
    } else if (latest.type === 'agent_run_finished') {
      const payload = latest.data as { agent_name?: string };
      const name = payload?.agent_name ?? 'agent';
      setActiveAgents((prev) => prev.filter((a) => a !== name));
      setAgentStartTimes((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      setAgentHeartbeats((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      usage.reload();
      health.reload();
    } else if (latest.type === 'log') {
      logs.reload();
    } else if (latest.type === 'health_update') {
      health.reload();
    }
  }, [sseEvents]);

  // 실행 중인 에이전트들의 실시간 누적 토큰/비용 합산
  const livePendingTokens = useMemo(
    () =>
      Object.entries(agentHeartbeats).reduce((sum, [name, hb]) => {
        if (!activeAgents.includes(name)) return sum;
        return sum + (hb.tokens_used || 0);
      }, 0),
    [agentHeartbeats, activeAgents],
  );

  const livePendingCost = useMemo(
    () =>
      Object.entries(agentHeartbeats)
        .reduce((sum, [name, hb]) => {
          if (!activeAgents.includes(name)) return sum;
          return sum + Number(hb.cost || 0);
        }, 0)
        .toFixed(4),
    [agentHeartbeats, activeAgents],
  );

  // 원클릭 전체 동기화 실행
  const handleSyncAll = () => {
    if (syncing) return;
    setSyncing(true);
    setJustSynced(false);
    Promise.all([
      project.reload(),
      git.reload(),
      health.reload(),
      commits.reload(),
      deployments.reload(),
      logs.reload(),
      usage.reload(),
      documents.reload(),
    ]).finally(() => {
      setSyncing(false);
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 2500);
    });
  };

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
        <div className="detail__switcher-group">
          <Link to="/" className="meta detail__back-link">
            ← 프로젝트 목록
          </Link>
          {allProjects.data && allProjects.data.items.length > 0 && (
            <div className="detail__switcher">
              <span className="meta detail__switcher-label">빠른 전환:</span>
              <select
                className="input detail__switcher-select"
                value={id}
                onChange={(e) => navigate(`/projects/${e.target.value}`)}
                aria-label="다른 프로젝트로 바로 이동"
              >
                {allProjects.data.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="detail__toprow-actions">
          <div className="detail__sync-wrap">
            <Button
              type="button"
              className="detail__sync-btn"
              onClick={handleSyncAll}
              disabled={syncing}
              title="커밋·배포·로그·토큰 사용량 전체 동기화"
            >
              <svg
                className={`detail__sync-icon ${syncing ? 'detail__sync-icon--spin' : ''}`}
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <span>{syncing ? '동기화 중…' : '새로고침 / 동기화'}</span>
            </Button>
            {justSynced && <span className="detail__synced-feedback">방금 동기화됨</span>}
          </div>

          <Button className="btn--primary" onClick={() => setApiKeyModalOpen(true)}>
            🔑 API 키 관리
          </Button>
          <Button onClick={() => setDeleting(true)} disabled={!project.data}>
            프로젝트 삭제
          </Button>
        </div>
      </div>

      <header className="detail__head">
        <div className="detail__head-row">
          <h1 className="page__title">{project.data?.name ?? EM_DASH}</h1>
          <span className="badge badge--operational">운영 중</span>
          {activeAgents.length > 0 && (
            <span className="badge badge--pulse" style={{ fontSize: '11px' }}>
              ●{' '}
              {activeAgents
                .map((name) => {
                  const start = agentStartTimes[name] ?? nowSec;
                  const elapsed = Math.max(0, nowSec - start);
                  const hb = agentHeartbeats[name];
                  const tokenStr =
                    hb && hb.tokens_used > 0 ? ` · ${formatTokenCount(hb.tokens_used)}` : '';
                  return `${name} (${formatElapsedTime(elapsed)}${tokenStr})`;
                })
                .join(', ')}{' '}
              작업 중
            </span>
          )}
          {latestDeploy && (
            <span
              className={
                latestDeploy.status === 'failure' ? 'badge badge--warn' : 'badge badge--ok'
              }
            >
              {latestDeploy.status === 'success' ? '배포 성공' : '배포 실패'}
            </span>
          )}
          <HealthIndicator score={healthScore(health.data)} />
        </div>
        <div className="detail__head-meta-row">
          {git.data?.integration && (
            <p className="meta">{git.data.integration.repo_url.replace('https://', '')}</p>
          )}
          <button
            type="button"
            className="detail__apikey-link meta"
            onClick={() => setApiKeyModalOpen(true)}
          >
            API 키 연동 ⚙️
          </button>
        </div>
      </header>

      <div className="detail__grid">
        <GoalsProgressCard projectId={id} />

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
          <div className="panel__head detail__agent-head">
            <div className="detail__agent-head-title">
              <span>에이전트 토큰 관제</span>
              {activeAgents.length > 0 ? (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="badge badge--pulse" style={{ fontSize: '11px' }}>
                    ●{' '}
                    {activeAgents
                      .map((name) => {
                        const start = agentStartTimes[name] ?? nowSec;
                        const elapsed = Math.max(0, nowSec - start);
                        const hb = agentHeartbeats[name];
                        const tokenStr =
                          hb && hb.tokens_used > 0 ? ` · ${formatTokenCount(hb.tokens_used)}` : '';
                        return `${name} (${formatElapsedTime(elapsed)}${tokenStr})`;
                      })
                      .join(', ')}{' '}
                    작업 중
                  </span>
                  {livePendingTokens > 0 && (
                    <span
                      className="badge badge--tick"
                      style={{ fontSize: '10px' }}
                      title="하트비트 실시간 틱 수신 중"
                    >
                      ⚡ 라이브 틱 +{formatTokenCount(livePendingTokens)}
                    </span>
                  )}
                </div>
              ) : sseState === 'open' ? (
                <span
                  className="badge badge--live"
                  style={{ fontSize: '10px' }}
                  title="실시간 SSE 연결됨"
                >
                  ● 라이브
                </span>
              ) : null}
            </div>
            <div className="detail__agent-head-actions">
              <button
                type="button"
                className="chip detail__agent-key-btn"
                onClick={() => setApiKeyModalOpen(true)}
              >
                🔑 API 키 연동
              </button>
              <div
                className="chip-row detail__agent-filter-chips"
                role="group"
                aria-label="에이전트 필터"
              >
                <button
                  type="button"
                  className="chip"
                  aria-pressed={agentFilter === 'all'}
                  onClick={() => setAgentFilter('all')}
                >
                  전체 보기
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={agentFilter === 'claude-code'}
                  onClick={() => setAgentFilter('claude-code')}
                >
                  Claude Code
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={agentFilter === 'antigravity'}
                  onClick={() => setAgentFilter('antigravity')}
                >
                  Antigravity
                </button>
              </div>
            </div>
          </div>
          <div className="panel__body">
            {usage.loading ? (
              <p className="meta">불러오는 중…</p>
            ) : usage.data === null ? (
              <p className="meta">{EM_DASH}</p>
            ) : (
              <>
                <p className="detail__big">
                  {formatTokenCount(usage.data.month_tokens)}{' '}
                  <span
                    className="cost-text"
                    style={{ fontSize: 'var(--font-size-base)', fontWeight: 'normal' }}
                  >
                    ({formatCost(usage.data.month_cost)})
                  </span>{' '}
                  {livePendingTokens > 0 && (
                    <span
                      className="stock-hud__live-tick"
                      style={{ fontSize: '12px', marginLeft: '6px' }}
                      title="현재 실행 중인 에이전트의 중간 누적 토큰"
                    >
                      ⚡ +{formatTokenCount(livePendingTokens)} 진행 중
                    </span>
                  )}{' '}
                  <span className="meta">
                    이번 달
                    {usage.data.total_tokens ? (
                      <>
                        {' '}
                        · 총 {formatTokenCount(usage.data.total_tokens)}{' '}
                        <span className="cost-text">({formatCost(usage.data.total_cost)})</span>
                      </>
                    ) : (
                      ''
                    )}
                  </span>
                </p>
                <TokenStockChart
                  data={
                    usage.data.time_series && usage.data.time_series.length > 0
                      ? usage.data.time_series
                      : usage.data.daily.map((d) => ({
                          key: d.date,
                          label: d.date.slice(5).replace('-', '/'),
                          tokens: d.tokens,
                          cost: d.cost || '0.0000',
                        }))
                  }
                  granularity={chartGranularity}
                  onGranularityChange={setChartGranularity}
                  isLoading={usage.loading}
                  livePendingTokens={livePendingTokens}
                  livePendingCost={livePendingCost}
                />

                <p className="meta" style={{ marginTop: 'var(--space-2)' }}>
                  오늘{' '}
                  <strong style={{ color: 'var(--color-ink)' }}>
                    {formatTokenCount(usage.data.today_tokens)} 토큰
                  </strong>{' '}
                  <span className="cost-text">({formatCost(usage.data.today_cost)})</span>
                </p>

                {usage.data.model_breakdown && usage.data.model_breakdown.length > 0 && (
                  <ModelUsageBreakdown
                    models={usage.data.model_breakdown}
                    totalTokens={usage.data.total_tokens || usage.data.month_tokens}
                    totalCost={usage.data.total_cost || usage.data.month_cost}
                  />
                )}

                <div style={{ marginTop: 'var(--space-2)' }}>
                  <button
                    type="button"
                    className="detail__apikey-link meta"
                    onClick={() => setApiKeyModalOpen(true)}
                  >
                    💡 에이전트 연동 방법 및 API 키 발급받기 →
                  </button>
                </div>

                {usage.data.waste_insight &&
                  usage.data.waste_insight.high_waste_sessions_count > 0 && (
                    <div
                      className="detail__goals-remaining"
                      style={{ marginTop: 'var(--space-2)' }}
                    >
                      <p className="meta" style={{ color: 'var(--color-signal, #e05252)' }}>
                        ⚠️ <strong>컨텍스트 팽창 주의</strong> (
                        {usage.data.waste_insight.waste_percentage}% 낭비 추정)
                      </p>
                      <p className="meta">{usage.data.waste_insight.recommendation}</p>
                    </div>
                  )}

                {usage.data.recent_runs && usage.data.recent_runs.length > 0 && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 'var(--space-1)',
                      }}
                    >
                      <p className="meta" style={{ fontWeight: 600 }}>
                        최근 세션 ({usage.data.recent_runs.length}건)
                      </p>
                      <span
                        style={{ fontSize: 'var(--font-size-badge)', color: 'var(--color-cost)' }}
                      >
                        ● 자동 갱신 활성
                      </span>
                    </div>
                    {usage.data.recent_runs.slice(0, 4).map((r) => {
                      const isRunning = r.status === 'running';
                      const badge = isRunning
                        ? { text: '작업 중', className: 'badge badge--pulse' }
                        : getWasteBadge(r.waste?.level);
                      const agentLabel = getAgentLabel(r.agent_name);
                      return (
                        <div key={r.id} className="session-row">
                          <div className="session-row__left">
                            <span className={badge.className}>{badge.text}</span>
                            <span className="badge badge--agent-tag">{agentLabel}</span>
                            <span className="session-row__agent">{r.agent_name}</span>
                          </div>
                          <div className="session-row__right">
                            <span className="session-row__usage">
                              {formatTokenCount(r.tokens_used)}{' '}
                              <span className="cost-text">({formatCost(r.cost)})</span>
                            </span>
                            <span className="meta session-row__time">
                              {formatDateTime(r.started_at)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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

      <ApiKeyModal
        open={apiKeyModalOpen}
        projectId={id}
        projectName={project.data?.name}
        onClose={() => setApiKeyModalOpen(false)}
      />
    </section>
  );
}
