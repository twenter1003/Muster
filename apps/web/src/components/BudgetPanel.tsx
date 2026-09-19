import { EM_DASH } from '../lib/domain';
import type { BudgetUsage } from './ProjectOverviewShared';

export function BudgetPanel({ budget }: { budget: BudgetUsage }) {
  const pct = budget.cost_usage_pct;
  const threshold = Number(budget.alert_threshold_pct);
  const over = pct !== null && Number.isFinite(threshold) && pct >= threshold;

  return (
    <>
      <p className="meta po-note">
        비용 ${budget.used_cost} / {budget.cost_limit === null ? EM_DASH : `$${budget.cost_limit}`}{' '}
        · 토큰 {budget.used_tokens} / {budget.token_limit === null ? EM_DASH : budget.token_limit} ·
        임계치 {budget.alert_threshold_pct}%
      </p>
      {/* 한도가 없으면 막대를 그리지 않는다 — 0%로 그리면 "안 썼다"로 읽힌다. */}
      {pct !== null && (
        <div
          className="po-meter"
          role="img"
          aria-label={`비용 사용률 ${pct.toFixed(0)}%${over ? ' — 임계치 초과' : ''}`}
        >
          <span
            className={over ? 'po-meter__fill po-meter__fill--signal' : 'po-meter__fill'}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      )}
      {over && <p className="meta po-note po-note--signal">임계치 초과 — 예산을 확인해야 한다.</p>}
    </>
  );
}
