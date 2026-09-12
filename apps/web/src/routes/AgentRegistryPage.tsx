import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import type { Page } from '../lib/api';
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

const PAGE_LIMIT = 50;

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
 */
export function AgentRegistryPage() {
  const [cursor, setCursor] = useState<string | null>(null);

  const path = listPath('/agents', { limit: PAGE_LIMIT, cursor });
  const { data, error, loading } = useApi<Page<AgentView>>(path);

  const items = data?.items ?? [];

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
          <Button disabled={!data?.next_cursor} onClick={() => setCursor(data?.next_cursor ?? null)}>
            다음
          </Button>
        </div>
      </div>
    </section>
  );
}
