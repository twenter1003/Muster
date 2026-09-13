import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ApiError, apiFetch, apiPatch, type Page } from '../lib/api';
import { AGENT_CONFIG_MAX, AGENT_NAME_MAX, buildAgentPatch } from '../lib/agentEdit';
import { formatDateTime } from '../lib/domain';
import { listPath } from '../lib/listQuery';
import { useApi } from '../lib/useApi';
import './AgentRegistryPage.css';

/* ───────────────────────── 서버 응답 계약 ─────────────────────────
 * GET /agents — apps/api/src/modules/agent-registry/agents.controller.ts 의
 * AgentsController.list. 목록에는 config_md(마크다운 전문)가 실리지 않는다.
 */
interface AgentView {
  id: string;
  project_id: string;
  project_name: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/** GET /agents/:id — 목록에 없는 config_md는 여기서만 온다. */
interface AgentDetail {
  id: string;
  name: string;
  config_md: string;
}

const PAGE_LIMIT = 50;

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return `${e.message} (${e.code})`;
  return e instanceof Error ? e.message : String(e);
}

/**
 * AgentRegistry — 내가 속한 모든 프로젝트에 등록된 에이전트(설계서 Part 4 §6).
 *
 * 필터가 없다. 서버가 이 목록에 열어 둔 조건이 없고, 없는 조건을 화면에서 만들면
 * 현재 페이지 안에서만 걸리는 가짜 필터가 된다(감사 로그가 그 상태다). 에이전트는
 * 프로젝트당 한 자릿수라 한 페이지에 다 들어오므로, 지금 필요한 것은 필터가 아니라
 * "어느 프로젝트에 무엇이 등록돼 있나"를 한 번에 보는 일이다.
 *
 * 실행 이력(runs)·비용은 넣지 않았다. 에이전트마다 GET /agents/:id/runs 를 한 번씩
 * 더 불러야 해서 목록이 N+1이 되고, 이 화면이 답하려는 질문은 등록 현황이지 가동률이
 * 아니다. 가동률은 리포트 화면의 몫이다.
 *
 * 등록(생성)은 프로젝트 개요에 있고 여기에는 수정·삭제만 둔다. 등록은 "어느 프로젝트에"를
 * 먼저 정해야 하는 일이라 프로젝트 안에서 하는 편이 맞고, 수정·삭제는 대상이 이미
 * 정해져 있어 이 목록에서 바로 끝나는 일이다.
 */
