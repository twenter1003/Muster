import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { API_BASE, ApiError, apiFetch, apiPost, type Page as ApiPage } from '../lib/api';
import { EM_DASH } from '../lib/domain';
import { useApi } from '../lib/useApi';
import './SettingsPage.css';

/* ───────────────────────── 서버 계약 ─────────────────────────
 * 전부 apps/api 의 컨트롤러에서 읽은 그대로다. 추측한 필드는 없다.
 *   GET  /projects                        → Page<ProjectView>
 *   GET  /projects/:id/budget             → BudgetUsage
 *   PUT  /projects/:id/budget             → BudgetUsage   (전체 교체)
 *   GET  /projects/:id/api-keys           → Page<ApiKeyView>
 *   POST /projects/:id/api-keys           → ApiKeyView & { key }
 *   DELETE /api-keys/:id                  → 204
 *   GET  /projects/:id/git-integration    → { integration: GitIntegrationView | null }
 *   POST /projects/:id/git-integration    → GitIntegrationView
 *   DELETE /projects/:id/git-integration  → 204
 */

interface ProjectView {
  id: string;
  name: string;
}

interface BudgetView {
  token_limit: string | null;
  cost_limit: string | null;
  alert_threshold_pct: string;
  used_tokens: string;
  used_cost: string;
  /** 한도가 없으면 null이다 — 0%가 아니다. */
  token_usage_pct: number | null;
  cost_usage_pct: number | null;
  updated_at: string | null;
}

interface ApiKeyView {
  /** 원문의 마지막 4자. 이 컬럼이 생기기 전 키는 null. */
  key_suffix: string | null;
  id: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
}

interface GitIntegrationView {
  id: string;
  repo_url: string;
  connected_at: string;
}

/* ───────────────────────── 탭 ─────────────────────────
 * 라우트가 `/settings/*` 하나라서 탭은 뒤쪽 세그먼트로 읽는다.
 * 알림 탭은 만들지 않았다: 알림 설정을 저장할 엔드포인트가 없어, 폼을 두면 저장되지 않는
 * 값을 저장된 것처럼 보여 주게 된다. 없는 화면보다 거짓말하는 화면이 나쁘다.
 */
