import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Panel } from '../components/Panel';
import { StatusBadge } from '../components/StatusBadge';
import { ApiError, apiFetch, apiPost, type Page } from '../lib/api';
import { BUILD_STATUSES, formatDateTime, readStack, type BuildStatus } from '../lib/domain';
import {
  buildEnvTemplateBody,
  DEFAULT_STACK_PRESET,
  ENV_TEMPLATE_NAME_MAX,
} from '../lib/envTemplateForm';
import { listPath } from '../lib/listQuery';
import { useApi } from '../lib/useApi';
import './EnvCatalogPage.css';

/* ───────────────────────── 서버 응답 계약 ─────────────────────────
 * GET /env-configs?build_status= 와 GET /env-templates —
 * apps/api/src/modules/env-catalog/env-catalog.controller.ts.
 * 목록에는 docker_config(Dockerfile 전문)가 실리지 않는다. 상세에만 있다.
 */
interface EnvConfigView {
  id: string;
  project_id: string;
  project_name: string;
  template_id: string | null;
  build_status: string;
  stack_config: Record<string, unknown>;
  created_at: string;
}

/**
 * 템플릿은 프로젝트가 아니라 **사용자**에게 달려 있다(서버의 listForOwner).
 * 그래서 프로젝트를 가로지르는 이 화면이 템플릿을 함께 두기에 맞는 유일한 자리다 —
 * 프로젝트 하위 화면에 두면 같은 목록이 프로젝트 수만큼 복제돼 보인다.
 */
interface EnvTemplateView {
  id: string;
  name: string;
  stack_preset: Record<string, unknown>;
  created_at: string;
}

const PAGE_LIMIT = 50;
const TEMPLATE_LIMIT = 20;

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return `${e.message} (${e.code})`;
  return e instanceof Error ? e.message : String(e);
}

function toStatus(value: string | null): BuildStatus | null {
  return value !== null && (BUILD_STATUSES as readonly string[]).includes(value)
    ? (value as BuildStatus)
    : null;
}

/**
 * EnvCatalog — 내가 속한 모든 프로젝트의 환경 구성과, 그것을 찍어 내는 내 템플릿
 * (설계서 Part 4 §5).
 *
 * 이 화면이 답하는 질문은 "지금 어디가 막혀 있나"다. 프로젝트 개요에서는 한 번에 한
 * 프로젝트밖에 못 보므로, policy_blocked나 승인 대기(policy_passed)를 찾으려면 프로젝트를
 * 하나씩 열어 봐야 했다. 그래서 상태 필터가 이 목록의 본체이고, 서버가 그 필터를 건다.
 *
 * 승인·반려 버튼은 두지 않았다. 판단하려면 정책 검사 결과와 Dockerfile을 봐야 하는데
 * 둘 다 상세에만 있다 — 목록에서 누르게 만들면 안 보고 누르는 흐름이 된다.
 * 여기서는 "어디에 있나"까지만 말하고 그 프로젝트로 보낸다.
 */
