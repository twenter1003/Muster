import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Panel } from '../components/Panel';
import { StatusBadge } from '../components/StatusBadge';
import type { Page } from '../lib/api';
import {
  BUILD_STATUSES,
  formatDateTime,
  readStack,
  type BuildStatus,
} from '../lib/domain';
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
          {status === null
            ? '생성된 환경 구성이 없다.'
            : `${status} 상태인 환경 구성이 없다.`}
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
          <Button disabled={!data?.next_cursor} onClick={() => setCursor(data?.next_cursor ?? null)}>
            다음
          </Button>
        </div>
      </div>

      <Panel title="내 템플릿" aside={`최근 ${TEMPLATE_LIMIT}개까지`}>
        <p className="meta">
          템플릿은 프로젝트가 아니라 계정에 달려 있다. 새 환경 구성은 프로젝트 안에서 만들되,
          고를 수 있는 프리셋이 무엇인지는 여기서만 한눈에 보인다.
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
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </section>
  );
}