export function AgentRegistryPage() {
  const [cursor, setCursor] = useState<string | null>(null);

  const path = listPath('/agents', { limit: PAGE_LIMIT, cursor });
  const { data, error, loading, reload } = useApi<Page<AgentView>>(path);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const items = data?.items ?? [];

  const remove = (id: string) => {
    if (deleting !== null) return; // 중복 제출 차단
    setDeleting(id);
    setDeleteError(null);
    apiFetch<void>(`/agents/${id}`, { method: 'DELETE' })
      .then(() => {
        setConfirmId(null);
        reload();
      })
      .catch((e: unknown) => setDeleteError(errorMessage(e)))
      .finally(() => setDeleting(null));
  };

  return (
    <section className="page aregistry">
      <header className="page__head">
        <h1 className="page__title">
          AgentRegistry <span className="page__count">내가 속한 프로젝트 전체</span>
        </h1>
      </header>

      <p className="meta">
        최근 등록 순 · 커서 페이지네이션 limit {PAGE_LIMIT} · 등록은 프로젝트 개요에서 한다
      </p>

      {deleteError !== null && (
        <p className="error-note" role="alert">
          삭제하지 못했다: {deleteError}
        </p>
      )}

      {error !== null ? (
        <p className="error-note" role="alert">
          에이전트 목록을 불러오지 못했다: {error.message}
        </p>
      ) : loading ? (
        <p className="meta">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="meta aregistry__empty">등록된 에이전트가 없다.</p>
      ) : (
        <div className="scroll-x">
          <table className="table aregistry__table">
            <thead>
              <tr>
                <th scope="col">에이전트</th>
                <th scope="col">프로젝트</th>
                <th scope="col">등록</th>
                <th scope="col">마지막 수정</th>
                <th scope="col">동작</th>
              </tr>
            </thead>
            <tbody>
              {items.map((agent) => (
                <tr key={agent.id}>
                  <td>
                    {/* 에이전트 단독 화면이 아직 없다. 설정(config_md)을 보려면 프로젝트로
                        들어가야 하므로, 죽은 링크 대신 그리로 보낸다. */}
                    <Link className="aregistry__name" to={`/projects/${agent.project_id}`}>
                      {agent.name}
                    </Link>
                  </td>
                  <td>
                    <Link className="aregistry__project" to={`/projects/${agent.project_id}`}>
                      {agent.project_name}
                    </Link>
                  </td>
                  <td className="aregistry__time">
                    <time dateTime={agent.created_at}>{formatDateTime(agent.created_at)}</time>
                  </td>
                  <td className="aregistry__time">
                    <time dateTime={agent.updated_at}>{formatDateTime(agent.updated_at)}</time>
                  </td>
                  <td className="aregistry__cell-action">
                    {confirmId === agent.id ? (
                      // 삭제는 되돌릴 수 없다. 한 번 더 묻되, 무엇이 사라지는지 문장으로 적는다.
                      <span className="aregistry__confirm">
                        <span className="aregistry__confirm-text">
                          설정과 실행 이력이 함께 사라진다. 되돌릴 수 없다.
                        </span>
                        <Button disabled={deleting !== null} onClick={() => remove(agent.id)}>
                          {deleting === agent.id ? '삭제 중…' : '삭제한다'}
                        </Button>
                        <Button disabled={deleting !== null} onClick={() => setConfirmId(null)}>
                          취소
                        </Button>
                      </span>
                    ) : (
                      <span className="aregistry__actions">
                        <Button onClick={() => setEditingId(agent.id)}>수정</Button>
                        <Button
                          onClick={() => {
                            setConfirmId(agent.id);
                            setDeleteError(null);
                          }}
                        >
                          삭제
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="aregistry__foot">
        <span className="meta">
          {loading
            ? '세는 중…'
            : `${items.length}개 표시 · ${data?.next_cursor ? '다음 있음' : '마지막 페이지'}`}
        </span>
        <div className="aregistry__pager">
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

      {/* editingId가 있을 때만 마운트한다. 다이얼로그가 상세를 직접 읽으므로, 계속 띄워 두면
          닫힌 채로 이전 에이전트의 설정을 들고 있게 된다. */}
      {editingId !== null && (
        <EditAgentDialog
          agentId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            // 응답을 화면 상태에 직접 써넣지 않고 다시 읽는다. 서버가 updated_at을 함께
            // 바꾸므로, 응답만 믿고 일부만 갈아 끼우면 화면이 반쯤 낡는다.
            reload();
          }}
        />
      )}
    </section>
  );
}

/**
 * 에이전트 수정 다이얼로그.
 *
 * config_md는 목록 응답에 없다(controller.list가 싣지 않는다). 그래서 열릴 때 상세를 한 번
 * 읽는다 — 목록에 있는 name만으로 폼을 채우고 설정 칸을 비워 두면, 저장할 때 사용자가
 * 본 적 없는 빈 값으로 전문을 덮어쓴다.
 */
function EditAgentDialog({
  agentId,
  onClose,
  onSaved,
}: {
  agentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: agent, error: loadError, loading } = useApi<AgentDetail>(`/agents/${agentId}`);

  const [name, setName] = useState<string | null>(null);
  const [configMd, setConfigMd] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 상세가 도착하기 전에는 폼 상태가 없다. null을 서버 값의 자리표로 쓰면
  // "아직 안 고침"과 "빈 문자열로 고침"이 섞이지 않는다.
  const nameValue = name ?? agent?.name ?? '';
  const configValue = configMd ?? agent?.config_md ?? '';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (agent === null || saving) return;

    const patch = buildAgentPatch(agent, { name: nameValue, configMd: configValue });
    if (!patch.ok) {
      setError(patch.reason);
      return;
    }

    setSaving(true);
    setError(null);
    apiPatch<AgentDetail>(`/agents/${agentId}`, patch.body).then(onSaved, (err: unknown) => {
      setSaving(false);
      setError(errorMessage(err));
    });
  };

  return (
    <Modal open title="에이전트 수정" onClose={saving ? () => undefined : onClose}>
      <form className="modal__form" onSubmit={submit}>
        {loadError !== null ? (
          <p className="error-note" role="alert">
            에이전트를 불러오지 못했다: {loadError.message}
          </p>
        ) : loading || agent === null ? (
          <p className="meta">불러오는 중…</p>
        ) : (
          <>
            <div className="field">
              <label className="meta" htmlFor="edit-agent-name">
                이름
              </label>
              <input
                id="edit-agent-name"
                className="input modal__input"
                value={nameValue}
                maxLength={AGENT_NAME_MAX}
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="meta" htmlFor="edit-agent-config">
                설정(config_md)
              </label>
              <textarea
                id="edit-agent-config"
                className="input modal__input aregistry__config"
                value={configValue}
                maxLength={AGENT_CONFIG_MAX}
                onChange={(e) => setConfigMd(e.target.value)}
              />
              <span className="meta">마크다운 전문. 비워 둘 수 있다.</span>
            </div>
          </>
        )}

        {error !== null && (
          <p className="error-note" role="alert">
            저장하지 못했다: {error}
          </p>
        )}

        <div className="modal__actions">
          <Button type="button" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button type="submit" variant="solid" disabled={agent === null || saving}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