export function EnvCatalogPage() {
  const [params, setParams] = useSearchParams();
  const status = toStatus(params.get('build_status'));
  const [cursor, setCursor] = useState<string | null>(null);

  const path = listPath('/env-configs', { limit: PAGE_LIMIT, cursor, build_status: status });
  const { data, error, loading } = useApi<Page<EnvConfigView>>(path);

  // 템플릿은 상태 필터와 무관하다(프로젝트에 매이지 않은 목록이다). 그래서 같은 화면에
  // 있어도 조회가 따로다 — 한 요청으로 묶으면 상태를 고를 때마다 템플릿까지 다시 받는다.
  const templates = useApi<Page<EnvTemplateView>>(
    listPath('/env-templates', { limit: TEMPLATE_LIMIT }),
  );

  const items = data?.items ?? [];

  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const remove = (id: string) => {
    if (removing !== null) return; // 중복 제출 차단
    setRemoving(id);
    setRemoveError(null);
    apiFetch<void>(`/env-templates/${id}`, { method: 'DELETE' })
      .then(() => {
        setConfirmId(null);
        templates.reload();
      })
      .catch((e: unknown) => setRemoveError(errorMessage(e)))
      .finally(() => setRemoving(null));
  };

  const select = (next: BuildStatus | null) => {
    const p = new URLSearchParams(params);
    if (next === null) p.delete('build_status');
    else p.set('build_status', next);
    setParams(p, { replace: true });
    // 조건이 바뀌면 이전 조건에서 받은 커서는 무효다.
    setCursor(null);
  };

  return (
    <section className="page envcat">
      <header className="page__head">
        <h1 className="page__title">
          EnvCatalog <span className="page__count">내가 속한 프로젝트 전체</span>
        </h1>
      </header>

      <div className="chip-row" role="group" aria-label="빌드 상태 필터">
        <button
          type="button"
          className="chip envcat__tab"
          aria-pressed={status === null}
          onClick={() => select(null)}
        >
          전체
        </button>
        {BUILD_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className="chip envcat__tab"
            aria-pressed={status === s}
            onClick={() => select(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <p className="meta">
        최근 생성 순 · 커서 페이지네이션 limit {PAGE_LIMIT} · 상태 필터는 서버가 건다(전체 기준)
      </p>

      {error !== null ? (
        <p className="error-note" role="alert">
          환경 구성 목록을 불러오지 못했다: {error.message}
        </p>
      ) : loading ? (
        <p className="meta">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="meta envcat__empty">
          {status === null ? '생성된 환경 구성이 없다.' : `${status} 상태인 환경 구성이 없다.`}
        </p>
      ) : (
        <div className="scroll-x">
          <table className="table envcat__table">
            <thead>
              <tr>
                <th scope="col">프로젝트</th>
                <th scope="col">상태</th>
                <th scope="col">스택</th>
                <th scope="col">출처</th>
                <th scope="col">생성</th>
              </tr>
            </thead>
            <tbody>
              {items.map((config) => {
                const stack = readStack(config.stack_config);
                return (
                  <tr key={config.id}>
                    <td>
                      <Link className="envcat__project" to={`/projects/${config.project_id}`}>
                        {config.project_name}
                      </Link>
                    </td>
                    <td>
                      {/* 채움 여부는 StatusBadge가 규칙에서 정한다 — policy_blocked·failed만
                          붉다. 화면이 고르게 두면 규칙이 화면마다 갈라진다. */}
                      <StatusBadge status={config.build_status as BuildStatus} />
                    </td>
                    <td className="envcat__stack">
                      {stack.length > 0 ? stack.join(' · ') : '스택 정보 없음'}
                    </td>
                    <td className="meta">{config.template_id === null ? '직접 작성' : '템플릿'}</td>
                    <td className="envcat__time">
                      <time dateTime={config.created_at}>{formatDateTime(config.created_at)}</time>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="envcat__foot">
        <span className="meta">
          {loading
            ? '세는 중…'
            : `${items.length}건 표시 · ${data?.next_cursor ? '다음 있음' : '마지막 페이지'}`}
        </span>
        <div className="envcat__pager">
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

      <Panel
        title="내 템플릿"
        aside={
          <>
            최근 {TEMPLATE_LIMIT}개까지
            <Button className="envcat__new" onClick={() => setCreating(true)}>
              새 템플릿
            </Button>
          </>
        }
      >
        <p className="meta">
          템플릿은 프로젝트가 아니라 계정에 달려 있다. 새 환경 구성은 프로젝트 안에서 만들되, 고를
          수 있는 프리셋이 무엇인지는 여기서만 한눈에 보인다.
        </p>
        {/* 쓰는 순서를 적어 둔다 — 템플릿만 보고는 "그래서 이걸로 뭘 하나"에 답이 안 됐다. */}
        <p className="meta">
          쓰는 순서: ① 여기서 템플릿을 만든다 → ② 프로젝트 → 환경 탭 → <b>새 환경 구성</b> → ③
          템플릿을 고르고 <b>승인하고 실행</b>을 누르면 빌드가 시작된다.
        </p>
        {templates.error !== null ? (
          <p className="error-note" role="alert">
            템플릿을 불러오지 못했다: {templates.error.message}
          </p>
        ) : templates.loading ? (
          <p className="meta">불러오는 중…</p>
        ) : (templates.data?.items.length ?? 0) === 0 ? (
          <p className="meta">등록한 템플릿이 없다. 환경 구성은 직접 작성으로도 만들 수 있다.</p>
        ) : (
          <ul className="envcat__templates">
            {(templates.data?.items ?? []).map((t) => {
              const preset = readStack(t.stack_preset);
              return (
                <li key={t.id} className="envcat__template">
                  <span className="envcat__template-name">{t.name}</span>
                  <span className="meta">
                    {preset.length > 0 ? preset.join(' · ') : '프리셋에 읽을 스택 값이 없다'}
                  </span>
                  <time className="meta envcat__time" dateTime={t.created_at}>
                    {formatDateTime(t.created_at)}
                  </time>
                  {confirmId === t.id ? (
                    // 삭제는 되돌릴 수 없다. 한 번 더 묻되, 무엇이 사라지는지 문장으로 적는다.
                    <span className="envcat__confirm">
                      <span className="envcat__confirm-text">
                        이 템플릿이 사라진다. 되돌릴 수 없다.
                      </span>
                      <Button disabled={removing !== null} onClick={() => remove(t.id)}>
                        {removing === t.id ? '삭제 중…' : '삭제한다'}
                      </Button>
                      <Button disabled={removing !== null} onClick={() => setConfirmId(null)}>
                        취소
                      </Button>
                    </span>
                  ) : (
                    <Button onClick={() => setConfirmId(t.id)}>삭제</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {removeError !== null && (
          <p className="error-note" role="alert">
            {/* 이 템플릿을 참조하는 환경 구성 때문에 서버가 거부할 수 있다. 이유는 서버만
                알고 있으므로 응답 메시지를 그대로 옮긴다 — 문구를 지어내면 실제 사유와 어긋난다. */}
            삭제하지 못했다: {removeError}
          </p>
        )}
      </Panel>

      <CreateTemplateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          templates.reload();
        }}
      />
    </section>
  );
}

/**
 * 템플릿 생성 폼.
 *
 * 프리셋을 JSON 텍스트로 받는다. 스택 프리셋에 어떤 키가 오는지는 서버가 정하지 않고
 * (@IsObject 하나뿐이다) 환경 구성 생성 쪽에서 그대로 펼쳐 쓴다 — 그러니 키를 화면이
 * 고정된 칸으로 강제하면, 서버가 받아 주는 프리셋의 일부만 만들 수 있는 화면이 된다.
 * 대신 형식 검사(파싱·객체 여부)는 보내기 전에 하고, 빈 화면 대신 기본값을 채워 둔다.
 */
function CreateTemplateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [stackJson, setStackJson] = useState(DEFAULT_STACK_PRESET);
  const [dockerJson, setDockerJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 열 때마다 빈 폼에서 다시 시작한다. 직전에 쓰다 만 값이 남아 있으면 두 번째 템플릿이
  // 첫 번째의 잔여물로 만들어진다.
  useEffect(() => {
    if (open) {
      setName('');
      setStackJson(DEFAULT_STACK_PRESET);
      setDockerJson('');
      setError(null);
    }
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const built = buildEnvTemplateBody({
      name,
      stackPresetJson: stackJson,
      dockerPresetJson: dockerJson,
    });
    if (!built.ok) {
      setError(built.reason);
      return;
    }

    setSaving(true);
    setError(null);
    apiPost<{ id: string }>('/env-templates', built.body).then(onCreated, (err: unknown) => {
      setSaving(false);
      setError(errorMessage(err));
    });
  };

  return (
    <Modal open={open} title="새 템플릿" onClose={saving ? () => undefined : onClose}>
      <form className="modal__form" onSubmit={submit}>
        <div className="field">
          <label className="meta" htmlFor="new-template-name">
            이름
          </label>
          <input
            id="new-template-name"
            className="input modal__input"
            value={name}
            maxLength={ENV_TEMPLATE_NAME_MAX}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="meta" htmlFor="new-template-stack">
            스택 프리셋 (JSON 객체, 필수)
          </label>
          <textarea
            id="new-template-stack"
            className="input modal__input envcat__json"
            rows={7}
            value={stackJson}
            onChange={(e) => setStackJson(e.target.value)}
          />
          <span className="meta">
            language · framework · database · services는 목록의 스택 칸에 그대로 나온다.
          </span>
        </div>

        <div className="field">
          <label className="meta" htmlFor="new-template-docker">
            도커 프리셋 (JSON 객체, 선택)
          </label>
          <textarea
            id="new-template-docker"
            className="input modal__input envcat__json"
            rows={4}
            value={dockerJson}
            onChange={(e) => setDockerJson(e.target.value)}
          />
          <span className="meta">비워 두면 도커 설정은 환경 구성을 만들 때마다 생성된다.</span>
        </div>

        {error !== null && (
          <p className="error-note" role="alert">
            {error}
          </p>
        )}

        <div className="modal__actions">
          <Button type="button" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button type="submit" variant="solid" disabled={saving}>
            {saving ? '만드는 중…' : '만든다'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
