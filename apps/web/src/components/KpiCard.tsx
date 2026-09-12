import type { ReactNode } from 'react';

interface KpiCardProps {
  label: string;
  /** 값은 이미 포맷된 문자열이다. 측정 불가면 EM_DASH를 넘긴다(0과 섞지 않는다). */
  value: string;
  hint?: ReactNode;
  /**
   * 사용자의 행동을 요구하는 카드인가. 이 카드만 테두리에 신호색을 받는다.
   * 규칙: 화면당 최대 1개. 카드가 서로를 볼 수 없어 타입으로는 셀 수 없으므로,
   * 화면을 만들 때 이 prop이 한 번만 true인지 직접 지켜야 한다.
   */
  requiresAction?: boolean;
}

/** KPI 카드 — 라벨 · 값 · 보조 (설계서 10). */
export function KpiCard({ label, value, hint, requiresAction = false }: KpiCardProps) {
  return (
    <div className={requiresAction ? 'kpi-card kpi-card--action' : 'kpi-card'}>
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value">{value}</span>
      {hint !== undefined && <span className="kpi-card__hint">{hint}</span>}
    </div>
  );
}
