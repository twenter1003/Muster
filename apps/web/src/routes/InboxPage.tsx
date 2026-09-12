import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EM_DASH } from '../lib/domain';
import { useApi } from '../lib/useApi';
import './InboxPage.css';

/* ───────────────────────── 서버 응답 계약 ─────────────────────────
 * GET /inbox — apps/api/src/modules/inbox/items.ts 의 InboxItem 과 같은 모양이다.
 * 두 앱이 타입을 공유하지 않으므로(패키지 경계) 여기서 다시 선언한다. 바뀌면 같이 고친다.
 */

export const INBOX_CATEGORIES = ['policy', 'budget', 'deployment', 'audit'] as const;
export type InboxCategory = (typeof INBOX_CATEGORIES)[number];

export interface InboxItem {
  id: string;
  category: InboxCategory;
  project_id: string;
  project_name: string;
  title: string;
  detail: string;
  occurred_at: string;
  href: string;
  target: { kind: string; id: string };
  approvable: boolean;
}

interface InboxResponse {
  items: InboxItem[];
  /** 필터가 걸려 있어도 전체 기준이다. 탭 배지는 그 탭을 보고 있지 않을 때의 수여야 한다. */
  counts: Record<InboxCategory, number> & { total: number };
  truncated: boolean;
}

const CATEGORY_LABEL: Record<InboxCategory, string> = {
  policy: 'Policy',
  budget: '예산',
  deployment: '배포',
  audit: '감사',
};

/**
 * 신호색(붉은색)을 쓸 항목.
 *
 * 설계서 10: 신호색은 **사용자의 처리를 요구하는 것**에만 쓴다. 같은 규칙을 여기서 다시
 * 세우지 않고 카테고리로부터 유도한다:
 * - policy + approvable=false → 차단. 승인으로 우회할 수 없으니 구성을 고쳐야 한다.
 * - deployment → 실패. MTTR이 흐르고 있다.
 * 나머지(승인 대기·예산 임계치·감사)는 읽고 판단할 일이지 사고가 난 것이 아니다.
 * 예산은 한도 **초과**면 신호여야 맞지만 응답이 임계치 초과와 한도 초과를 구분해 주지
 * 않는다(detail 문구로만 갈린다). 문구를 파싱해 색을 정하지는 않는다 — 서버가 필드로
 * 말해 줄 때 고친다.
 */
