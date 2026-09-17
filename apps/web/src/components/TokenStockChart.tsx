import { useState, useId, useMemo } from 'react';
import { formatCost, formatTokenCount } from '../lib/tokenIntelligence';
import './TokenStockChart.css';

export type TokenGranularity = 'hour' | 'day' | 'month';

export interface TimeSeriesPoint {
  key: string;
  label: string;
  tokens: string;
  cost: string;
}

export interface TokenStockChartProps {
  data?: TimeSeriesPoint[];
  granularity: TokenGranularity;
  onGranularityChange: (granularity: TokenGranularity) => void;
  isLoading?: boolean;
  height?: number;
}

const SVG_WIDTH = 600;
const DEFAULT_HEIGHT = 190;
const PADDING = { top: 20, right: 20, bottom: 28, left: 20 };

export function TokenStockChart({
  data = [],
  granularity,
  onGranularityChange,
  isLoading = false,
  height = DEFAULT_HEIGHT,
}: TokenStockChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const gradId = useId();

  // 토큰 수치 배열 및 최대값 계산
  const values = useMemo(() => data.map((d) => Number(d.tokens) || 0), [data]);
  const maxVal = useMemo(() => {
    const rawMax = Math.max(...values, 0);
    return rawMax === 0 ? 1000 : rawMax;
  }, [values]);

  // 좌표 계산 (W: 600, H: height)
  const chartW = SVG_WIDTH - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

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

  // SVG Area 및 Line path 생성
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

        {activePoint && (
          <div className="token-stock-chart__hud" data-testid="chart-hud">
            <span className="stock-hud__date">{activePoint.d.key}</span>
            <span className="stock-hud__tokens">
              <strong>{formatTokenCount(activePoint.d.tokens)}</strong> 토큰
            </span>
            <span className="stock-hud__cost cost-text">({formatCost(activePoint.d.cost)})</span>
            {hoveredIdx === null && <span className="stock-hud__tag">최신</span>}
          </div>
        )}
      </div>

      {/* 2. 고반응형 SVG Area/Line 차트 */}
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

            {/* Area 그라데이션 채우기 */}
            <polygon
              points={polygonPoints}
              fill={`url(#areaGrad-${gradId})`}
              className="chart-area"
            />

            {/* 메인 스트로크 폴리라인 */}
            <polyline points={polylinePoints} fill="none" className="chart-polyline" />

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
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="4.5"
                  className="chart-crosshair__dot"
                />
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
        )}
      </div>
    </div>
  );
}
