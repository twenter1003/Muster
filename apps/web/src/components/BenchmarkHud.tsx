import { useBenchmark } from '../lib/benchmarkContext';
import './BenchmarkHud.css';

export function BenchmarkHud() {
  const {
    variant,
    setVariant,
    currentMetrics,
    metricsA,
    metricsB,
    speedupFactor,
    collapsed,
    toggleCollapsed,
  } = useBenchmark();

  if (collapsed) {
    return (
      <aside
        className="bhud-pill"
        role="region"
        aria-label="A/B 벤치마크 축소 컨트롤러"
        onClick={toggleCollapsed}
      >
        <div className="bhud-pill__indicator">
          <span
            className={`bhud-pill__dot ${variant === 'B' ? 'bhud-pill__dot--fast' : 'bhud-pill__dot--slow'}`}
          />
          <span className="bhud-pill__variant">
            {variant === 'B' ? 'Variant B (고속)' : 'Variant A (점진)'}
          </span>
        </div>
        <span className="bhud-pill__badge">{speedupFactor} 속도</span>
        <button
          type="button"
          className="bhud-pill__expand-btn"
          aria-label="벤치마크 패널 펼치기"
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapsed();
          }}
        >
          HUD 펼치기
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="bhud-panel"
      role="region"
      aria-label="실시간 A/B 벤치마크 및 성능 HUD"
    >
      <header className="bhud-panel__head">
        <div className="bhud-panel__title-wrap">
          <svg
            className="bhud-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <span className="bhud-panel__title">A/B 벤치마크 HUD</span>
          <span className="bhud-badge-speedup">{speedupFactor} 빠른 렌더링</span>
        </div>
        <button
          type="button"
          className="bhud-panel__close-btn"
          onClick={toggleCollapsed}
          aria-label="패널 접기"
          title="패널 축소"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <div className="bhud-panel__switch-section">
        <span className="bhud-panel__label">파이프라인 모드 선택:</span>
        <div className="bhud-segmented" role="radiogroup" aria-label="A/B 테스트 변형">
          <button
            type="button"
            className={`bhud-segmented__btn ${variant === 'A' ? 'bhud-segmented__btn--active' : ''}`}
            role="radio"
            aria-checked={variant === 'A'}
            onClick={() => setVariant('A')}
          >
            <span className="bhud-segmented__tag">A</span>
            <span className="bhud-segmented__name">점진적 분할 (N+1)</span>
          </button>
          <button
            type="button"
            className={`bhud-segmented__btn ${variant === 'B' ? 'bhud-segmented__btn--active' : ''}`}
            role="radio"
            aria-checked={variant === 'B'}
            onClick={() => setVariant('B')}
          >
            <span className="bhud-segmented__tag bhud-segmented__tag--b">B</span>
            <span className="bhud-segmented__name">통합 고속 대시보드</span>
          </button>
        </div>
      </div>

      <div className="bhud-metrics-grid">
        <div className="bhud-metric-card">
          <span className="bhud-metric-card__label">네트워크 HTTP 요청</span>
          <div className="bhud-metric-card__value-row">
            <span className="bhud-metric-card__value mono">
              {currentMetrics.reqCount}
              <span className="bhud-metric-card__unit"> reqs</span>
            </span>
            <span className="bhud-metric-card__compare meta">
              {variant === 'B' ? `vs A: ${metricsA.reqCount} reqs` : `vs B: ${metricsB.reqCount} req`}
            </span>
          </div>
        </div>

        <div className="bhud-metric-card">
          <span className="bhud-metric-card__label">로딩 소요 시간</span>
          <div className="bhud-metric-card__value-row">
            <span className="bhud-metric-card__value mono">
              {currentMetrics.durationMs}
              <span className="bhud-metric-card__unit"> ms</span>
            </span>
            <span className="bhud-metric-card__compare meta">
              {variant === 'B' ? `vs A: ${metricsA.durationMs} ms` : `vs B: ${metricsB.durationMs} ms`}
            </span>
          </div>
        </div>

        <div className="bhud-metric-card">
          <span className="bhud-metric-card__label">슬롯 깜빡임 / 시프트</span>
          <div className="bhud-metric-card__value-row">
            <span
              className={`bhud-metric-card__value mono ${currentMetrics.layoutShifts > 0 ? 'bhud-metric--warn' : 'bhud-metric--good'}`}
            >
              {currentMetrics.layoutShifts}
              <span className="bhud-metric-card__unit"> 회</span>
            </span>
            <span className="bhud-metric-card__compare meta">
              {variant === 'B' ? '0회 (인스턴트)' : '40+회 (N+1 깜빡임)'}
            </span>
          </div>
        </div>

        <div className="bhud-metric-card bhud-metric-card--highlight">
          <span className="bhud-metric-card__label">성능 개선 배수</span>
          <div className="bhud-metric-card__value-row">
            <span className="bhud-metric-card__value bhud-metric--accent mono">
              {speedupFactor}
            </span>
            <span className="bhud-metric-card__compare meta">
              {variant === 'B' ? 'Treatment 가속 적용됨' : 'Control 기존 상태'}
            </span>
          </div>
        </div>
      </div>

      <footer className="bhud-panel__foot">
        <p className="bhud-panel__hint">
          {variant === 'B'
            ? 'Variant B는 단일 호출(/projects?summary=true)로 헬스·배포·토큰·에이전트 정보를 1회에 수신합니다.'
            : 'Variant A는 프로젝트 목록 조회 후 각 카드마다 4개의 개별 엔드포인트를 N+1 호출합니다.'}
        </p>
      </footer>
    </aside>
  );
}
