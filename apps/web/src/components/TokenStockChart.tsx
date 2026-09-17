import { useState, useId, useMemo } from 'react';
import { formatCost, formatTokenCount } from '../lib/tokenIntelligence';
import { getAgentTheme, getAgentLabel } from '../lib/agentFilter';
import './TokenStockChart.css';

export type TokenGranularity = 'hour' | 'day' | 'month';

export interface TimeSeriesPoint {
  key: string;
  label: string;
  tokens: string;
  cost: string;
  agent_tokens?: Record<string, string>;
  agent_cost?: Record<string, string>;
}

export interface TokenStockChartProps {
  data?: TimeSeriesPoint[];
  agentSeries?: Record<string, TimeSeriesPoint[]>;
  availableAgents?: string[];
  granularity: TokenGranularity;
  onGranularityChange: (granularity: TokenGranularity) => void;
  isLoading?: boolean;
  height?: number;
  livePendingTokens?: number;
  livePendingCost?: string;
  isOverlay?: boolean;
  onOverlayToggle?: (isOverlay: boolean) => void;
}

const SVG_WIDTH = 600;
const DEFAULT_HEIGHT = 190;
const PADDING = { top: 20, right: 20, bottom: 28, left: 20 };

export function TokenStockChart({
  data = [],
  agentSeries,
  availableAgents,
  granularity,
  onGranularityChange,
  isLoading = false,
  height = DEFAULT_HEIGHT,
  livePendingTokens,
  livePendingCost,
  isOverlay,
  onOverlayToggle,
}: TokenStockChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [internalOverlay, setInternalOverlay] = useState(false);
  const [visibleAgents, setVisibleAgents] = useState<Set<string>>(() => new Set());
  const [showTotalLine, setShowTotalLine] = useState(true);
  const gradId = useId();

  const effectiveOverlay = isOverlay !== undefined ? isOverlay : internalOverlay;
  const handleToggleOverlay = () => {
    const nextVal = !effectiveOverlay;
    setInternalOverlay(nextVal);
    onOverlayToggle?.(nextVal);
  };

  // 비교 가능한 에이전트 목록 산출
  const activeAgents = useMemo(() => {
    if (availableAgents && availableAgents.length > 0) {
      return availableAgents;
    }
    if (agentSeries) {
      return Object.keys(agentSeries);
    }
    return [];
  }, [availableAgents, agentSeries]);

  const isAgentVisible = (agent: string) => {
    if (visibleAgents.size === 0) return true;
    return visibleAgents.has(agent);
  };

  const toggleAgentVisibility = (agent: string) => {
    setVisibleAgents((prev) => {
      const next = new Set(prev.size === 0 ? activeAgents : prev);
      if (next.has(agent)) {
        if (next.size > 1 || showTotalLine) {
          next.delete(agent);
        }
      } else {
        next.add(agent);
      }
      return next;
    });
  };

  // 토큰 수치 배열 및 최대값 계산
  const values = useMemo(() => data.map((d) => Number(d.tokens) || 0), [data]);
  const maxVal = useMemo(() => {
    let max = Math.max(...values, 0);
    if (effectiveOverlay && agentSeries) {
      for (const agent of activeAgents) {
        const s = agentSeries[agent];
        if (s) {
          for (const pt of s) {
            const v = Number(pt.tokens) || 0;
            if (v > max) max = v;
          }
        }
      }
    }
    return max === 0 ? 1000 : max;
  }, [values, effectiveOverlay, agentSeries, activeAgents]);

  // 좌표 계산 (W: 600, H: height)
  const chartW = SVG_WIDTH - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  // 전체(Total) 좌표 계산
  const points = useMemo(() => {
    if (data.length === 0) return [];
    const step = data.length > 1 ? chartW / (data.length - 1) : 0;
    return data.map((d, i) => {
      const val = values[i];
      const x = PADDING.left + (data.length === 1 ? chartW / 2 : i * step);
      const ratio = val / maxVal;
      const y = PADDING.top + chartH * (1 - ratio);
      return { x, y, val, d, i };
    });
  }, [data, values, maxVal, chartW, chartH]);

  // 에이전트별 좌표 계산
  const agentPointsMap = useMemo(() => {
    if (!effectiveOverlay || !agentSeries || data.length === 0) return {};
    const step = data.length > 1 ? chartW / (data.length - 1) : 0;
    const result: Record<
      string,
      Array<{ x: number; y: number; val: number; d: TimeSeriesPoint; i: number }>
    > = {};

    for (const agent of activeAgents) {
      const series = agentSeries[agent] || [];
      result[agent] = series.map((d, i) => {
        const val = Number(d.tokens) || 0;
        const x = PADDING.left + (data.length === 1 ? chartW / 2 : i * step);
        const ratio = val / maxVal;
        const y = PADDING.top + chartH * (1 - ratio);
        return { x, y, val, d, i };
      });
    }
    return result;
  }, [effectiveOverlay, agentSeries, data, activeAgents, chartW, chartH, maxVal]);

  // 에이전트별 Polyline 좌표 문자열
  const agentPolylines = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [agent, pts] of Object.entries(agentPointsMap)) {
      if (pts.length > 0) {
        result[agent] = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      }
    }
    return result;
  }, [agentPointsMap]);

  // SVG Area 및 Line path 생성 (전체)
  const { polylinePoints, polygonPoints } = useMemo(() => {
    if (points.length === 0) return { polylinePoints: '', polygonPoints: '' };
    const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const firstX = points[0].x.toFixed(1);
    const lastX = points[points.length - 1].x.toFixed(1);
    const baseY = (PADDING.top + chartH).toFixed(1);
    const polygon = `${firstX},${baseY} ${polyline} ${lastX},${baseY}`;
    return { polylinePoints: polyline, polygonPoints: polygon };
  }, [points, chartH]);

  // 활성 포인트 (호버된 것 또는 마지막 데이터)
  const activePoint = useMemo(() => {
    if (points.length === 0) return null;
    if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < points.length) {
      return points[hoveredIdx];
    }
    return points[points.length - 1];
  }, [points, hoveredIdx]);

  // 마우스/터치 위치로 가장 가까운 인덱스 탐색
  const handlePointerMove = (clientX: number, target: SVGSVGElement) => {
    if (points.length === 0) return;
    const rect = target.getBoundingClientRect();
    const relativeX = ((clientX - rect.left) / rect.width) * SVG_WIDTH;

    let closestIdx = 0;
    let minDiff = Infinity;
    points.forEach((p, idx) => {
      const diff = Math.abs(p.x - relativeX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    setHoveredIdx(closestIdx);
  };

  // X축 라벨 인덱스 선별 (최대 5~7개로 축약하여 모바일 겹침 방지)
  const visibleLabelIndices = useMemo(() => {
    const len = data.length;
    if (len <= 7) return new Set(data.map((_, i) => i));
    const step = Math.ceil(len / 6);
    const indices = new Set<number>();
    for (let i = 0; i < len; i += step) {
      indices.add(i);
    }
    indices.add(len - 1);
    return indices;
  }, [data]);

  return (
    <div className="token-stock-chart" data-testid="token-stock-chart">
      {/* 1. 주식 창 스타일 세그먼트 전환 및 상단 HUD */}
      <div className="token-stock-chart__header">
        <div className="token-stock-chart__controls">
          <div
            className="token-stock-chart__switcher"
            role="group"
            aria-label="차트 시계열 단위 선택"
          >
            <button
              type="button"
              className={`stock-tab ${granularity === 'hour' ? 'stock-tab--active' : ''}`}
              aria-pressed={granularity === 'hour'}
              onClick={() => onGranularityChange('hour')}
            >
              시간별
            </button>
            <button
              type="button"
              className={`stock-tab ${granularity === 'day' ? 'stock-tab--active' : ''}`}
              aria-pressed={granularity === 'day'}
              onClick={() => onGranularityChange('day')}
            >
              일간
            </button>
            <button
              type="button"
              className={`stock-tab ${granularity === 'month' ? 'stock-tab--active' : ''}`}
              aria-pressed={granularity === 'month'}
              onClick={() => onGranularityChange('month')}
            >
              월간
            </button>
          </div>

          {activeAgents.length > 0 && (
            <button
              type="button"
              className={`stock-tab stock-tab--compare ${
                effectiveOverlay ? 'stock-tab--active-compare' : ''
              }`}
              aria-pressed={effectiveOverlay}
              onClick={handleToggleOverlay}
              data-testid="overlay-toggle-button"
            >
              📊 {effectiveOverlay ? '단일 뷰로 전환' : '에이전트 비교'}
            </button>
          )}
        </div>

        {activePoint && (
          <div className="token-stock-chart__hud" data-testid="chart-hud">
            <span className="stock-hud__date">{activePoint.d.key}</span>
            <span className="stock-hud__tokens">
              <strong>{formatTokenCount(activePoint.d.tokens)}</strong> 토큰
            </span>
            <span className="stock-hud__cost cost-text">({formatCost(activePoint.d.cost)})</span>
            {hoveredIdx === null && <span className="stock-hud__tag">최신</span>}
            {livePendingTokens !== undefined && livePendingTokens > 0 && (
              <span
                className="stock-hud__live-tick"
                title="진행 중인 세션 실시간 하트비트 스트리밍 토큰"
              >
                ⚡ 라이브 +{formatTokenCount(livePendingTokens)} (
                {formatCost(livePendingCost || '0')})
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. 에이전트 비교 오버레이 시 활성화되는 인터랙티브 범례(Legend) 바 */}
      {effectiveOverlay && activeAgents.length > 0 && (
        <div
          className="token-stock-chart__legend"
          role="toolbar"
          aria-label="에이전트별 선 그래프 토글"
          data-testid="chart-legend"
        >
          <button
            type="button"
            className={`legend-chip ${showTotalLine ? 'legend-chip--active' : 'legend-chip--inactive'}`}
            aria-pressed={showTotalLine}
            onClick={() => setShowTotalLine(!showTotalLine)}
          >
            <span className="legend-chip__dot" style={{ backgroundColor: '#059669' }} />
            <span className="legend-chip__label">전체 합계</span>
          </button>

          {activeAgents.map((agent) => {
            const theme = getAgentTheme(agent);
            const visible = isAgentVisible(agent);
            return (
              <button
                key={`legend-${agent}`}
                type="button"
                className={`legend-chip ${visible ? 'legend-chip--active' : 'legend-chip--inactive'}`}
                aria-pressed={visible}
                onClick={() => toggleAgentVisibility(agent)}
                style={
                  visible
                    ? {
                        borderColor: theme.borderColor,
                        backgroundColor: theme.badgeBg,
                        color: theme.badgeText,
                      }
                    : undefined
                }
              >
                <span className="legend-chip__dot" style={{ backgroundColor: theme.color }} />
                <span className="legend-chip__label">{theme.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 3. 고반응형 SVG Area/Line 차트 */}
      <div className="token-stock-chart__canvas-wrap">
        {isLoading && (
          <div className="token-stock-chart__overlay">
            <span className="meta">차트 갱신 중…</span>
          </div>
        )}

        {data.length === 0 ? (
          <div className="token-stock-chart__empty" style={{ height }}>
            <p className="meta">집계 데이터가 없습니다.</p>
          </div>
        ) : (
          <>
            <svg
              className="token-stock-chart__svg"
              viewBox={`0 0 ${SVG_WIDTH} ${height}`}
              preserveAspectRatio="none"
              onMouseMove={(e) => handlePointerMove(e.clientX, e.currentTarget)}
              onMouseLeave={() => setHoveredIdx(null)}
              onTouchMove={(e) => {
                if (e.touches[0]) handlePointerMove(e.touches[0].clientX, e.currentTarget);
              }}
              onTouchEnd={() => setHoveredIdx(null)}
            >
              <defs>
                <linearGradient id={`areaGrad-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-cost, #059669)" stopOpacity="0.32" />
                  <stop offset="70%" stopColor="var(--color-cost, #059669)" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="var(--color-cost, #059669)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* 수평 보조 격자선 (Top, Middle, Bottom) */}
              <line
                x1={PADDING.left}
                y1={PADDING.top}
                x2={SVG_WIDTH - PADDING.right}
                y2={PADDING.top}
                className="chart-gridline"
              />
              <line
                x1={PADDING.left}
                y1={PADDING.top + chartH / 2}
                x2={SVG_WIDTH - PADDING.right}
                y2={PADDING.top + chartH / 2}
                className="chart-gridline"
              />
              <line
                x1={PADDING.left}
                y1={PADDING.top + chartH}
                x2={SVG_WIDTH - PADDING.right}
                y2={PADDING.top + chartH}
                className="chart-gridline chart-gridline--base"
              />

              {/* 하단 볼륨 바 (하단 20% 영역에 거래량 스타일 표현) */}
              {points.map((p) => {
                const barMaxH = chartH * 0.22;
                const barH = p.val > 0 ? Math.max((p.val / maxVal) * barMaxH, 2) : 0;
                const barW = Math.max(chartW / (points.length * 2.2), 2);
                const isHovered = hoveredIdx === p.i;
                return (
                  <rect
                    key={`bar-${p.i}`}
                    x={p.x - barW / 2}
                    y={PADDING.top + chartH - barH}
                    width={barW}
                    height={barH}
                    rx="1"
                    className={`stock-bar ${isHovered ? 'stock-bar--active' : ''}`}
                  />
                );
              })}

              {/* Area 그라데이션 채우기 (전체 합계) */}
              {showTotalLine && (!effectiveOverlay || visibleAgents.size === 0) && (
                <polygon
                  points={polygonPoints}
                  fill={`url(#areaGrad-${gradId})`}
                  className="chart-area"
                />
              )}

              {/* 메인 스트로크 폴리라인 (전체 합계) */}
              {showTotalLine && (
                <polyline
                  points={polylinePoints}
                  fill="none"
                  className={`chart-polyline ${effectiveOverlay ? 'chart-polyline--total-dim' : ''}`}
                />
              )}

              {/* 에이전트별 비교 멀티 폴리라인 */}
              {effectiveOverlay &&
                activeAgents.map((agent) => {
                  if (!isAgentVisible(agent)) return null;
                  const theme = getAgentTheme(agent);
                  const polyline = agentPolylines[agent];
                  if (!polyline) return null;
                  return (
                    <polyline
                      key={`line-${agent}`}
                      points={polyline}
                      fill="none"
                      stroke={theme.color}
                      className="chart-polyline chart-polyline--agent"
                      data-agent={agent}
                    />
                  );
                })}

              {/* 크로스헤어 및 하이라이트 도트 */}
              {activePoint && (
                <g className="chart-crosshair">
                  <line
                    x1={activePoint.x}
                    y1={PADDING.top}
                    x2={activePoint.x}
                    y2={PADDING.top + chartH}
                    className="chart-crosshair__line"
                  />

                  {/* 전체 합계 도트 */}
                  {showTotalLine && (
                    <circle
                      cx={activePoint.x}
                      cy={activePoint.y}
                      r="4.5"
                      className="chart-crosshair__dot"
                    />
                  )}

                  {/* 에이전트별 도트 */}
                  {effectiveOverlay &&
                    activeAgents.map((agent) => {
                      if (!isAgentVisible(agent)) return null;
                      const pts = agentPointsMap[agent];
                      if (!pts || !pts[activePoint.i]) return null;
                      const pt = pts[activePoint.i];
                      const theme = getAgentTheme(agent);
                      return (
                        <circle
                          key={`dot-${agent}`}
                          cx={pt.x}
                          cy={pt.y}
                          r="3.5"
                          fill={theme.color}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                          className="chart-crosshair__agent-dot"
                        />
                      );
                    })}
                </g>
              )}

              {/* X축 시간/날짜 라벨 */}
              {points.map((p) => {
                if (!visibleLabelIndices.has(p.i)) return null;
                const isHovered = hoveredIdx === p.i;
                return (
                  <text
                    key={`label-${p.i}`}
                    x={p.x}
                    y={height - 8}
                    textAnchor="middle"
                    className={`chart-axis-label ${isHovered ? 'chart-axis-label--active' : ''}`}
                  >
                    {p.d.label}
                  </text>
                );
              })}
            </svg>

            {/* 마우스 호버 시 포인트 위치에 부유하는 인터랙티브 플로팅 툴팁 */}
            {hoveredIdx !== null && activePoint && (
              <div
                className={`token-stock-chart__tooltip ${
                  activePoint.x > SVG_WIDTH * 0.52
                    ? 'token-stock-chart__tooltip--left'
                    : 'token-stock-chart__tooltip--right'
                }`}
                style={{
                  left: `${(activePoint.x / SVG_WIDTH) * 100}%`,
                  top: `${Math.min(Math.max((activePoint.y / height) * 100, 16), 74)}%`,
                }}
                data-testid="chart-floating-tooltip"
              >
                <div className="stock-tooltip__header">
                  <span className="stock-tooltip__date">{activePoint.d.key}</span>
                  {hoveredIdx === points.length - 1 && (
                    <span className="stock-tooltip__badge">최신</span>
                  )}
                </div>

                <div className="stock-tooltip__body">
                  <div className="stock-tooltip__row stock-tooltip__row--total">
                    <span className="stock-tooltip__label">전체 토큰</span>
                    <span className="stock-tooltip__value">
                      <strong>{formatTokenCount(activePoint.d.tokens)}</strong>
                      <span className="stock-tooltip__cost">
                        ({formatCost(activePoint.d.cost)})
                      </span>
                    </span>
                  </div>

                  {effectiveOverlay && activeAgents.length > 0 && (
                    <div className="stock-tooltip__agents">
                      <div className="stock-tooltip__divider" />
                      {activeAgents.map((agent) => {
                        if (!isAgentVisible(agent)) return null;
                        const theme = getAgentTheme(agent);
                        const series = agentSeries ? agentSeries[agent] : undefined;
                        const pt =
                          series && series[activePoint.i] ? series[activePoint.i] : undefined;
                        const tokenVal = pt ? pt.tokens : '0';
                        const costVal = pt ? pt.cost : '0.0000';
                        const totalNum = Number(activePoint.d.tokens) || 0;
                        const agentNum = Number(tokenVal) || 0;
                        const pct = totalNum > 0 ? Math.round((agentNum / totalNum) * 100) : 0;

                        return (
                          <div
                            key={`tooltip-agent-${agent}`}
                            className="stock-tooltip__row stock-tooltip__row--agent"
                          >
                            <span className="stock-tooltip__agent-meta">
                              <span
                                className="stock-tooltip__dot"
                                style={{ backgroundColor: theme.color }}
                              />
                              <span className="stock-tooltip__agent-name">
                                {getAgentLabel(agent)}
                              </span>
                            </span>
                            <span className="stock-tooltip__agent-values">
                              <span className="stock-tooltip__agent-tokens">
                                {formatTokenCount(tokenVal)}
                              </span>
                              <span className="stock-tooltip__agent-cost">
                                ({formatCost(costVal)})
                              </span>
                              <span className="stock-tooltip__agent-pct">{pct}%</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {livePendingTokens !== undefined &&
                    livePendingTokens > 0 &&
                    hoveredIdx === points.length - 1 && (
                      <div className="stock-tooltip__live">
                        ⚡ 라이브 +{formatTokenCount(livePendingTokens)} (
                        {formatCost(livePendingCost || '0')})
                      </div>
                    )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 4. 오버레이 모드일 때 크로스헤어 또는 최신 시점의 에이전트별 토큰 분할 HUD 요약 */}
      {effectiveOverlay && activeAgents.length > 0 && activePoint && (
        <div className="token-stock-chart__subhud" data-testid="chart-subhud">
          {activeAgents.map((agent) => {
            const theme = getAgentTheme(agent);
            const series = agentSeries ? agentSeries[agent] : undefined;
            const pt = series && series[activePoint.i] ? series[activePoint.i] : undefined;
            const tokenVal = pt ? pt.tokens : '0';
            const costVal = pt ? pt.cost : '0.0000';
            const isVisible = isAgentVisible(agent);

            return (
              <span
                key={`subhud-${agent}`}
                className={`stock-subhud__chip ${
                  isVisible ? 'stock-subhud__chip--active' : 'stock-subhud__chip--dim'
                }`}
                style={
                  isVisible
                    ? {
                        backgroundColor: theme.badgeBg,
                        color: theme.badgeText,
                        borderColor: theme.borderColor,
                      }
                    : undefined
                }
              >
                <span className="stock-subhud__dot" style={{ backgroundColor: theme.color }} />
                <span className="stock-subhud__name">{getAgentLabel(agent)}</span>
                <strong>{formatTokenCount(tokenVal)}</strong>
                <span className="stock-subhud__cost">({formatCost(costVal)})</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
