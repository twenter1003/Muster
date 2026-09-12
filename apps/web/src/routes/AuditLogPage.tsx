import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import type { Page } from '../lib/api';
import { EM_DASH } from '../lib/domain';
import { useApi } from '../lib/useApi';
import './AuditLogPage.css';

/* ───────────────────────── 서버 응답 계약 ─────────────────────────
 * GET /audit-logs — 설계서 Part 4 §8. 항상 요청자 자신의 기록만 온다
 * (남의 user_id를 지정할 방법이 서버에 없다). 그래서 이 화면에는 행위자 컬럼이 없다 —
 * 전부 나다. 한 줄에 "나"를 22번 반복해 찍으면 읽을 것이 하나 줄어들 뿐이다.
 */
interface AuditLogView {
  id: string;
  action: string;
  project_id: string | null;
  /** 프로젝트가 물리 삭제됐으면 null. project.delete 기록은 대개 이 상태로 남는다. */
  project_name: string | null;
  created_at: string;
}

const PAGE_LIMIT = 50;

/**
 * 행위 → 사람이 읽는 문구.
 *
 * enums.ts의 AUDIT_ACTIONS 22종과 1:1이다. 여기 없는 값이 오면 원문을 그대로 보여 준다 —
 * 서버에 액션이 추가됐을 때 화면이 빈칸을 그리는 것보다 낫다.
 */
const ACTION_LABEL: Record<string, string> = {
  login: '로그인',
  logout: '로그아웃',
  'project.create': '프로젝트 생성',
  'project.update': '프로젝트 수정',
  'project.delete': '프로젝트 삭제',
  'git_integration.create': 'Git 연동',
  'git_integration.delete': 'Git 연동 해제',
  'document.create': '문서 등록',
  'document.update': '문서 수정',
  'document.delete': '문서 삭제',
  'agent.create': '에이전트 등록',
  'agent.update': '에이전트 수정',
  'agent.delete': '에이전트 삭제',
  'env_config.create': '환경 구성 생성',
  'env_config.approve': '환경 구성 승인',
  'env_config.reject': '환경 구성 반려',
  'env_config.execute': '환경 구성 실행',
  'template.create': '템플릿 생성',
  'template.delete': '템플릿 삭제',
  'budget.update': '예산 변경',
  'api_key.create': 'API 키 발급',
  'api_key.revoke': 'API 키 폐기',
};

/**
 * 필터 묶음.
 *
 * 22개를 낱개 칩으로 늘어놓으면 필터가 표보다 커진다. 접두(`project.` 등)로 묶되,
 * **보안**만은 접두를 가로지른다 — 키·연동·예산은 각각 다른 접두지만 "돈과 접근 권한이
 * 움직인 기록"이라는 점에서 같이 보게 되는 것들이다(인박스가 큐에 올리는 기준과 같다).
 */
const GROUPS = [
  { key: 'all', label: '전체', match: () => true },
  { key: 'project', label: '프로젝트', match: (a: string) => a.startsWith('project.') },
  { key: 'document', label: '문서', match: (a: string) => a.startsWith('document.') },
  { key: 'agent', label: '에이전트', match: (a: string) => a.startsWith('agent.') },
  { key: 'env', label: '환경 구성', match: (a: string) => a.startsWith('env_config.') },
  {
    key: 'security',
    label: '보안 · 과금',
    match: (a: string) =>
      a.startsWith('api_key.') || a.startsWith('git_integration.') || a === 'budget.update',
  },
  { key: 'session', label: '세션', match: (a: string) => a === 'login' || a === 'logout' },
] as const;

type GroupKey = (typeof GROUPS)[number]['key'];

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * 감사 로그(설계서 Part 4 §8 · 목업 1i).
 *
 * 인박스와 뿌리가 같은 데이터지만 목적이 다르다. 인박스는 **처리할 일**의 큐라 6종만
 * 골라 담고 기한이 지나면 지운다. 여기는 **이력**이라 22종 전부가 지워지지 않고 남는다.
 * 그래서 신호색을 쓰지 않는다 — 지나간 일에는 사용자가 할 수 있는 처리가 없다.
 *
 * 필터가 클라이언트 쪽인 이유: 서버에 action 쿼리 파라미터가 없다. 즉 "현재 페이지
 * 안에서만" 거른다. 페이지당 50건이라 최근 이력을 훑는 용도에는 맞지만, 오래된 특정
 * 행위를 찾는 데는 맞지 않는다 — 그 사실을 화면이 한 줄로 말한다.
 */
export function AuditLogPage() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupKey>('all');

  const path = `/audit-logs?limit=${PAGE_LIMIT}${
    cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`
  }`;
  const { data, error, loading } = useApi<Page<AuditLogView>>(path);

  const logs = useMemo(() => data?.items ?? [], [data]);

  const counts = useMemo(() => {
    const out = {} as Record<GroupKey, number>;
    for (const g of GROUPS) out[g.key] = logs.filter((l) => g.match(l.action)).length;
    return out;
  }, [logs]);

  const matcher = GROUPS.find((g) => g.key === group) ?? GROUPS[0];
  const visible = useMemo(() => logs.filter((l) => matcher.match(l.action)), [logs, matcher]);

  return (
    <section className="audit">
      <header className="audit__head">
        <h1 className="page__title">
          감사 로그 <span className="audit__count">내 이력 · 최근 {logs.length}건</span>
        </h1>
      </header>

      <div className="audit__tabs" role="group" aria-label="행위 필터">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            className="audit__tab"
            aria-pressed={group === g.key}
            onClick={() => setGroup(g.key)}
          >
            {g.label} <span className="audit__tab-count">{counts[g.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <p className="audit__meta">
        최근 순 · 커서 페이지네이션 limit {PAGE_LIMIT} · 필터는 이 페이지 안에서만 적용된다
      </p>

      {error !== null ? (
        <p className="audit__error" role="alert">
          이력을 불러오지 못했다: {error.message}
        </p>
      ) : loading ? (
        <p className="audit__meta">불러오는 중…</p>
      ) : visible.length === 0 ? (
        <p className="audit__empty">
          {logs.length === 0 ? '남은 이력이 없다.' : '이 페이지에 해당 행위 기록이 없다.'}
        </p>
      ) : (
        <div className="audit__scroll">
          <table className="audit__table">
            <thead>
              <tr>
                <th scope="col">시각</th>
                <th scope="col">행위</th>
                <th scope="col">대상 프로젝트</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((log) => (
                <tr key={log.id}>
                  <td className="audit__time">
                    <time dateTime={log.created_at}>{formatTime(log.created_at)}</time>
                  </td>
                  <td>
                    {ACTION_LABEL[log.action] ?? log.action}
                    {/* 원문 코드를 같이 남긴다 — 이력은 나중에 남에게 보여 주며 따지는
                        자료라, 한글 번역만 있으면 어느 필드의 어떤 값이었는지 못 짚는다. */}
                    <span className="audit__code">{log.action}</span>
                  </td>
                  <td>
                    {log.project_id === null ? (
                      <span className="audit__dash">{EM_DASH}</span>
                    ) : log.project_name === null ? (
                      // 프로젝트가 사라졌어도 기록은 남는다. 그 사실 자체가 정보다.
                      <span className="audit__gone">삭제된 프로젝트</span>
                    ) : (
                      <Link className="audit__project" to={`/projects/${log.project_id}`}>
                        {log.project_name}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="audit__foot">
        <span className="audit__meta">
          {visible.length}건 표시 · {data?.next_cursor ? '다음 있음' : '마지막 페이지'}
        </span>
        <div className="audit__pager">
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
