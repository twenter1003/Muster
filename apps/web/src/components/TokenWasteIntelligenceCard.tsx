import { useState } from 'react';
import {
  formatCost,
  formatTokenCount,
  getCacheBadge,
  type TokenWasteIntelligence,
} from '../lib/tokenIntelligence';
import { downloadWasteReport } from '../lib/exportUtils';
import { Modal } from './Modal';
import { Button } from './Button';
import './TokenWasteIntelligenceCard.css';

export interface TokenWasteIntelligenceCardProps {
  projectId?: string;
  intelligence?: TokenWasteIntelligence | null;
  totalCost?: string;
  totalTokens?: string;
  /** 이상치 세션 칩을 클릭했을 때 해당 세션 상세를 열기 위한 콜백. */
  onJumpToSession?: (sessionId: string) => void;
}

export function TokenWasteIntelligenceCard({
  projectId,
  intelligence,
  totalCost,
  totalTokens,
  onJumpToSession,
}: TokenWasteIntelligenceCardProps) {
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<'csv' | 'json' | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleExport = async (format: 'csv' | 'json') => {
    if (!projectId || downloadingFormat) return;
    setDownloadingFormat(format);
    setExportNotice(null);
    try {
      const res = await downloadWasteReport(projectId, format);
      if (res.success) {
        setExportNotice(`✅ ${format.toUpperCase()} 리포트 다운로드 완료 (${res.filename})`);
        setTimeout(() => setExportNotice(null), 4000);
      } else {
        setExportNotice(`❌ 다운로드 실패: ${res.error}`);
        setTimeout(() => setExportNotice(null), 4000);
      }
    } finally {
      setDownloadingFormat(null);
    }
  };

  if (!intelligence) {
    return null;
  }

  const { cache_efficiency, cost_distribution, optimization_guides, model_cache_benchmarks } =
    intelligence;

  const hitRate = cache_efficiency.hit_rate_percentage;
  const headerBadge = getCacheBadge(hitRate);
  const hasCacheData = hitRate !== null;
  const gaugeValue = hitRate ?? 0;
  const progressClass = !hasCacheData
    ? 'cache-gauge--poor'
    : hitRate >= 70
      ? 'cache-gauge--good'
      : hitRate >= 40
        ? 'cache-gauge--moderate'
        : 'cache-gauge--poor';

  return (
    <div className="token-waste-card" data-testid="token-waste-intelligence-card">
      <div className="token-waste-card__header">
        <div className="token-waste-card__title-wrap">
          <span className="token-waste-card__title">🧠 캐싱 인텔리전스 (실측)</span>
          <span className={headerBadge.className}>{headerBadge.text}</span>
        </div>
        <div className="token-waste-card__actions">
          {projectId && (
            <div className="token-waste-card__export-group" data-testid="export-actions-group">
              <button
                type="button"
                className="token-waste-card__export-btn"
                onClick={() => handleExport('csv')}
                disabled={downloadingFormat !== null}
                data-testid="export-csv-btn"
                title="CSV 형식으로 캐시 효율 데이터 다운로드"
              >
                {downloadingFormat === 'csv' ? '⏳ 생성 중...' : '📥 CSV 리포트'}
              </button>
              <button
                type="button"
                className="token-waste-card__export-btn"
                onClick={() => handleExport('json')}
                disabled={downloadingFormat !== null}
                data-testid="export-json-btn"
                title="JSON 형식으로 캐시 효율 데이터 다운로드"
              >
                {downloadingFormat === 'json' ? '⏳ 생성 중...' : '📥 JSON'}
              </button>
            </div>
          )}
          <button
            type="button"
            className="token-waste-card__guide-btn"
            onClick={() => setGuideModalOpen(true)}
            data-testid="open-guide-modal-btn"
          >
            💡 캐싱 최적화 가이드 →
          </button>
        </div>
      </div>

      {exportNotice && (
        <div className="token-waste-card__notice-banner" data-testid="export-notice-banner">
          <span>{exportNotice}</span>
          <button
            type="button"
            className="meta"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setExportNotice(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="token-waste-card__grid">
        {/* 1. 캐싱으로 아낀 금액 (실측) */}
        <div className="token-waste-card__metric-box" data-testid="savings-simulation-box">
          <span className="token-waste-card__metric-label">캐싱으로 아낀 금액 (실측)</span>
          <div className="token-waste-card__metric-value-wrap">
            <span className="token-waste-card__savings-amount">
              {formatCost(cache_efficiency.savings_usd)}
            </span>
          </div>
          <p className="meta token-waste-card__metric-sub">
            {cache_efficiency.sessions_with_breakdown > 0
              ? `캐시 읽기 ${formatTokenCount(cache_efficiency.cache_read_tokens)} / 전체 ${formatTokenCount(totalTokens ?? '0')} 토큰 · 캐시 읽기가 정규 입력가보다 쌀 때만 절감이 생긴다`
              : `내역 있는 세션 ${cache_efficiency.sessions_with_breakdown}건, 없는 세션 ${cache_efficiency.sessions_without_breakdown}건 — 계산할 데이터가 없다`}
          </p>
        </div>

        {/* 2. 캐시 적중률 게이지 (실측) */}
        <div className="token-waste-card__metric-box" data-testid="cache-hit-rate-box">
          <div className="token-waste-card__gauge-header">
            <span className="token-waste-card__metric-label">캐시 적중률 (실측)</span>
            <span className="token-waste-card__gauge-val">
              {hasCacheData ? `${hitRate}%` : '모름'}
            </span>
          </div>
          <div className="cache-gauge-bar">
            <div
              className={`cache-gauge-bar__fill ${progressClass}`}
              style={{ width: `${hasCacheData ? Math.min(100, Math.max(5, gaugeValue)) : 0}%` }}
            />
          </div>
          <p className="meta token-waste-card__metric-sub">
            {hasCacheData
              ? `= 캐시 읽기 / (입력 + 캐시 읽기 + 캐시 쓰기)`
              : '토큰 내역이 있는 실행이 없어 계산할 수 없다.'}
          </p>
        </div>

        {/* 3. 세션 비용 분포 */}
        <div className="token-waste-card__metric-box" data-testid="cost-distribution-box">
          <span className="token-waste-card__metric-label">세션 비용 분포</span>
          <div className="token-waste-card__metric-value-wrap">
            <span className="token-waste-card__bloat-amount">
              중앙값 {formatCost(cost_distribution.median_cost_usd)}
            </span>
          </div>
          <p className="meta token-waste-card__metric-sub">
            p99 {formatCost(cost_distribution.p99_cost_usd)} · 표본 {cost_distribution.sample_size}
            건{totalCost ? ` · 총 ${formatCost(totalCost)}` : ''}
          </p>
          {cost_distribution.outliers.length > 0 && (
            <div className="token-waste-card__chip-list" style={{ marginTop: 6 }}>
              {cost_distribution.outliers.slice(0, 4).map((o) => (
                <button
                  key={o.session_id}
                  type="button"
                  className="token-waste-card__chip"
                  style={{ cursor: onJumpToSession ? 'pointer' : 'default', border: 'none' }}
                  onClick={() => onJumpToSession?.(o.session_id)}
                  data-testid={`cost-outlier-${o.session_id}`}
                  title="클릭하여 해당 세션으로 이동"
                >
                  <strong>{formatCost(o.cost_usd)}</strong> (중앙값의 {o.multiple_of_median}배)
                </button>
              ))}
            </div>
          )}
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
        title="프롬프트 캐싱(Prompt Caching) 최적화 가이드"
        onClose={() => setGuideModalOpen(false)}
      >
        <div className="cache-guide-modal-content">
          <p className="cache-guide-intro">
            2026년 기준 Claude Sonnet 5, Gemini 3.8/3.6 Flash, GPT-5.6 Terra 등 최신 에이전트 모델은
            <strong> 프롬프트 캐싱 적용 시 90%~97.5%의 파격적인 입력 비용 할인</strong>을
            제공합니다. 아래는 일반적인 캐싱 실천 가이드입니다(이 프로젝트만의 진단이 아니라 공통
            참고 정보).
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
