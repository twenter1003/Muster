import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { ApiError, apiFetch, type Page as ApiPage } from '../lib/api';
import { useApi } from '../lib/useApi';
import { BUILD_STATUSES, EM_DASH, type BuildStatus } from '../lib/domain';
import { actorLabel, type TransitionView } from '../lib/transitions';
import './EnvConfigCreatePage.css';

/* ─────────────────────────── 서버 응답 타입 ───────────────────────────
 * env-catalog.controller.ts의 toTemplateView·toConfigView·toCheckView를 그대로 옮겼다.
 * 추측한 필드는 없다. 목록 응답에는 docker_config가 없고 상세에만 있다는 것도 컨트롤러 그대로다.
 */

interface TemplateView {
  id: string;
  name: string;
  stack_preset: Record<string, unknown>;
  docker_preset: Record<string, unknown>;
  created_at: string;
}

interface ConfigView {
  id: string;
  project_id: string;
  template_id: string | null;
  build_status: string;
  stack_config: Record<string, unknown>;
  created_at: string;
}

interface ConfigDetailView extends ConfigView {
  docker_config: Record<string, unknown>;
}

interface PolicyCheckView {
  id: string;
  tool: string;
  verdict: string;
  risk_notes: string | null;
  checked_at: string;
}

/* ─────────────────────────── 표시 헬퍼 ─────────────────────────── */

const asBuildStatus = (value: string): BuildStatus | null =>
  (BUILD_STATUSES as readonly string[]).includes(value) ? (value as BuildStatus) : null;

/** 이력은 며칠에 걸칠 수 있어 날짜까지 찍는다 — 시:분만으로는 어제인지 오늘인지 알 수 없다. */
const formatStamp = (iso: string): string =>
  new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** 추가 서비스 선택지. 목업 1e의 칩 목록 그대로다. */
const EXTRA_SERVICES = ['redis', 'nginx', 'rabbitmq', 'minio', 'mailhog'] as const;

/**
 * 생성 실패를 사람이 읽을 수 있는 두 줄로 바꾼다.
 *
 * 왜 상태 코드별로 나누는가: 503은 "서버가 고장났다"가 아니라 "LLM 자격증명이 없다"이고,
 * 그 둘은 사용자가 해야 할 일이 완전히 다르다. 한 문구로 뭉뚱그리면 설정 화면으로 가야 할
 * 사용자가 재시도만 반복하게 된다. 서버 message는 항상 함께 남긴다 — 무엇이 없어서
 * 실패했는지는 서버만 알고, 화면이 그것을 삼키면 안 된다.
 */
function describeFailure(error: ApiError): { headline: string; hint: string | null } {
  if (error.status === 503) {
    return {
      headline: 'LLM 생성이 불가능한 상태다.',
      hint: 'Vertex AI 자격증명이 서버에 설정되지 않았을 때 나는 오류다. 관리 · 설정에서 확인한다.',
    };
  }
  if (error.status === 400 || error.status === 422) {
    return { headline: '입력을 서버가 받지 않았다.', hint: null };
  }
  if (error.status === 403 || error.status === 404) {
    return {
      headline: '이 프로젝트에 환경 구성을 만들 수 없다.',
      hint: '프로젝트 멤버가 아니거나 프로젝트가 없다.',
    };
  }
  return { headline: '생성에 실패했다.', hint: null };
}

/* ─────────────────────────── 공용 조각 ─────────────────────────── */

function Card({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel ec-card">
      <h2 className="ec-card__head">
        {title}
        {aside !== undefined && <span className="panel__aside">{aside}</span>}
      </h2>
      <div className="ec-card__body">{children}</div>
    </section>
  );
}

/**
 * 아직 만들지 않았을 때의 예고 목록(주석 5).
 *
 * 왜 이것이 이력을 대신하지 않는가: 이 사다리는 build_status 하나에서 경로를 **역산**한 것이라,
 * 반려됐다 다시 통과한 구성과 처음에 통과한 구성을 구분하지 못하고 누가 승인했는지도 모른다.
 * 구성이 생기면 서버 전이 이력(/transitions)이 그 자리를 대신한다. 다만 제출 전에는
 * 이력이 있을 수 없고, 그 자리에 빈 목록을 그리면 "아무 일도 없었다"는 다른 주장이 된다 —
 * 아직 시작하지 않은 것과 시작했는데 기록이 없는 것은 같지 않다. 그래서 예고로만 남긴다.
 */