function isSignal(item: InboxItem): boolean {
  if (item.category === 'deployment') return true;
  return item.category === 'policy' && !item.approvable;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "3시간 전". 큐에서 중요한 것은 정확한 시각이 아니라 **얼마나 묵었는가**다 —
 * 이틀 된 차단과 방금 난 차단은 같은 줄이어도 다르게 읽혀야 한다.
 * 정확한 시각은 title 속성으로 남겨 가리키면 볼 수 있게 한다.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return EM_DASH;

  // 시계 어긋남이나 미래 시각이면 음수가 나온다. "-3분 전"을 보여 주느니 방금으로 접는다.
  const diff = Math.max(0, now.getTime() - then.getTime());
  if (diff < MINUTE) return '방금';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`;
  return `${Math.floor(diff / DAY)}일 전`;
}

function fullTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? EM_DASH : d.toLocaleString('ko-KR');
}

function toCategory(value: string | null): InboxCategory | null {
  return value !== null && (INBOX_CATEGORIES as readonly string[]).includes(value)
    ? (value as InboxCategory)
    : null;
}

/**
 * 인박스 — "처리해야 할 일"의 큐(설계서 08 · 목업 1g).
 *
 * 읽음 표시가 없다. 서버가 알림 행을 저장하지 않고 현재 상태에서 유도하기 때문이다
 * (inbox.service.ts 상단 주석). 그래서 이 화면에는 "읽음 처리" 버튼이 없고, 항목은
 * 원인이 사라질 때(구성을 고치면 · 배포가 성공하면 · 기한이 지나면) 사라진다.
 * 그 사실을 화면이 말해 주지 않으면 사용자는 지워지지 않는 목록을 계속 누르게 된다.
 */
export function InboxPage() {
  const [params, setParams] = useSearchParams();
  const active = toCategory(params.get('category'));

  // 필터는 서버가 건다. 전체를 받아 클라이언트에서 거르면 출처별 상한(50건)이 카테고리마다
  // 따로 걸린 뒤의 목록을 다시 자르게 돼서, 한 카테고리만 볼 때 보이는 수가 줄어든다.
  const path = active === null ? '/inbox' : `/inbox?category=${active}`;
  const { data, error, loading } = useApi<InboxResponse>(path);

  const counts = data?.counts ?? null;
  const items = useMemo(() => data?.items ?? [], [data]);

  const select = (next: InboxCategory | null) => {
    const p = new URLSearchParams(params);
    if (next === null) p.delete('category');
    else p.set('category', next);
    setParams(p, { replace: true });
  };

  return (
    <section className="inbox">
      <header className="inbox__head">
        <h1 className="page__title">
          알림{' '}
          <span className="inbox__count">
            처리 대기 {counts === null ? EM_DASH : counts.total}건
          </span>
        </h1>
      </header>

      <div className="inbox__tabs" role="group" aria-label="분류 필터">
        <button
          type="button"
          className="inbox__tab"
          aria-pressed={active === null}
          onClick={() => select(null)}
        >
          전체 <span className="inbox__tab-count">{counts === null ? EM_DASH : counts.total}</span>
        </button>
        {INBOX_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className="inbox__tab"
            aria-pressed={active === category}
            onClick={() => select(category)}
          >
            {CATEGORY_LABEL[category]}{' '}
            <span className="inbox__tab-count">
              {counts === null ? EM_DASH : counts[category]}
            </span>
          </button>
        ))}
      </div>

      <p className="inbox__meta">
        최근 순 · 원인이 해소되면 목록에서 사라진다(읽음 표시는 없다)
        {data?.truncated === true && ' · 상한에 걸려 일부만 표시한다'}
      </p>

      {error !== null ? (
        <p className="inbox__error" role="alert">
          목록을 불러오지 못했다: {error.message}
        </p>
      ) : loading ? (
        <p className="inbox__meta">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="inbox__empty">
          {active === null
            ? '처리를 기다리는 일이 없다.'
            : `${CATEGORY_LABEL[active]} 분류에 처리를 기다리는 일이 없다.`}
        </p>
      ) : (
        <ul className="inbox__list">
          {items.map((item) => (
            <li key={item.id} className="inbox__item" data-signal={isSignal(item) || undefined}>
              {/* 행 전체가 아니라 제목만 링크다. 행을 통째로 링크로 만들면 안에 있는
                  프로젝트 링크가 중첩돼 마크업이 깨진다. */}
              <div className="inbox__item-head">
                <span className="inbox__tag">{CATEGORY_LABEL[item.category]}</span>
                <Link className="inbox__title" to={item.href}>
                  {item.title}
                </Link>
                <time className="inbox__time" dateTime={item.occurred_at} title={fullTime(item.occurred_at)}>
                  {relativeTime(item.occurred_at)}
                </time>
              </div>
              <p className="inbox__detail">{item.detail}</p>
              <div className="inbox__foot">
                <Link className="inbox__project" to={`/projects/${item.project_id}`}>
                  {item.project_name}
                </Link>
                {/* 승인은 아직 이 화면에서 하지 않는다. 승인 동작은 환경 구성 화면에 있고,
                    같은 버튼을 두 곳에 두면 어느 쪽이 정본인지가 흐려진다. 여기서는
                    "승인으로 풀 수 있는 건인가"만 말하고 그 화면으로 보낸다. */}
                {item.approvable && <span className="inbox__flag">승인 대기</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
