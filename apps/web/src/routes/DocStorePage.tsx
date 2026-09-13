import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import type { Page } from '../lib/api';
import { DOCUMENT_TYPES, formatDateTime, type DocumentType } from '../lib/domain';
import { listPath } from '../lib/listQuery';
import { useApi } from '../lib/useApi';
import './DocStorePage.css';

/* ───────────────────────── 서버 응답 계약 ─────────────────────────
 * GET /documents?type= — apps/api/src/modules/doc-store/documents.controller.ts 의
 * DocumentsController.list. 프로젝트 하위 목록(/projects/:id/documents)과 같은 뷰에
 * project_name만 더해 온다. 두 앱이 타입을 공유하지 않으므로 여기서 다시 선언한다.
 *
 * file_url은 오지 않는다 — 서버가 버킷 경로를 내보내지 않기로 했고, 내려받기는 상세
 * 조회가 발급하는 signed URL로만 된다. 그래서 이 목록에는 내려받기 버튼이 없다.
 */
interface DocumentView {
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  type: string;
  upload_status: string;
  commit_ref: string | null;
  created_at: string;
}

const PAGE_LIMIT = 50;

const TYPE_LABEL: Record<DocumentType, string> = {
  prd: 'PRD',
  srs: 'SRS',
  tech_spec: '기술 명세',
  other: '기타',
};

function toType(value: string | null): DocumentType | null {
  return value !== null && (DOCUMENT_TYPES as readonly string[]).includes(value)
    ? (value as DocumentType)
    : null;
}

/**
 * DocStore — 내가 속한 모든 프로젝트의 문서를 한 목록으로 본다(설계서 Part 4 §4).
 *
 * 프로젝트 개요에도 문서 목록이 있지만 그쪽은 한 프로젝트 안이다. 이 화면이 있는 이유는
 * 그것으로는 답이 안 나오는 질문 — "PRD를 아직 안 올린 프로젝트가 어디냐" — 하나뿐이다.
 * 그래서 컬럼도 프로젝트를 가로질러 비교할 수 있는 것만 남긴다.
 *
 * 신호색은 쓰지 않는다. 업로드가 pending인 문서도 사용자가 지금 이 화면에서 할 수 있는
 * 처리가 아니다(업로드는 발급된 signed URL을 쥔 쪽이 끝낸다) — 지나간 목록에 붉은색을
 * 쓰기 시작하면 정말 처리를 요구하는 자리(인박스·Policy 차단)가 묻힌다.
 */
export function DocStorePage() {
  const [params, setParams] = useSearchParams();
  const type = toType(params.get('type'));
  const [cursor, setCursor] = useState<string | null>(null);

  // 필터는 서버가 건다. 페이지(50건)를 받아 놓고 화면에서 거르면 "PRD 3건"이 전체가 아니라
  // 이 페이지 안의 수가 되는데, 화면은 그 차이를 말해 줄 방법이 없다(감사 로그가 실제로
  // 그 문제를 안고 있고, 거기는 서버에 필터가 없어서 그랬다. 여기는 있다).
  const path = listPath('/documents', { limit: PAGE_LIMIT, cursor, type });
  const { data, error, loading } = useApi<Page<DocumentView>>(path);

  const items = data?.items ?? [];

  const select = (next: DocumentType | null) => {
    const p = new URLSearchParams(params);
    if (next === null) p.delete('type');
    else p.set('type', next);
    setParams(p, { replace: true });
    // 필터가 바뀌면 커서는 무효다 — 이전 조건에서 발급된 커서로 다음 장을 넘기면
    // 서버가 다른 조건의 위치를 이어받는다.
    setCursor(null);
  };

  return (
    <section className="page docstore">
      <header className="page__head">
        <h1 className="page__title">
          DocStore <span className="page__count">내가 속한 프로젝트 전체</span>
        </h1>
      </header>

      <div className="chip-row" role="group" aria-label="문서 종류 필터">
        <button
          type="button"
          className="chip docstore__tab"
          aria-pressed={type === null}
          onClick={() => select(null)}
        >
          전체
        </button>
        {DOCUMENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className="chip docstore__tab"
            aria-pressed={type === t}
            onClick={() => select(t)}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <p className="meta">
        최근 등록 순 · 커서 페이지네이션 limit {PAGE_LIMIT} · 종류 필터는 서버가 건다(전체 기준)
      </p>

      {error !== null ? (
        <p className="error-note" role="alert">
          문서 목록을 불러오지 못했다: {error.message}
        </p>
      ) : loading ? (
        <p className="meta">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="meta docstore__empty">
          {type === null ? '등록된 문서가 없다.' : `${TYPE_LABEL[type]} 문서가 한 건도 없다.`}
        </p>
      ) : (
        <div className="scroll-x">
          <table className="table docstore__table">
            <thead>
              <tr>
                <th scope="col">제목</th>
                <th scope="col">종류</th>
                <th scope="col">프로젝트</th>
                <th scope="col">업로드</th>
                <th scope="col">등록</th>
              </tr>
            </thead>
            <tbody>
              {items.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    {/* 문서 단독 화면이 아직 없다. 제목을 죽은 링크로 두느니 문서가 놓인
                        프로젝트로 보낸다 — 이 목록에서 하려는 다음 행동이 대개 그것이다. */}
                    <Link className="docstore__title" to={`/projects/${doc.project_id}`}>
                      {doc.title}
                    </Link>
                    {doc.commit_ref !== null && (
                      <span className="docstore__ref" title="연결된 커밋">
                        {doc.commit_ref.slice(0, 7)}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="badge">{TYPE_LABEL[toType(doc.type) ?? 'other']}</span>
                  </td>
                  <td>
                    <Link className="docstore__project" to={`/projects/${doc.project_id}`}>
                      {doc.project_name}
                    </Link>
                  </td>
                  <td>
                    {/* 채우지 않은 배지다. pending은 나쁜 상태가 아니라 진행 중이다. */}
                    <span className="badge">{doc.upload_status}</span>
                  </td>
                  <td className="docstore__time">
                    <time
                      dateTime={doc.created_at}
                      title={new Date(doc.created_at).toLocaleString('ko-KR')}
                    >
                      {formatDateTime(doc.created_at)}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="docstore__foot">
        {/* 아직 안 온 값에 —를 찍지 않는다 — —는 "없다"는 확정된 사실이다(domain.ts). */}
        <span className="meta">
          {loading
            ? '세는 중…'
            : `${items.length}건 표시 · ${data?.next_cursor ? '다음 있음' : '마지막 페이지'}`}
        </span>
        <div className="docstore__pager">
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
    </section>
  );
}
