import { formatCost, formatTokenCount } from '../lib/tokenIntelligence';
import './ModelUsageBreakdown.css';

export interface ModelUsageItem {
  model_name: string;
  display_name: string;
  provider: 'anthropic' | 'google' | 'openai' | 'deepseek' | 'other';
  tokens: string;
  cost: string;
  run_count: number;
  percentage: number;
}

export interface ModelUsageBreakdownProps {
  models?: ModelUsageItem[];
  totalTokens?: string;
  totalCost?: string;
}

const PROVIDER_INFO: Record<string, { label: string; className: string }> = {
  anthropic: { label: 'Anthropic', className: 'provider-badge--anthropic' },
  google: { label: 'Google', className: 'provider-badge--google' },
  openai: { label: 'OpenAI', className: 'provider-badge--openai' },
  deepseek: { label: 'DeepSeek', className: 'provider-badge--deepseek' },
  other: { label: 'Custom', className: 'provider-badge--other' },
};

export function ModelUsageBreakdown({
  models = [],
  totalTokens,
  totalCost,
}: ModelUsageBreakdownProps) {
  if (models.length === 0) {
    return (
      <div className="model-breakdown model-breakdown--empty" data-testid="model-breakdown-empty">
        <p className="meta">투입된 LLM 모델 실행 이력이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="model-breakdown" data-testid="model-breakdown">
      <div className="model-breakdown__header">
        <div className="model-breakdown__title-wrap">
          <span className="model-breakdown__title">모델별 토큰·비용 점유율</span>
          <span className="model-breakdown__count-badge">{models.length}개 모델</span>
        </div>
        {totalTokens && (
          <span className="meta model-breakdown__total-summary">
            합계 {formatTokenCount(totalTokens)} 토큰{' '}
            {totalCost && <span className="cost-text">({formatCost(totalCost)})</span>}
          </span>
        )}
      </div>

      <div className="model-breakdown__list">
        {models.map((m) => {
          const provider = PROVIDER_INFO[m.provider] || PROVIDER_INFO.other;
          return (
            <div
              key={m.model_name}
              className="model-breakdown-row"
              data-testid={`model-row-${m.model_name}`}
            >
              <div className="model-breakdown-row__top">
                <div className="model-breakdown-row__left">
                  <span className={`provider-badge ${provider.className}`}>{provider.label}</span>
                  <span className="model-breakdown-row__name">{m.display_name}</span>
                </div>
                <div className="model-breakdown-row__right">
                  <span className="model-breakdown-row__tokens">
                    <strong>{formatTokenCount(m.tokens)}</strong> 토큰
                  </span>
                  <span className="model-breakdown-row__cost cost-text">
                    ({formatCost(m.cost)})
                  </span>
                  <span className="meta model-breakdown-row__runs">{m.run_count}회 실행</span>
                  <span className="model-breakdown-row__pct">{m.percentage.toFixed(1)}%</span>
                </div>
              </div>

              {/* 점유율 프로그레스 바 */}
              <div
                className="model-breakdown-bar__track"
                role="progressbar"
                aria-valuenow={m.percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${m.display_name} 토큰 점유율`}
              >
                <div
                  className={`model-breakdown-bar__fill model-breakdown-bar__fill--${m.provider}`}
                  style={{ width: `${Math.min(Math.max(m.percentage, 0), 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
