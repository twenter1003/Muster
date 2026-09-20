import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getGoalsProgressStats,
  parseGoalChecklist,
  parseGoalChecklistSections,
  type GoalCheckItem,
} from '../lib/goalChecklist';
import './GoalChecklistDrawer.css';

export interface GoalChecklistDrawerProps {
  open: boolean;
  onClose: () => void;
  contentMd: string | null | undefined;
  saving?: boolean;
  onToggleCheck: (index: number) => void;
  onEditGoals?: () => void;
}

/**
 * 체크리스트 항목 필터링 순수 함수 (상태 필터, 완료 숨기기, 실시간 검색어).
 */
export function filterDrawerItems(
  items: GoalCheckItem[],
  filter: 'all' | 'pending' | 'completed',
  hideCompleted: boolean,
  query: string,
): GoalCheckItem[] {
  const trimmed = query.trim().toLowerCase();

  return items.filter((item) => {
    if (hideCompleted && item.completed) return false;
    if (filter === 'pending' && item.completed) return false;
    if (filter === 'completed' && !item.completed) return false;
    if (trimmed && !item.title.toLowerCase().includes(trimmed)) {
      return false;
    }
    return true;
  });
}

/**
 * 대시보드 미니 HUD에 노출할 최우선 미완료 태스크 N개 추출.
 */
export function getUpNextItems(items: GoalCheckItem[], limit = 3): GoalCheckItem[] {
  return items.filter((item) => !item.completed).slice(0, limit);
}

/**
 * 진행률 요약 뱃지 포맷 문자열 반환 (예: "16/25 완료 (64%)").
 */
export function formatProgressSummary(completed: number, total: number): string {
  if (total <= 0) return '0/0 완료 (0%)';
  const percent = Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
  return `${completed}/${total} 완료 (${percent}%)`;
}

/**
 * 목표 체크리스트 전용 슬라이드 드로어 (데스크톱: 우측 460px 패널, 모바일: 85vh 바텀 시트).
 * 네이티브 `<dialog>`를 사용하여 ESC 닫기, 배경 클릭 닫기, 보조기기 접근성을 완벽히 지원한다.
 */
