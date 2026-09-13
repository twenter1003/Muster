import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import './SearchBox.css';

export type SearchKind = 'project' | 'document' | 'agent';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  project_id: string;
  project_name: string;
}

interface SearchResult {
  /** 서버가 되돌려주는 검색어. 늦게 온 응답을 버리는 데 쓴다. */
  query: string;
  hits: SearchHit[];
  truncated: Record<SearchKind, boolean>;
}

const KIND_LABEL: Record<SearchKind, string> = {
  project: '프로젝트',
  document: '문서',
  agent: '에이전트',
};

/** 입력이 멎기를 기다리는 시간. */
const DEBOUNCE_MS = 200;

/**
 * 결과를 눌렀을 때 갈 곳.
 *
 * 문서·에이전트에는 자기 화면이 없다. 그래서 그것이 속한 프로젝트의 해당 탭으로 보낸다 —
 * 없는 경로를 지어내면 막다른 길이 되고, 아무 데도 안 보내면 결과가 장식이 된다.
 */
export function hrefFor(hit: SearchHit): string {
  switch (hit.kind) {
    case 'project':
      return `/projects/${hit.id}`;
    case 'document':
      return `/projects/${hit.project_id}?tab=docs`;
    case 'agent':
      return `/projects/${hit.project_id}?tab=agents`;
  }
}

/**
 * 상단바 검색.
 *
 * 오래도록 입력만 받고 아무 데도 보내지 않는 상자였다. 서버에 조회가 없었기 때문인데,
 * 이제 `GET /search`가 생겨 연결한다.
 *
 * **드롭다운이지 검색 결과 화면이 아니다.** 이 상자의 목적은 "그곳으로 건너뛰기"이지
 * 목록을 훑는 것이 아니라서, 종류마다 다섯 건까지만 보여 주고 페이지네이션을 두지 않는다.
 * 더 있으면 그 사실만 말한다 — 보이는 것이 전부라고 읽히면 안 된다.
 */
export function SearchBox() {
  const navigate = useNavigate();
  const listId = useId();

  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length === 0) {
      setResult(null);
      setFailed(false);
      return;
    }

    // 한 글자마다 부르면 타이핑 한 번에 질의가 열 번 간다. 멎은 뒤에 한 번 부른다.
    let live = true;
    const timer = setTimeout(() => {
      apiFetch<SearchResult>(`/search?q=${encodeURIComponent(trimmed)}`).then(
        (res) => {
          if (!live) return;
          // 늦게 온 응답이 새 결과를 덮지 않게 한다. "ab"의 답이 "abc"의 답보다 늦게
          // 올 수 있고, 그러면 화면이 방금 지운 검색어의 결과를 보여 준다.
          if (res.query !== trimmed) return;
          setResult(res);
          setActive(0);
          setFailed(false);
        },
        () => {
          if (!live) return;
          setResult(null);
          setFailed(true);
        },
      );
    }, DEBOUNCE_MS);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [trimmed]);

  // 바깥을 누르면 닫는다. 드롭다운이 열린 채 남아 화면을 가리지 않게 한다.
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const hits = result?.hits ?? [];
  const showing = open && trimmed.length > 0;

  const go = (hit: SearchHit) => {
    setOpen(false);
    setQuery('');
    navigate(hrefFor(hit));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (hits.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(hits[active]);
    }
  };

  const truncatedKinds = result
    ? (Object.keys(result.truncated) as SearchKind[]).filter((k) => result.truncated[k])
    : [];

  return (
    <div className="searchbox" ref={boxRef}>
      <input
        className="topbar__search"
        type="search"
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="프로젝트·문서·에이전트 검색"
        aria-label="프로젝트·문서·에이전트 검색"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {showing && (
        <div className="searchbox__panel" id={listId} role="listbox">
          {failed ? (
            <p className="meta searchbox__note" role="alert">
              검색하지 못했다.
            </p>
          ) : result === null ? (
            <p className="meta searchbox__note">찾는 중…</p>
          ) : hits.length === 0 ? (
            <p className="meta searchbox__note">일치하는 것이 없다.</p>
          ) : (
            <>
              {hits.map((hit, i) => (
                <button
                  key={`${hit.kind}:${hit.id}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className="searchbox__hit"
                  // 클릭이 blur보다 먼저 오게 한다. mousedown에서 닫히면 클릭이 사라진다.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(hit)}
                >
                  <span className="badge searchbox__kind">{KIND_LABEL[hit.kind]}</span>
                  <span className="searchbox__title">{hit.title}</span>
                  {/* 프로젝트는 자기 이름을 두 번 적지 않는다. */}
                  {hit.kind !== 'project' && <span className="meta">{hit.project_name}</span>}
                </button>
              ))}

              {truncatedKinds.length > 0 && (
                <p className="meta searchbox__note">
                  {truncatedKinds.map((k) => KIND_LABEL[k]).join(' · ')}은(는) 더 있다 — 해당
                  화면에서 거르면 전부 볼 수 있다.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