const TABS = [
  { id: 'budget', label: '예산' },
  { id: 'api-keys', label: 'API 키' },
  { id: 'git', label: 'Git 연동' },
  { id: 'members', label: '멤버' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function toTab(value: string | undefined): TabId {
  const head = (value ?? '').split('/')[0];
  return (TABS as readonly { id: string }[]).some((t) => t.id === head) ? (head as TabId) : 'budget';
}

/** 날짜는 목록에서 훑어보는 값이라 연-월-일까지만 남긴다. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? EM_DASH : d.toISOString().slice(0, 10);
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return `${e.message} (${e.code})`;
  return e instanceof Error ? e.message : String(e);
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = toTab(useParams()['*']);

  const { data: projectPage, error: projectError, loading: projectLoading } =
    useApi<ApiPage<ProjectView>>('/projects?limit=100');

  const projects = useMemo(() => projectPage?.items ?? [], [projectPage]);

  /* 예산·키·연동은 전부 프로젝트 단위인데 경로에 :projectId가 없다. 그래서 선택기를 두고
   * 선택 상태를 URL(?project=)에 둔다 — 새로고침·링크 공유로 선택이 날아가면,
   * "이 프로젝트의 예산 화면"을 남에게 건네는 일이 성립하지 않는다. */
  const requested = params.get('project');
  const projectId =
    requested !== null && projects.some((p) => p.id === requested)
      ? requested
      : (projects[0]?.id ?? null);

  const selectProject = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('project', id);
    setParams(next, { replace: true });
  };

  // 탭은 경로에 둔다(라우트가 /settings/*). 프로젝트 선택 쿼리는 그대로 들고 간다 —
  // 탭을 옮겼다고 보고 있던 프로젝트가 바뀌면 안 된다.
  const setTab = (next: TabId) => {
    const query = params.toString();
    navigate(`/settings/${next}${query.length > 0 ? `?${query}` : ''}`, { replace: true });
  };

  return (
    <section className="settings">
      <header className="settings__head">
        <h1 className="page__title">설정</h1>
        <label className="settings__picker">
          <span className="meta">프로젝트</span>
          <select
            className="settings__select"
            value={projectId ?? ''}
            disabled={projects.length === 0}
            onChange={(e) => selectProject(e.target.value)}
          >
            {projects.length === 0 ? <option value="">{EM_DASH}</option> : null}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <p className="meta">
        예산·API 키·Git 연동은 모두 프로젝트 단위다(PROJECT_BUDGETS · 1:1). 위에서 고른 프로젝트의
        설정을 보여 준다.
      </p>

      <div className="settings__body">
        <nav className="settings__tabs" aria-label="설정 영역">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="settings__tab"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings__panel">
          {projectError !== null ? (
            <p className="settings__error" role="alert">
              프로젝트 목록을 불러오지 못했다: {errorMessage(projectError)}
            </p>
          ) : projectLoading ? (
            <p className="meta">불러오는 중…</p>
          ) : projectId === null ? (
            <p className="meta">설정할 프로젝트가 없다.</p>
          ) : tab === 'budget' ? (
            <BudgetTab projectId={projectId} />
          ) : tab === 'api-keys' ? (
            <ApiKeysTab projectId={projectId} />
          ) : tab === 'git' ? (
            <GitTab projectId={projectId} />
          ) : (
            <MembersTab projectId={projectId} />
          )}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── 예산 ─────────────────────────
 * 금액은 numeric(12,4)다. 문자열로 받아 문자열로 보낸다 — parseFloat로 왕복시키면
 * 45.0000이 45.00000000000001 같은 값이 되어 임계치 판정이 어긋난다.
 * 화면에 표시하는 사용률만 서버가 이미 number로 계산해 준 값을 쓴다.
 */

const INT_PATTERN = /^\d+$/;
const DECIMAL_PATTERN = /^\d+(\.\d{1,4})?$/;

interface BudgetForm {
  tokenUnlimited: boolean;
  tokenLimit: string;
  costUnlimited: boolean;
  costLimit: string;
  thresholdPct: string;
}

function toForm(b: BudgetView): BudgetForm {
  return {
    tokenUnlimited: b.token_limit === null,
    tokenLimit: b.token_limit ?? '',
    costUnlimited: b.cost_limit === null,
    costLimit: b.cost_limit ?? '',
    thresholdPct: b.alert_threshold_pct,
  };
}

function BudgetTab({ projectId }: { projectId: string }) {
  const { data, error, loading, reload } = useApi<BudgetView>(`/projects/${projectId}/budget`);
  const [form, setForm] = useState<BudgetForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(data === null ? null : toForm(data));
    setSaveError(null);
    setSaved(false);
  }, [data]);

  const patch = useCallback((p: Partial<BudgetForm>) => {
    setForm((f) => (f === null ? f : { ...f, ...p }));
    setSaved(false);
  }, []);

  if (error !== null) {
    return (
      <p className="settings__error" role="alert">
        예산을 불러오지 못했다: {errorMessage(error)}
      </p>
    );
  }
  if (loading || form === null || data === null) return <p className="meta">불러오는 중…</p>;

  const tokenInvalid = !form.tokenUnlimited && !INT_PATTERN.test(form.tokenLimit);
  const costInvalid = !form.costUnlimited && !DECIMAL_PATTERN.test(form.costLimit);
  const pct = Number(form.thresholdPct);
  const pctInvalid =
    !INT_PATTERN.test(form.thresholdPct) || !Number.isFinite(pct) || pct < 1 || pct > 100;
  const invalid = tokenInvalid || costInvalid || pctInvalid;

  const submit = () => {
    if (invalid || saving) return; // 중복 제출 차단
    setSaving(true);
    setSaveError(null);
    // 문자열 그대로 싣는다. 임계치만 서버 DTO가 number를 요구한다(@IsNumber).
    const body = {
      token_limit: form.tokenUnlimited ? null : form.tokenLimit,
      cost_limit: form.costUnlimited ? null : form.costLimit,
      alert_threshold_pct: pct,
    };
    apiFetch<BudgetView>(`/projects/${projectId}/budget`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
      .then(() => {
        setSaved(true);
        reload();
      })
      .catch((e: unknown) => setSaveError(errorMessage(e)))
      .finally(() => setSaving(false));
  };

  return (
    <div className="settings__section">
      <h2 className="settings__section-title">예산</h2>

      {/* 되돌릴 수 없지는 않지만 조용히 파괴적인 동작이라, PUT의 의미를 폼 위에 못박는다. */}
      <p className="settings__warn" role="note">
        저장은 <strong>전체 교체(PUT)</strong>다. 아래 세 값이 그대로 예산이 된다 — "한도 없음"으로
        둔 항목은 "안 건드림"이 아니라 <strong>한도가 사라진다</strong>.
      </p>

      <div className="settings__grid">
        <LimitField
          label="토큰 한도 (월)"
          hint="정수. 예: 15000000"
          unlimited={form.tokenUnlimited}
          value={form.tokenLimit}
          invalid={tokenInvalid}
          invalidHint="정수만 입력할 수 있다."
          onUnlimited={(v) => patch({ tokenUnlimited: v })}
          onValue={(v) => patch({ tokenLimit: v })}
        />
        <LimitField
          label="비용 한도 (USD)"
          hint="소수점 4자리까지. 예: 45.0000"
          unlimited={form.costUnlimited}
          value={form.costLimit}
          invalid={costInvalid}
          invalidHint="소수점 4자리 이하 숫자만 입력할 수 있다."
          onUnlimited={(v) => patch({ costUnlimited: v })}
          onValue={(v) => patch({ costLimit: v })}
        />
        <div className="field settings__field">
          <label className="meta settings__label" htmlFor="budget-threshold">
            알림 임계치 (%)
          </label>
          <input
            id="budget-threshold"
            className="input settings__input"
            inputMode="numeric"
            value={form.thresholdPct}
            aria-invalid={pctInvalid}
            onChange={(e) => patch({ thresholdPct: e.target.value })}
          />
          <p className="meta">
            {pctInvalid ? '1~100 사이 정수여야 한다.' : '한도가 없으면 임계치도 의미가 없다.'}
          </p>
        </div>
      </div>

      <dl className="settings__usage">
        <div>
          <dt>토큰 사용</dt>
          <dd>
            {data.used_tokens} / {data.token_limit ?? '한도 없음'}{' '}
            <span className="settings__pct">{formatPct(data.token_usage_pct)}</span>
          </dd>
        </div>
        <div>
          <dt>비용 사용</dt>
          <dd>
            ${data.used_cost} / {data.cost_limit === null ? '한도 없음' : `$${data.cost_limit}`}{' '}
            <span className="settings__pct">{formatPct(data.cost_usage_pct)}</span>
          </dd>
        </div>
        <div>
          <dt>마지막 저장</dt>
          <dd>{data.updated_at === null ? EM_DASH : shortDate(data.updated_at)}</dd>
        </div>
      </dl>

      {saveError !== null ? (
        <p className="settings__error" role="alert">
          저장하지 못했다: {saveError}
        </p>
      ) : null}
      {saved ? <p className="meta" role="status">예산을 교체했다.</p> : null}

      <div className="settings__actions">
        {/* 화면당 솔리드 1개 — 설정 화면에서 사용자가 값을 바꿔 확정하는 유일한 자리다. */}
        <Button variant="solid" disabled={invalid || saving} onClick={submit}>
          {saving ? '저장 중…' : '예산 저장 (전체 교체)'}
        </Button>
        <Button
          disabled={saving}
          onClick={() => {
            setForm(toForm(data));
            setSaveError(null);
            setSaved(false);
          }}
        >
          되돌리기
        </Button>
      </div>
    </div>
  );
}

/** 한도 없음(null)과 0을 섞지 않는다 — null은 "한도 없음"이지 0%가 아니다. */
function formatPct(value: number | null): string {
  return value === null ? `${EM_DASH} (한도 없음)` : `${value}%`;
}

interface LimitFieldProps {
  label: string;
  hint: string;
  unlimited: boolean;
  value: string;
  invalid: boolean;
  invalidHint: string;
  onUnlimited: (v: boolean) => void;
  onValue: (v: string) => void;
}

function LimitField(props: LimitFieldProps) {
  const id = `limit-${props.label}`;
  return (
    <div className="field settings__field">
      <label className="meta settings__label" htmlFor={id}>
        {props.label}
      </label>
      <input
        id={id}
        className="input settings__input"
        inputMode="decimal"
        value={props.unlimited ? '' : props.value}
        disabled={props.unlimited}
        placeholder={props.unlimited ? '한도 없음' : ''}
        aria-invalid={props.invalid}
        onChange={(e) => props.onValue(e.target.value)}
      />
      {/* 체크박스를 둔 이유: 빈 칸을 "한도 없음"으로 조용히 해석하면, 지우다 만 값과
          의도한 무제한이 구분되지 않는다. 의도를 명시적으로 받는다. */}
      <label className="settings__check">
        <input
          type="checkbox"
          checked={props.unlimited}
          onChange={(e) => props.onUnlimited(e.target.checked)}
        />
        한도 없음
      </label>
      <p className="meta">{props.invalid ? props.invalidHint : props.hint}</p>
    </div>
  );
}

/* ───────────────────────── API 키 ─────────────────────────
 * 원문은 발급 응답에서 1회만 온다. 서버는 해시만 저장하므로 재조회 경로가 아예 없다.
 * 그래서 목록에는 마스킹 표기조차 실제 값에서 나오지 않는다(서버가 접두/말미를 안 준다).
 */

function ApiKeysTab({ projectId }: { projectId: string }) {
  const { data, error, loading, reload } = useApi<ApiPage<ApiKeyView>>(
    `/projects/${projectId}/api-keys?limit=50`,
  );

  const [label, setLabel] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ label: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // 프로젝트가 바뀌면 다른 프로젝트의 1회성 원문이 화면에 남아 있으면 안 된다.
  useEffect(() => {
    setIssued(null);
    setConfirmId(null);
    setRevokeError(null);
  }, [projectId]);

  const issue = () => {
    if (issuing || label.trim().length === 0) return; // 중복 제출 차단
    setIssuing(true);
    setIssueError(null);
    apiFetch<ApiKeyView & { key: string }>(`/projects/${projectId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify({ label: label.trim() }),
    })
      .then((res) => {
        setIssued({ label: res.label, key: res.key });
        setCopied(false);
        setLabel('');
        reload();
      })
      .catch((e: unknown) => setIssueError(errorMessage(e)))
      .finally(() => setIssuing(false));
  };

  const revoke = (id: string) => {
    if (revoking !== null) return; // 중복 제출 차단
    setRevoking(id);
    setRevokeError(null);
    apiFetch<void>(`/api-keys/${id}`, { method: 'DELETE' })
      .then(() => {
        setConfirmId(null);
        reload();
      })
      .catch((e: unknown) => setRevokeError(errorMessage(e)))
      .finally(() => setRevoking(null));
  };

  const copy = (key: string) => {
    // clipboard API는 비보안 컨텍스트에서 없다. 없으면 조용히 실패하지 말고 사실을 알린다.
    if (typeof navigator.clipboard?.writeText !== 'function') {
      setIssueError('이 브라우저에서는 자동 복사가 되지 않는다. 위 값을 직접 선택해 복사하라.');
      return;
    }
    void navigator.clipboard.writeText(key).then(
      () => setCopied(true),
      () => setIssueError('복사하지 못했다. 위 값을 직접 선택해 복사하라.'),
    );
  };

  const keys = data?.items ?? [];

  return (
    <div className="settings__section">
      <h2 className="settings__section-title">프로젝트 API 키</h2>

      {/* 1회성 원문. 발급 직후에만, 그리고 이 화면을 벗어나면 끝이라는 사실과 함께 보여 준다. */}
      {issued !== null ? (
        <div className="settings__once" role="alert">
          <p className="settings__once-title">
            원문 키는 지금 한 번만 보인다 — 이 화면을 벗어나면 다시 볼 수 없다.
          </p>
          <code className="settings__once-key">{issued.key}</code>
          <p className="meta">
            label: {issued.label} · 서버는 해시만 저장하므로 재발급 외에 되찾을 방법이 없다.
          </p>
          <div className="settings__actions">
            <Button onClick={() => copy(issued.key)}>{copied ? '복사됨' : '복사'}</Button>
            <Button onClick={() => setIssued(null)}>보관했다 · 닫기</Button>
          </div>
        </div>
      ) : null}

      <div className="settings__issue">
        <label className="meta settings__label" htmlFor="key-label">
          새 키 label
        </label>
        <input
          id="key-label"
          className="input settings__input"
          value={label}
          placeholder="ci-runner"
          maxLength={100}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button disabled={issuing || label.trim().length === 0} onClick={issue}>
          {issuing ? '발급 중…' : '+ 키 발급'}
        </Button>
      </div>

      {issueError !== null ? (
        <p className="settings__error" role="alert">
          {issueError}
        </p>
      ) : null}
      {revokeError !== null ? (
        <p className="settings__error" role="alert">
          폐기하지 못했다: {revokeError}
        </p>
      ) : null}

      {error !== null ? (
        <p className="settings__error" role="alert">
          키 목록을 불러오지 못했다: {errorMessage(error)}
        </p>
      ) : loading ? (
        <p className="meta">불러오는 중…</p>
      ) : keys.length === 0 ? (
        <p className="meta">발급된 키가 없다.</p>
      ) : (
        <div className="settings__scroll">
          <table className="table settings__table">
            <thead>
              <tr>
                <th scope="col">label</th>
                <th scope="col">키</th>
                <th scope="col">생성</th>
                <th scope="col">상태</th>
                <th scope="col">
                  <span className="settings__sr">동작</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const revoked = k.revoked_at !== null;
                return (
                  <tr key={k.id}>
                    <td>{k.label}</td>
                    {/* 말미 4자는 서버가 준다. 이 컬럼이 생기기 전에 발급된 키는 null이라
                        말미 없이 가린다 — 없는 값을 지어내면 그게 진짜 말미로 읽힌다. */}
                    <td className="settings__mono">
                      muster_{'•'.repeat(8)}
                      {k.key_suffix ?? ''}
                    </td>
                    <td>{shortDate(k.created_at)}</td>
                    <td>
                      {revoked ? (
                        <span className="badge badge--signal">폐기됨 {shortDate(k.revoked_at ?? '')}</span>
                      ) : (
                        <span className="badge">활성</span>
                      )}
                    </td>
                    <td className="settings__cell-action">
                      {revoked ? (
                        <span className="settings__dash">{EM_DASH}</span>
                      ) : confirmId === k.id ? (
                        // 폐기는 되돌릴 수 없다. 한 번 더 묻되, 무엇이 사라지는지 문장으로 적는다.
                        <span className="settings__confirm">
                          <span className="settings__confirm-text">
                            이 키로 하는 인증이 즉시 끊긴다. 되돌릴 수 없다.
                          </span>
                          <Button
                            disabled={revoking !== null}
                            onClick={() => revoke(k.id)}
                          >
                            {revoking === k.id ? '폐기 중…' : '폐기한다'}
                          </Button>
                          <Button disabled={revoking !== null} onClick={() => setConfirmId(null)}>
                            취소
                          </Button>
                        </span>
                      ) : (
                        <Button onClick={() => setConfirmId(k.id)}>폐기</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="meta">
        키는 해시로만 저장되어 원문은 발급 응답에서 1회만 노출된다. 로그·실행이력 쓰기 API는 사용자
        세션 대신 이 키(X-API-Key)를 쓴다.
      </p>
    </div>
  );
}

/* ───────────────────────── Git 연동 ───────────────────────── */

function GitTab({ projectId }: { projectId: string }) {
  const { data, error, loading, reload } = useApi<{ integration: GitIntegrationView | null }>(
    `/projects/${projectId}/git-integration`,
  );

  const [repoUrl, setRepoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /**
   * 토큰이 죽어 재인증이 필요한 상태. 일반 오류와 따로 두는 이유: 사용자가 할 일이
   * "다시 시도"가 아니라 "GitHub에 다시 로그인"이라서, 메시지만으로는 부족하고
   * 그 자리에 로그인 링크를 줘야 한다.
   */
  const [reauth, setReauth] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setConfirming(false);
    setActionError(null);
    setReauth(null);
    setRepoUrl('');
  }, [projectId]);

  /** GITHUB_REAUTH_REQUIRED만 재인증 안내로 가르고, 나머지는 평소대로 메시지를 띄운다. */
  const showFailure = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'GITHUB_REAUTH_REQUIRED') {
      setReauth(e.message);
      return;
    }
    setActionError(errorMessage(e));
  };

  const connect = () => {
    if (busy || repoUrl.trim().length === 0) return; // 중복 제출 차단
    setBusy(true);
    setActionError(null);
    setReauth(null);
    apiFetch<GitIntegrationView>(`/projects/${projectId}/git-integration`, {
      method: 'POST',
      body: JSON.stringify({ repo_url: repoUrl.trim() }),
    })
      .then(() => {
        setRepoUrl('');
        reload();
      })
      .catch(showFailure)
      .finally(() => setBusy(false));
  };

  const disconnect = () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    setReauth(null);
    apiFetch<void>(`/projects/${projectId}/git-integration`, { method: 'DELETE' })
      .then(() => {
        setConfirming(false);
        reload();
      })
      .catch(showFailure)
      .finally(() => setBusy(false));
  };

  if (error !== null) {
    return (
      <p className="settings__error" role="alert">
        연동 상태를 불러오지 못했다: {errorMessage(error)}
      </p>
    );
  }
  if (loading || data === null) return <p className="meta">불러오는 중…</p>;

  const integration = data.integration;

  return (
    <div className="settings__section">
      <h2 className="settings__section-title">Git 연동</h2>

      {reauth !== null ? (
        // 저장된 GitHub 토큰이 만료됐고 갱신도 실패했다. 다시 시도해 봐야 같은 실패라,
        // 재시도 대신 로그인으로 가는 길을 바로 준다.
        <div className="settings__once" role="alert">
          <p className="settings__once-title">{reauth}</p>
          <p className="meta">
            저장된 GitHub 토큰이 만료되어 갱신할 수 없다. GitHub으로 다시 로그인하면 연동을 이어서
            진행할 수 있다.
          </p>
          <div className="settings__actions">
            <a className="btn btn--solid" href={`${API_BASE}/auth/github/login`}>
              GitHub으로 다시 로그인
            </a>
          </div>
        </div>
      ) : null}

      {actionError !== null ? (
        <p className="settings__error" role="alert">
          {actionError}
        </p>
      ) : null}

      {integration === null ? (
        <>
          <p className="meta">연동된 레포가 없다.</p>
          <div className="settings__issue">
            <label className="meta settings__label" htmlFor="repo-url">
              GitHub 레포 URL
            </label>
            <input
              id="repo-url"
              className="input settings__input settings__input--wide"
              value={repoUrl}
              placeholder="https://github.com/owner/repo"
              maxLength={500}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
            <Button disabled={busy || repoUrl.trim().length === 0} onClick={connect}>
              {busy ? '연동 중…' : '연동'}
            </Button>
          </div>
          <p className="meta">연동하면 GitHub 웹훅이 자동으로 등록된다.</p>
        </>
      ) : (
        <>
          <dl className="settings__usage">
            <div>
              <dt>레포</dt>
              <dd className="settings__mono">{integration.repo_url}</dd>
            </div>
            <div>
              <dt>연동 시각</dt>
              <dd>{shortDate(integration.connected_at)}</dd>
            </div>
          </dl>

          {confirming ? (
            // 해제는 되돌릴 수 없다 — 웹훅과 시크릿이 함께 삭제되어 다시 연동해도 같은 것이 아니다.
            <div className="settings__once" role="alert">
              <p className="settings__once-title">연동을 해제하면 되돌릴 수 없다.</p>
              <p className="meta">
                GitHub 웹훅과 저장된 시크릿이 함께 삭제된다. 다시 연동하려면 웹훅이 새로 등록되고,
                기존 시크릿으로 서명된 요청은 더 이상 받아들여지지 않는다.
              </p>
              <div className="settings__actions">
                <Button disabled={busy} onClick={disconnect}>
                  {busy ? '해제 중…' : '해제한다'}
                </Button>
                <Button disabled={busy} onClick={() => setConfirming(false)}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <div className="settings__actions">
              <Button onClick={() => setConfirming(true)}>연동 해제</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ───────────────────────── 멤버 ───────────────────────── */

interface ProjectMemberView {
  user_id: string;
  github_login: string;
  role: string;
  joined_at: string;
}

interface MembersResponse {
  items: ProjectMemberView[];
  /** 역할별 수. 목업의 "owner 1" 표기가 이것이다 — 화면이 직접 세지 않는다. */
  counts: Record<string, number>;
}

/**
 * 멤버 — **읽기 전용**이다.
 *
 * 초대·역할 변경·추방 API가 아직 없다. 버튼을 먼저 그려 두면 눌러도 아무 일이 없는
 * 화면이 되고, 그건 없는 것보다 나쁘다. 목록만 보여 주고 그 사실을 적는다.
 */
function MembersTab({ projectId }: { projectId: string | null }) {
  const { data, error, loading } = useApi<MembersResponse>(
    projectId === null ? null : `/projects/${projectId}/members`,
  );

  const members = data?.items ?? [];
  const summary = Object.entries(data?.counts ?? {})
    .map(([role, n]) => `${role} ${n}`)
    .join(' · ');

  return (
    <div className="settings__section">
      <h2 className="settings__section-title">
        멤버 {summary.length > 0 ? <span className="meta">{summary}</span> : null}
      </h2>

      {error !== null ? (
        <p className="settings__error" role="alert">
          멤버를 불러오지 못했다: {errorMessage(error)}
        </p>
      ) : loading ? (
        <p className="meta">불러오는 중…</p>
      ) : members.length === 0 ? (
        <p className="meta">멤버가 없다.</p>
      ) : (
        <div className="settings__scroll">
          <table className="table settings__table">
            <thead>
              <tr>
                <th scope="col">계정</th>
                <th scope="col">역할</th>
                <th scope="col">합류</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.github_login}</td>
                  <td>
                    <span className="badge">{m.role}</span>
                  </td>
                  <td>{shortDate(m.joined_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="meta">
        역할 변경과 추방은 아직 없다. 초대로 들어온 사람은 member이고, owner는 링크로 주지
        않는다 — 링크가 새면 받은 사람이 곧 소유자가 되기 때문이다.
      </p>

      {projectId !== null && <InviteSection projectId={projectId} />}
    </div>
  );
}

/* ───────────────────────── 초대 링크 ─────────────────────────
 * owner만 보인다. 서버가 멤버에게 404를 주므로, 그 404를 에러로 그리지 않고 섹션을 숨긴다 —
 * 권한이 없다는 사실 자체를 화면이 떠들 이유가 없다(서버가 프로젝트의 존재조차 숨기는 것과
 * 같은 판단이다).
 */

interface InviteView {
  id: string;
  created_by: string | null;
  expires_at: string;
  revoked_at: string | null;
  accepted_count: number;
  created_at: string;
  active: boolean;
}

function InviteSection({ projectId }: { projectId: string }) {
  const { data, error, loading, reload } = useApi<{ items: InviteView[] }>(
    `/projects/${projectId}/invites`,
  );

  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // owner가 아니면 404다. 그건 오류가 아니라 "이 화면은 네 것이 아니다"라는 답이다.
  const forbidden = error instanceof ApiError && error.status === 404;
  if (forbidden) return null;

  const invites = data?.items ?? [];

  const issue = () => {
    setIssuing(true);
    setActionError(null);
    setCopied(false);

    apiPost<{ token: string }>(`/projects/${projectId}/invites`).then(
      (res) => {
        setIssuing(false);
        // 링크를 서버가 아니라 화면이 조립한다. 서버는 자기가 어느 주소로 서비스되는지
        // 모르고(프록시·포트포워딩), 화면은 지금 열려 있는 주소를 확실히 안다.
        setIssued(`${window.location.origin}/invite/${res.token}`);
        reload();
      },
      (e: unknown) => {
        setIssuing(false);
        setActionError(errorMessage(e));
      },
    );
  };

  const revoke = (id: string) => {
    setActionError(null);
    apiFetch(`/invites/${id}`, { method: 'DELETE' }).then(reload, (e: unknown) =>
      setActionError(errorMessage(e)),
    );
  };

  const copy = (link: string) => {
    if (!navigator.clipboard) {
      setActionError('이 브라우저에서는 자동 복사가 되지 않는다. 위 값을 직접 선택해 복사하라.');
      return;
    }
    void navigator.clipboard.writeText(link).then(
      () => setCopied(true),
      () => setActionError('복사하지 못했다. 위 값을 직접 선택해 복사하라.'),
    );
  };

  return (
    <div className="settings__section">
      <h2 className="settings__section-title">초대 링크</h2>
      <p className="meta">
        링크를 받은 사람은 GitHub으로 로그인하면 이 프로젝트의 member가 된다. 기한이 지나거나
        폐기하면 더 이상 쓸 수 없다.
      </p>

      {/* 1회성. 발급 직후에만 보여 주고, 목록에는 다시 나오지 않는다(서버가 해시만 저장한다). */}
      {issued !== null ? (
        <div className="settings__once" role="alert">
          <p className="settings__once-title">
            링크는 지금 한 번만 보인다 — 이 화면을 벗어나면 다시 볼 수 없다.
          </p>
          <code className="settings__once-key">{issued}</code>
          <div className="settings__actions">
            <Button onClick={() => copy(issued)}>{copied ? '복사됨' : '복사'}</Button>
            <Button onClick={() => setIssued(null)}>보냈다 · 닫기</Button>
          </div>
        </div>
      ) : null}

      <div className="settings__actions">
        <Button onClick={issue} disabled={issuing}>
          {issuing ? '만드는 중…' : '+ 초대 링크 만들기'}
        </Button>
      </div>

      {actionError !== null ? (
        <p className="error-note" role="alert">
          {actionError}
        </p>
      ) : null}

      {loading ? (
        <p className="meta">불러오는 중…</p>
      ) : invites.length === 0 ? (
        <p className="meta">만든 링크가 없다.</p>
      ) : (
        <div className="scroll-x">
          <table className="table settings__table">
            <thead>
              <tr>
                <th scope="col">만든 사람</th>
                <th scope="col">만료</th>
                <th scope="col">사용</th>
                <th scope="col">상태</th>
                <th scope="col">
                  <span className="settings__sr">동작</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <td>{i.created_by ?? EM_DASH}</td>
                  <td>{shortDate(i.expires_at)}</td>
                  {/* 보낸 사람 수보다 크면 링크가 샌 것이다. 그걸 알 방법이 이 숫자뿐이다. */}
                  <td>{i.accepted_count}명</td>
                  <td>
                    {i.active ? (
                      <span className="badge">유효</span>
                    ) : (
                      <span className="badge">
                        {i.revoked_at !== null ? '폐기됨' : '만료됨'}
                      </span>
                    )}
                  </td>
                  <td className="settings__cell-action">
                    {i.active ? (
                      <Button onClick={() => revoke(i.id)}>폐기</Button>
                    ) : (
                      <span className="settings__dash">{EM_DASH}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
