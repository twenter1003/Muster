import { useState } from 'react';
import {
  formatCost,
  formatTokenCount,
  type TokenWasteIntelligence,
} from '../lib/tokenIntelligence';
import { Modal } from './Modal';
import { Button } from './Button';
import './TokenWasteIntelligenceCard.css';

export interface TokenWasteIntelligenceCardProps {
  intelligence?: TokenWasteIntelligence | null;
  totalCost?: string;
  totalTokens?: string;
}

export function TokenWasteIntelligenceCard({
  intelligence,
  totalCost,
  totalTokens,
}: TokenWasteIntelligenceCardProps) {
  const [guideModalOpen, setGuideModalOpen] = useState(false);

  if (!intelligence) {
    return null;
  }

  const { cache_efficiency, waste_breakdown, optimization_guides, model_cache_benchmarks } =
    intelligence;

  const level = waste_breakdown.level;
  let levelBadge = { text: '캐시 최적 상태', className: 'badge badge--ok' };
  if (level === 'HIGH_WASTE') {
    levelBadge = {
      text: `컨텍스트 팽창 (${waste_breakdown.waste_percentage}% 낭비)`,
      className: 'badge badge--warn',
    };
  } else if (level === 'CAUTION') {
    levelBadge = {
      text: `컴팩션 권장 (${waste_breakdown.waste_percentage}% 낭비)`,
      className: 'badge badge--caution',
    };
  }

  const hitRate = cache_efficiency.hit_rate_percentage;
  const progressClass =
    hitRate >= 70
      ? 'cache-gauge--good'
      : hitRate >= 40
        ? 'cache-gauge--moderate'
        : 'cache-gauge--poor';

  return (
    <div className="token-waste-card" data-testid="token-waste-intelligence-card">
      <div className="token-waste-card__header">
        <div className="token-waste-card__title-wrap">
          <span className="token-waste-card__title">🧠 2026 프롬프트 캐싱 인텔리전스</span>
          <span className={levelBadge.className}>{levelBadge.text}</span>
        </div>
        <button
          type="button"
          className="token-waste-card__guide-btn"
          onClick={() => setGuideModalOpen(true)}
          data-testid="open-guide-modal-btn"
        >
          💡 캐싱 최적화 가이드 →
        </button>
      </div>

      <div className="token-waste-card__grid">
        {/* 1. 절감 시뮬레이션 */}
        <div className="token-waste-card__metric-box" data-testid="savings-simulation-box">
          <span className="token-waste-card__metric-label">예상 절감 잠재력 (90% 캐시 할인)</span>
          <div className="token-waste-card__metric-value-wrap">
            <span className="token-waste-card__savings-amount">
              {formatCost(cache_efficiency.potential_savings)}
            </span>
            <span className="token-waste-card__savings-pct">
              ({cache_efficiency.savings_percentage}% 절감)
            </span>
          </div>
          <p className="meta token-waste-card__metric-sub">
            최적화 시 예상 비용: {formatCost(cache_efficiency.optimized_cost)}{' '}
            <span className="token-waste-card__strikethrough">
              (현재 {formatCost(totalCost ?? cache_efficiency.current_estimated_cost)})
            </span>
          </p>
        </div>

        {/* 2. 캐시 적중률 게이지 */}
        <div className="token-waste-card__metric-box" data-testid="cache-hit-rate-box">
          <div className="token-waste-card__gauge-header">
            <span className="token-waste-card__metric-label">추정 캐시 적중률</span>
            <span className="token-waste-card__gauge-val">{hitRate}%</span>
          </div>
          <div className="cache-gauge-bar">
            <div
              className={`cache-gauge-bar__fill ${progressClass}`}
              style={{ width: `${Math.min(100, Math.max(5, hitRate))}%` }}
            />
          </div>
          <p className="meta token-waste-card__metric-sub">
            목표 적중률: 85%+ (권장 컨텍스트 상단 고정)
          </p>
        </div>

        {/* 3. 컨텍스트 팽창 & 낭비 토큰 */}
        <div className="token-waste-card__metric-box" data-testid="context-bloat-box">
          <span className="token-waste-card__metric-label">컨텍스트 팽창 누적 토큰</span>
          <div className="token-waste-card__metric-value-wrap">
            <span className="token-waste-card__bloat-amount">
              {formatTokenCount(waste_breakdown.total_wasted_tokens)}
            </span>
            <span className="meta">/ {formatTokenCount(totalTokens ?? '0')} 토큰</span>
          </div>
          <p className="meta token-waste-card__metric-sub">
            {waste_breakdown.high_waste_sessions_count > 0
              ? `초장기 세션 ${waste_breakdown.high_waste_sessions_count}건 감지 (세션 분리 필요)`
              : '세션 길이가 적정 수준으로 관리되고 있습니다.'}
          </p>
        </div>
      </div>

      {/* 2026 모델별 캐시 할인 칩 */}
      {model_cache_benchmarks && model_cache_benchmarks.length > 0 && (
        <div className="token-waste-card__benchmarks">
          <span className="meta token-waste-card__bench-label">2026 모델별 캐시 읽기 단가:</span>
          <div className="token-waste-card__chip-list">
            {model_cache_benchmarks.map((m) => (
              <span key={m.model} className="token-waste-card__chip">
                <strong>{m.model}</strong> {m.discount} ({m.readPrice})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 캐싱 최적화 가이드 모달 */}
      <Modal
        open={guideModalOpen}
        title="2026 프롬프트 캐싱(Prompt Caching) 최적화 가이드"
        onClose={() => setGuideModalOpen(false)}
      >
        <div className="cache-guide-modal-content">
          <p className="cache-guide-intro">
            2026년 기준 Claude Sonnet 5, Gemini 3.8/3.6 Flash, GPT-5.6 Terra 등 최신 에이전트 모델은
            <strong> 프롬프트 캐싱 적용 시 90%~97.5%의 파격적인 입력 비용 할인</strong>을
            제공합니다. 아래 가이드를 적용하여 토큰 비용을 극대화하여 절감하세요.
          </p>

          <div className="cache-guide-list">
            {optimization_guides.map((guide) => (
              <div key={guide.id} className="cache-guide-item">
                <div className="cache-guide-item__head">
                  <span className="cache-guide-item__title">{guide.title}</span>
                  <span
                    className={`badge ${guide.impact === 'HIGH' ? 'badge--warn' : 'badge--ok'}`}
                  >
                    중요도 {guide.impact}
                  </span>
                </div>
                <p className="cache-guide-item__desc">{guide.description}</p>
                {guide.action_hint && (
                  <div className="cache-guide-item__hint">
                    <span className="cache-guide-item__hint-icon">👉</span>
                    <span className="cache-guide-item__hint-text">{guide.action_hint}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="cache-guide-modal-footer">
            <Button variant="outline" onClick={() => setGuideModalOpen(false)}>
              닫기
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