export function GoalChecklistDrawer({
  open,
  onClose,
  contentMd,
  saving = false,
  onToggleCheck,
  onEditGoals,
}: GoalChecklistDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    const handleClose = () => {
      onClose();
    };

    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
  }, [onClose]);

  const items = useMemo(() => parseGoalChecklist(contentMd), [contentMd]);
  const sections = useMemo(() => parseGoalChecklistSections(contentMd), [contentMd]);
  const stats = useMemo(() => getGoalsProgressStats(contentMd), [contentMd]);

  const hasMultipleSections =
    sections.length > 1 || (sections.length === 1 && Boolean(sections[0].title));

  const filteredSections = useMemo(() => {
    return sections
      .map((sec) => ({
        ...sec,
        items: filterDrawerItems(sec.items, filter, hideCompleted, searchQuery),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [sections, filter, hideCompleted, searchQuery]);

  const filteredFlatItems = useMemo(() => {
    return filterDrawerItems(items, filter, hideCompleted, searchQuery);
  }, [items, filter, hideCompleted, searchQuery]);

  const toggleSectionCollapse = (secId: string, defaultCollapsed: boolean) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [secId]: !(prev[secId] ?? defaultCollapsed),
    }));
  };

  const handleToggleAllSections = (collapse: boolean) => {
    const next: Record<string, boolean> = {};
    for (const s of sections) {
      next[s.id] = collapse;
    }
    setCollapsedSections(next);
  };

  const pendingCount = stats.total - stats.completed;

  return (
    <dialog
      ref={dialogRef}
      className="goal-drawer"
      aria-label="목표 체크리스트 전체보기"
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="goal-drawer__panel">
        {/* 모바일 바텀시트 상단 그랩 핸들 */}
        <div className="goal-drawer__grab-handle-wrap" aria-hidden="true">
          <span className="goal-drawer__grab-handle" />
        </div>

        {/* 헤더 */}
        <header className="goal-drawer__head">
          <div className="goal-drawer__title-wrap">
            <h2 className="goal-drawer__title">목표 체크리스트</h2>
            <span className="goal-drawer__summary-badge">
              {formatProgressSummary(stats.completed, stats.total)}
            </span>
          </div>
          <button
            type="button"
            className="goal-drawer__close-btn"
            onClick={onClose}
            aria-label="드로어 닫기"
          >
            ✕
          </button>
        </header>

        {/* 진행률 바 */}
        <div className="goal-drawer__progress-bar-wrap" aria-hidden="true">
          <div className="goal-drawer__progress-bar-fill" style={{ width: `${stats.percent}%` }} />
        </div>

        {/* 스마트 툴바: 검색 및 필터 칩 */}
        <div className="goal-drawer__toolbar">
          <div className="goal-drawer__search-wrap">
            <input
              type="search"
              className="input goal-drawer__search-input"
              placeholder="태스크 이름 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="goal-drawer__search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="검색어 초기화"
              >
                ✕
              </button>
            )}
          </div>

          <div className="goal-drawer__filter-row">
            <div className="goal-drawer__chips">
              <button
                type="button"
                className={`chip ${filter === 'all' ? 'chip--active' : ''}`}
                onClick={() => setFilter('all')}
              >
                전체 <span className="chip__count">{stats.total}</span>
              </button>
              <button
                type="button"
                className={`chip ${filter === 'pending' ? 'chip--active' : ''}`}
                onClick={() => setFilter('pending')}
              >
                대기 중 <span className="chip__count">{pendingCount}</span>
              </button>
              <button
                type="button"
                className={`chip ${filter === 'completed' ? 'chip--active' : ''}`}
                onClick={() => setFilter('completed')}
              >
                완료 <span className="chip__count">{stats.completed}</span>
              </button>
            </div>

            <label className="goal-drawer__hide-toggle">
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
              />
              <span>완료 숨기기</span>
            </label>
          </div>

          {hasMultipleSections && (
            <div className="goal-drawer__section-controls">
              <button
                type="button"
                className="goal-drawer__text-btn"
                onClick={() => handleToggleAllSections(true)}
              >
                모두 접기
              </button>
              <span className="meta">·</span>
              <button
                type="button"
                className="goal-drawer__text-btn"
                onClick={() => handleToggleAllSections(false)}
              >
                모두 펼치기
              </button>
            </div>
          )}
        </div>

        {/* 스크롤 본문 */}
        <div className="goal-drawer__body">
          {hasMultipleSections ? (
            filteredSections.length > 0 ? (
              <div className="goal-drawer__sections-list">
                {filteredSections.map((sec) => {
                  const defaultCollapsed = sec.percent === 100;
                  const isCollapsed = collapsedSections[sec.id] ?? defaultCollapsed;
                  return (
                    <div key={sec.id} className="goal-drawer__section-card">
                      <button
                        type="button"
                        className="goal-drawer__section-head"
                        onClick={() => toggleSectionCollapse(sec.id, defaultCollapsed)}
                        aria-expanded={!isCollapsed}
                      >
                        <div className="goal-drawer__section-title-wrap">
                          <span
                            className={`goal-drawer__section-chevron ${
                              isCollapsed ? '' : 'goal-drawer__section-chevron--open'
                            }`}
                          >
                            ▸
                          </span>
                          <span className="goal-drawer__section-title">
                            {sec.title || '일반 목표'}
                          </span>
                        </div>
                        <span className="goal-drawer__section-stat">
                          {sec.completedCount}/{sec.totalCount} ({sec.percent}%)
                        </span>
                      </button>

                      {!isCollapsed && (
                        <div className="goal-drawer__item-list">
                          {sec.items.map((item) => (
                            <label
                              key={item.index}
                              className={`goal-drawer__item ${
                                item.completed ? 'goal-drawer__item--done' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={item.completed}
                                disabled={saving}
                                onChange={() => onToggleCheck(item.index)}
                              />
                              <span className="goal-drawer__item-title">{item.title}</span>
                              {item.completed ? (
                                <span className="badge badge--ok">완료</span>
                              ) : (
                                <span className="meta">대기</span>
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="meta goal-drawer__empty-msg">
                {searchQuery
                  ? `"${searchQuery}" 검색 조건에 맞는 목표가 없습니다.`
                  : filter === 'pending'
                    ? '모든 목표가 완료되었습니다.'
                    : '표시할 목표 항목이 없습니다.'}
              </p>
            )
          ) : filteredFlatItems.length > 0 ? (
            <div className="goal-drawer__item-list">
              {filteredFlatItems.map((item) => (
                <label
                  key={item.index}
                  className={`goal-drawer__item ${item.completed ? 'goal-drawer__item--done' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={item.completed}
                    disabled={saving}
                    onChange={() => onToggleCheck(item.index)}
                  />
                  <span className="goal-drawer__item-title">{item.title}</span>
                  {item.completed ? (
                    <span className="badge badge--ok">완료</span>
                  ) : (
                    <span className="meta">대기</span>
                  )}
                </label>
              ))}
            </div>
          ) : (
            <p className="meta goal-drawer__empty-msg">
              {searchQuery
                ? `"${searchQuery}" 검색 조건에 맞는 목표가 없습니다.`
                : filter === 'pending'
                  ? '모든 목표가 완료되었습니다.'
                  : '표시할 목표 항목이 없습니다.'}
            </p>
          )}
        </div>

        {/* 푸터 액션 바 */}
        <footer className="goal-drawer__foot">
          <div className="goal-drawer__foot-left">
            {onEditGoals && (
              <button
                type="button"
                className="btn btn--secondary goal-drawer__foot-btn"
                onClick={() => {
                  onClose();
                  onEditGoals();
                }}
                disabled={saving}
              >
                목표 직접 편집
              </button>
            )}
          </div>
          <button type="button" className="btn goal-drawer__foot-btn" onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </dialog>
  );
}