function TransitionPreview({ status }: { status: BuildStatus | null }) {
  const reached = (s: BuildStatus): boolean => {
    if (status === null) return false;
    const order: BuildStatus[] = ['generated', 'policy_passed', 'approved', 'running'];
    const done = order.indexOf(s);
    const now = order.indexOf(status);
    if (s === status) return true;
    // policy_blocked·rejected·failed는 가지(branch)라 순서로 비교하지 않는다.
    if (done < 0 || now < 0) return false;
    return done < now;
  };

  const rows: { label: string; done: boolean }[] = [
    { label: 'generated', done: reached('generated') || status !== null },
    {
      label: status === 'policy_blocked' ? 'policy_blocked' : 'policy_passed',
      done: status === 'policy_blocked' || reached('policy_passed'),
    },
    {
      label: status === 'rejected' ? 'rejected' : 'approved',
      done: status === 'rejected' || reached('approved'),
    },
    { label: 'running → succeeded', done: reached('running') || status === 'succeeded' },
  ];

  return (
    <ol className="ec-transitions">
      {rows.map((row) => (
        <li className="ec-transitions__row" key={row.label}>
          <span className="ec-mono">{row.label}</span>
          <span
            className={
              row.done ? 'ec-transitions__at' : 'ec-transitions__at ec-transitions__at--pending'
            }
          >
            {row.done ? EM_DASH : '대기'}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * 서버가 기록한 실제 상태 전이 이력.
 * 오래된 것부터 온 순서 그대로 그린다 — 이력은 일어난 순서로 읽는 것이고,
 * 최신순으로 뒤집으면 "무엇 때문에 무엇이 됐는지"의 인과가 거꾸로 읽힌다.
 */
function TransitionHistory({ items }: { items: TransitionView[] }) {
  return (
    <ol className="ec-transitions">
      {items.map((t) => {
        const status = asBuildStatus(t.to_status);
        return (
          <li className="ec-transitions__row ec-transitions__row--history" key={t.id}>
            <span className="ec-transitions__what">
              {/* 상태 코드는 번역하지 않는다 — 서버 기록과 화면 표기가 갈리면 대조가 어렵다. */}
              <span className={status === 'policy_blocked' ? 'ec-mono ec-note--signal' : 'ec-mono'}>
                {t.to_status}
              </span>
              <span className="meta">{actorLabel(t.actor)}</span>
            </span>
            {/* 전이마다 자기 시각이 있다 — 역산 사다리는 전부 같은 시각을 찍을 수밖에 없었다. */}
            <span className="ec-transitions__at">{formatStamp(t.created_at)}</span>
            {t.reason !== null && t.reason.trim() !== '' && (
              <span className="meta ec-transitions__reason">{t.reason}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ─────────────────────────── 화면 ─────────────────────────── */

type InputTab = 'ui' | 'natural_language';

export function EnvConfigCreatePage() {
  const { id } = useParams<{ id: string }>();

  /* ── 입력 상태 ──
   * 탭은 "지금 보고 있는 칸"일 뿐 값의 소유자가 아니다(주석 4). 탭을 바꿔도 값을 버리지
   * 않으므로 폼으로 뼈대를 잡고 자연어로 보완하는 실제 사용 방식이 그대로 성립한다.
   */
  const [tab, setTab] = useState<InputTab>('ui');
  const [language, setLanguage] = useState('');
  const [framework, setFramework] = useState('');
  const [database, setDatabase] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [extras, setExtras] = useState<readonly string[]>([]);
  const [notes, setNotes] = useState('');

  /* ── 생성 상태 ── */
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [createError, setCreateError] = useState<ApiError | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  /*
   * 중복 제출 방지를 상태(busy)가 아니라 ref로도 잠근다.
   * setState는 비동기라, 버튼을 빠르게 두 번 누르면 두 번째 클릭이 아직 false인 busy를 읽고
   * 통과한다. 그러면 LLM 생성이 두 번 돌아 구성이 두 개 생긴다 — 되돌릴 방법이 없는 부작용이라
   * 렌더 사이클과 무관한 잠금이 필요하다.
   */
  const inFlight = useRef(false);

  const templates = useApi<ApiPage<TemplateView>>('/env-templates?limit=50');

  const configId = config?.id ?? null;
  const detail = useApi<ConfigDetailView>(configId === null ? null : `/env-configs/${configId}`);
  const checks = useApi<{ items: PolicyCheckView[] }>(
    configId === null ? null : `/env-configs/${configId}/policy-checks`,
  );
  const transitions = useApi<{ items: TransitionView[] }>(
    configId === null ? null : `/env-configs/${configId}/transitions`,
  );

  /* 생성 대기가 수십 초까지 갈 수 있어, 멈춘 화면이 아니라는 신호로 경과 초를 센다. */
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  const toggleExtra = (name: string) =>
    setExtras((prev) => (prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]));

  const hasUiInput =
    language.trim() !== '' ||
    framework.trim() !== '' ||
    database.trim() !== '' ||
    extras.length > 0;
  const hasAnyInput = hasUiInput || notes.trim() !== '';

  const create = useCallback(async () => {
    if (id === undefined || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setCreateError(null);
    setActionError(null);

    /*
     * input_mode는 탭이 아니라 실제로 채워진 값에서 정한다.
     * 탭은 배타적이지 않으므로(주석 4) "자연어 탭을 보고 있었다"는 사실이 곧 자연어 입력은
     * 아니다. 폼이 비어 있고 글만 있을 때에만 서버 DTO가 정한 { text } 모양으로 보낸다.
     */
    const mode: InputTab = hasUiInput ? 'ui' : 'natural_language';
    const stackInput: Record<string, unknown> =
      mode === 'natural_language'
        ? { text: notes.trim() }
        : {
            ...(language.trim() !== '' ? { language: language.trim() } : {}),
            ...(framework.trim() !== '' ? { framework: framework.trim() } : {}),
            ...(database.trim() !== '' ? { database: database.trim() } : {}),
            ...(extras.length > 0 ? { extra_services: extras } : {}),
            ...(notes.trim() !== '' ? { notes: notes.trim() } : {}),
          };

    try {
      const created = await apiFetch<ConfigView>(`/projects/${id}/env-configs`, {
        method: 'POST',
        body: JSON.stringify({
          template_id: templateId === '' ? null : templateId,
          input_mode: mode,
          stack_input: stackInput,
        }),
      });
      setConfig(created);
    } catch (e: unknown) {
      setCreateError(e instanceof ApiError ? e : new ApiError(0, 'INTERNAL', String(e)));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, [id, hasUiInput, language, framework, database, extras, notes, templateId]);

  /** 승인·반려·실행은 모두 같은 잠금을 쓴다 — 어느 것도 두 번 나가면 안 된다. */
  const post = useCallback(async (path: string): Promise<ConfigView | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const next = await apiFetch<ConfigView>(path, { method: 'POST' });
      setConfig(next);
      return next;
    } catch (e: unknown) {
      setActionError(e instanceof ApiError ? e : new ApiError(0, 'INTERNAL', String(e)));
      return null;
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, []);

  /*
   * "승인하고 실행"은 라벨 그대로 approve + execute 둘이다(주석 3).
   * 서버가 approve(→approved)와 execute(→running)를 나눠 두었지만 사용자에게 approved는
   * 아무것도 아닌 중간 상태다. 승인이 곧 docker build/run이라는 사실을 라벨에 담은 이상
   * 버튼도 거기까지 가야 한다. approve가 실패하면 execute는 부르지 않는다.
   */
  const approveAndExecute = async () => {
    if (configId === null) return;
    const approved = await post(`/env-configs/${configId}/approve`);
    if (approved === null) return;
    await post(`/env-configs/${configId}/execute`);
    // 이력은 서버가 쓴 것만 믿는다 — 화면이 성공을 가정해 줄을 지어내면 실패한 전이도 남는다.
    transitions.reload();
  };

  const reject = async () => {
    if (configId === null) return;
    await post(`/env-configs/${configId}/reject`);
    transitions.reload();
  };

  if (id === undefined) {
    return <p className="meta ec-note ec-note--signal">프로젝트 id가 없는 주소다.</p>;
  }

  const status = config === null ? null : asBuildStatus(config.build_status);
  const checkItems = checks.data?.items ?? null;

  /*
   * ── 차단 계약 ──
   * 승인 단계는 (1) 서버 판정이 policy_passed이고 (2) 받은 검사가 하나 이상이며 전부 pass일
   * 때에만 열린다. 서버도 409로 막지만, UI가 그 계약을 드러내지 않으면 사용자는 "왜 안 눌리지"를
   * 겪는다. 그래서 아래에서 이 값이 false면 승인 버튼을 **렌더하지 않는다** — 비활성이 아니다.
   * 비활성 버튼은 "내게 권한이 없다"로 읽히는데 이건 권한이 아니라 계약이다
   * (Part 1 §3.2.1 — 사람의 승인 여부와 무관하게 원천 차단).
   */
  const allChecksPass =
    checkItems !== null && checkItems.length > 0 && checkItems.every((c) => c.verdict === 'pass');
  const approvable = status === 'policy_passed' && allChecksPass;

  const docker = detail.data?.docker_config ?? null;
  const rationale = str(docker?.rationale);
  const dockerfile = str(docker?.dockerfile);
  const compose = str(docker?.compose);

  /* 위험도 설명은 통과했을 때도 같은 자리에 남는다(주석 2). */
  const riskNotes = (checkItems ?? [])
    .map((c) => ({ tool: c.tool, text: str(c.risk_notes) }))
    .filter((n): n is { tool: string; text: string } => n.text !== null);

  return (
    <section>
      <header className="ec__header">
        <div>
          <div className="meta">프로젝트 / 환경 구성</div>
          <h1 className="ec__title">새 환경 구성</h1>
        </div>
        <div className="ec__actions">
          <Button onClick={() => window.history.back()}>취소</Button>
          {/*
            "설정 생성"은 아웃라인이다. 이 화면의 솔리드는 "승인하고 실행" 하나뿐이고(주석 3),
            생성은 되돌릴 수 있지만 승인은 docker build/run이라 되돌릴 수 없다.
          */}
          <Button onClick={() => void create()} disabled={busy || !hasAnyInput || config !== null}>
            {busy && config === null ? `생성 중… ${elapsed}초` : '설정 생성'}
          </Button>
        </div>
      </header>

      {/* 주석 1 — 입력(좌)과 판정(우)을 세로로 가른다. */}
      <div className="ec__split">
        <div className="ec__col">
          <Card
            title="입력"
            aside={
              <span className="ec-tabs" role="tablist" aria-label="입력 방식">
                {/*
                  두 탭은 배타적이지 않다(주석 4). 값이 있는 탭에는 점을 찍어, 탭을 바꿔도
                  반대쪽 값이 살아 있다는 사실이 보이게 한다.
                */}
                <button
                  type="button"
                  role="tab"
                  className="ec-tab"
                  aria-selected={tab === 'ui'}
                  onClick={() => setTab('ui')}
                >
                  UI 입력{hasUiInput && <span className="ec-tab__dot" aria-label="값 있음" />}
                </button>
                <button
                  type="button"
                  role="tab"
                  className="ec-tab"
                  aria-selected={tab === 'natural_language'}
                  onClick={() => setTab('natural_language')}
                >
                  자연어 입력
                  {notes.trim() !== '' && <span className="ec-tab__dot" aria-label="값 있음" />}
                </button>
              </span>
            }
          >
            {tab === 'ui' ? (
              <div className="ec-form">
                <label className="field ec-field">
                  <span className="meta">언어</span>
                  <input
                    className="input ec-input"
                    value={language}
                    placeholder="node"
                    disabled={config !== null}
                    onChange={(e) => setLanguage(e.target.value)}
                  />
                </label>
                <label className="field ec-field">
                  <span className="meta">프레임워크</span>
                  <input
                    className="input ec-input"
                    value={framework}
                    placeholder="nestjs"
                    disabled={config !== null}
                    onChange={(e) => setFramework(e.target.value)}
                  />
                </label>
                <label className="field ec-field">
                  <span className="meta">데이터베이스</span>
                  <input
                    className="input ec-input"
                    value={database}
                    placeholder="postgresql 16"
                    disabled={config !== null}
                    onChange={(e) => setDatabase(e.target.value)}
                  />
                </label>
                <label className="field ec-field">
                  <span className="meta">템플릿</span>
                  <select
                    className="input ec-input"
                    value={templateId}
                    disabled={config !== null}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    <option value="">사용 안 함</option>
                    {(templates.data?.items ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {templates.error !== null && (
                    <span className="meta ec-note ec-note--signal">
                      템플릿 목록을 불러오지 못했다 — {templates.error.message}
                    </span>
                  )}
                </label>

                <div className="field ec-field ec-field--wide">
                  <span className="meta">추가 서비스</span>
                  <div className="chip-row">
                    {EXTRA_SERVICES.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className="chip ec-chip"
                        aria-pressed={extras.includes(name)}
                        disabled={config !== null}
                        onClick={() => toggleExtra(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="meta ec-note">
                폼을 비워 두고 아래 글만 적으면 자연어 입력으로 보낸다. 폼에 값이 있으면 폼이 뼈대가
                되고 글은 보완 설명으로 함께 전달된다.
              </p>
            )}

            {/*
              자연어 칸은 탭과 무관하게 항상 자리에 있다(주석 4). 탭 안에 숨기면
              "폼으로 뼈대를 잡고 자연어로 보완한다"는 사용 방식이 화면에서 사라진다.
            */}
            <label className="field ec-field ec-field--wide">
              <span className="meta">자연어 보완 설명 (LLM 전달)</span>
              <textarea
                className="input ec-input ec-textarea"
                rows={4}
                value={notes}
                disabled={config !== null}
                placeholder="개발용으로만 쓸 구성입니다. 포트는 8000, 5432만 열고…"
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </Card>

          <Card
            title="생성된 설정"
            aside={status !== null ? <StatusBadge status={status} /> : undefined}
          >
            {busy && config === null ? (
              <p className="meta ec-note" role="status">
                LLM이 Dockerfile과 compose를 쓰고 있다 — {elapsed}초 경과. 수십 초까지 걸릴 수 있어
                창을 닫지 않는다. 생성이 끝나면 Policy Gate 결과가 오른쪽에 채워진다.
              </p>
            ) : createError !== null ? (
              (() => {
                const { headline, hint } = describeFailure(createError);
                return (
                  <div role="alert">
                    <p className="meta ec-note ec-note--signal">{headline}</p>
                    {/* 서버 message를 그대로 남긴다 — 무엇이 없어서 실패했는지는 서버만 안다. */}
                    <p className="meta ec-note ec-mono">
                      {createError.status} {createError.code} — {createError.message}
                    </p>
                    {hint !== null && <p className="meta ec-note">{hint}</p>}
                    <Button onClick={() => void create()} disabled={busy}>
                      다시 생성
                    </Button>
                  </div>
                );
              })()
            ) : config === null ? (
              <p className="meta ec-note">아직 생성하지 않았다.</p>
            ) : detail.loading && detail.data === null ? (
              <p className="meta ec-note">불러오는 중…</p>
            ) : detail.error !== null ? (
              <p className="meta ec-note ec-note--signal">
                생성은 됐지만 상세를 불러오지 못했다 — {detail.error.message}
              </p>
            ) : (
              <>
                {rationale !== null && <p className="ec-rationale">{rationale}</p>}
                {dockerfile !== null && (
                  <>
                    <div className="meta">Dockerfile</div>
                    <pre className="ec-pre">{dockerfile}</pre>
                  </>
                )}
                {compose !== null && (
                  <>
                    <div className="meta">docker-compose.yml</div>
                    <pre className="ec-pre">{compose}</pre>
                  </>
                )}
                {dockerfile === null && compose === null && (
                  <p className="meta ec-note">서버가 설정 본문을 주지 않았다.</p>
                )}
              </>
            )}
          </Card>

          {/*
            주석 2 — 위험도 설명은 통과했을 때도 같은 자리에 남는다. 차단됐을 때만 나타나면
            "통과 = 안전"으로 오해하게 된다. 그래서 카드 자체를 조건부로 감추지 않고,
            생성 전에는 무엇이 여기 올지 미리 적어 둔다.
          */}
          <Card title="위험도 설명" aside="도커 지식이 없어도 판단할 수 있게">
            {config === null ? (
              <p className="meta ec-note">
                생성 뒤 trivy·conftest가 무엇을 보았는지 여기에 남는다. 통과해도 사라지지 않는다.
              </p>
            ) : checks.loading && checkItems === null ? (
              <p className="meta ec-note">불러오는 중…</p>
            ) : checks.error !== null ? (
              <p className="meta ec-note ec-note--signal">
                검사 결과를 불러오지 못했다 — {checks.error.message}
              </p>
            ) : riskNotes.length === 0 ? (
              <p className="meta ec-note">
                검사 도구가 남긴 설명이 없다. 설명이 없다는 것이 위험이 없다는 뜻은 아니다.
              </p>
            ) : (
              <ul className="ec-risks">
                {riskNotes.map((n) => (
                  <li key={n.tool}>
                    <span className="ec-mono">{n.tool}</span> · {n.text}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="ec__col">
          <Card title="Policy Gate">
            {config === null ? (
              <p className="meta ec-note">생성과 동시에 서버가 검사를 돌린다.</p>
            ) : checks.loading && checkItems === null ? (
              <p className="meta ec-note">불러오는 중…</p>
            ) : checks.error !== null ? (
              <p className="meta ec-note ec-note--signal">
                불러오지 못했다 — {checks.error.message}
              </p>
            ) : checkItems === null || checkItems.length === 0 ? (
              <p className="meta ec-note ec-note--signal">
                검사 결과가 없다 — 승인 단계를 열지 않는다.
              </p>
            ) : (
              <ul className="ec-checks">
                {checkItems.map((c) => (
                  <li className="ec-checks__row" key={c.id}>
                    <span className="ec-mono">{c.tool}</span>
                    {/* verdict는 build_status가 아니라 pass/fail이므로 StatusBadge가 아니다. */}
                    <span className={c.verdict === 'pass' ? 'badge' : 'badge badge--signal'}>
                      {c.verdict}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="meta ec-note">
              두 도구가 모두 pass일 때만 승인 단계가 열립니다. 하나라도 fail이면 사람 승인과
              무관하게 policy_blocked로 차단됩니다.
            </p>
          </Card>

          {/*
            구성이 없을 때만 예고 사다리고, 생기는 순간부터는 서버가 기록한 이력이다.
            둘을 섞지 않는 이유는 TransitionPreview 주석에 적었다.
          */}
          <Card title="상태 전이" aside={config === null ? '예고' : '기록'}>
            {config === null ? (
              <TransitionPreview status={status} />
            ) : transitions.loading && transitions.data === null ? (
              <p className="meta ec-note">불러오는 중…</p>
            ) : transitions.error !== null ? (
              <p className="meta ec-note ec-note--signal">
                전이 이력을 불러오지 못했다 — {transitions.error.message}
              </p>
            ) : (transitions.data?.items.length ?? 0) === 0 ? (
              <p className="meta ec-note">서버에 기록된 전이가 없다.</p>
            ) : (
              <TransitionHistory items={transitions.data?.items ?? []} />
            )}
          </Card>

          <Card title="판정">
            {config === null ? (
              <p className="meta ec-note">아직 판정할 구성이 없다.</p>
            ) : status === 'policy_blocked' ? (
              /*
               * 승인 버튼을 아예 렌더하지 않는다. 비활성 버튼도 두지 않는다 —
               * 비활성은 "권한이 없다 / 나중에 열린다"로 읽히지만 이건 계약이라 영원히 안 열린다.
               */
              <div>
                <p className="meta ec-note ec-note--signal">
                  policy_blocked — 사람의 승인으로 통과시킬 수 없다. 입력을 고쳐 다시 생성해야 한다.
                </p>
                <div className="ec__decision">
                  <Button onClick={() => void reject()} disabled={busy}>
                    반려
                  </Button>
                </div>
              </div>
            ) : approvable ? (
              <div>
                <p className="meta ec-note">
                  승인하면 곧바로 docker build/run이 실행된다. 되돌리는 절차는 없다.
                </p>
                <div className="ec__decision">
                  {/* 이 화면의 유일한 솔리드 버튼(주석 3). 라벨이 결과를 그대로 말한다. */}
                  <Button variant="solid" onClick={() => void approveAndExecute()} disabled={busy}>
                    {busy ? '처리 중…' : '승인하고 실행'}
                  </Button>
                  <Button onClick={() => void reject()} disabled={busy}>
                    반려
                  </Button>
                </div>
                <p className="meta ec-note">승인 시 감사 로그에 env_config.approve 기록</p>
              </div>
            ) : status === 'approved' || status === 'running' || status === 'succeeded' ? (
              <p className="meta ec-note">
                이미 실행 단계로 넘어갔다. 현재 상태: {config.build_status}
              </p>
            ) : status === 'rejected' ? (
              <p className="meta ec-note">반려했다. 새 구성을 만들어야 한다.</p>
            ) : (
              /* policy_passed인데 검사 결과가 아직/전부 pass가 아닌 경우도 여기로 온다. */
              <p className="meta ec-note">
                검사 결과가 모두 pass로 확인되기 전에는 승인 단계를 열지 않는다. 현재 상태:{' '}
                {config.build_status}
              </p>
            )}

            {actionError !== null && (
              <p className="meta ec-note ec-note--signal" role="alert">
                {actionError.status === 409
                  ? '서버가 상태 전이를 거부했다(409) — '
                  : '요청이 실패했다 — '}
                {actionError.message}
              </p>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
}
