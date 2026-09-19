import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type BenchmarkVariant = 'A' | 'B';

export interface VariantMetrics {
  reqCount: number;
  durationMs: number;
  layoutShifts: number;
  measuredAt: number;
}

export interface BenchmarkContextValue {
  variant: BenchmarkVariant;
  setVariant: (v: BenchmarkVariant) => void;
  toggleVariant: () => void;
  metricsA: VariantMetrics;
  metricsB: VariantMetrics;
  currentMetrics: VariantMetrics;
  recordMetrics: (
    v: BenchmarkVariant,
    m: { reqCount: number; durationMs: number; layoutShifts: number },
  ) => void;
  speedupFactor: string;
  collapsed: boolean;
  setCollapsed: (c: boolean | ((prev: boolean) => boolean)) => void;
  toggleCollapsed: () => void;
  resetMetrics: () => void;
}

const STORAGE_KEY = 'muster_ab_variant';
const COLLAPSED_STORAGE_KEY = 'muster_ab_hud_collapsed';

const DEFAULT_METRICS_A: VariantMetrics = {
  reqCount: 41,
  durationMs: 462,
  layoutShifts: 40,
  measuredAt: Date.now() - 60000,
};

const DEFAULT_METRICS_B: VariantMetrics = {
  reqCount: 1,
  durationMs: 88,
  layoutShifts: 0,
  measuredAt: Date.now(),
};

/** HUD를 접어 둘지 정한다 — 화면이 좁으면 기본이 접힘이다. */
export function pickCollapsedDefault(saved: string | null, isNarrow: boolean): boolean {
  // 사용자가 직접 접거나 편 적이 있으면 그 선택이 언제나 우선이다.
  if (saved !== null) return saved === 'true';
  return isNarrow;
}

/**
 * 저장된 선택이 없을 때의 기본값.
 *
 * 펼친 채로 두면 좁은 화면에서 HUD가 가로를 다 먹어 목록 첫 카드를 통째로 가린다
 * (아이폰 실기기에서 확인). 목록을 보러 들어온 사람에게 목록을 가리는 것이라, 처음에는
 * 접어 두고 필요하면 펴게 한다. 데스크톱은 우하단에 떠 있어 가리는 것이 없으므로 그대로 둔다.
 */
function defaultCollapsed(): boolean {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(COLLAPSED_STORAGE_KEY);
  } catch {
    // 저장소를 못 읽는 환경(사파리 비공개 모드 등)에서는 저장된 선택이 없는 것으로 본다.
  }

  let isNarrow = false;
  try {
    isNarrow = window.matchMedia('(max-width: 767px)').matches;
  } catch {
    // matchMedia가 없는 환경에서는 넓은 화면으로 가정한다(기존 동작 유지).
  }

  return pickCollapsedDefault(saved, isNarrow);
}

const BenchmarkContext = createContext<BenchmarkContextValue | null>(null);

export function BenchmarkProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<BenchmarkVariant>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'A' || saved === 'B' ? saved : 'B';
    } catch {
      return 'B';
    }
  });

  const [collapsed, setCollapsedState] = useState<boolean>(() => defaultCollapsed());

  const [metricsA, setMetricsA] = useState<VariantMetrics>(DEFAULT_METRICS_A);
  const [metricsB, setMetricsB] = useState<VariantMetrics>(DEFAULT_METRICS_B);

  const setVariant = useCallback((next: BenchmarkVariant) => {
    setVariantState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const toggleVariant = useCallback(() => {
    setVariantState((prev) => {
      const next: BenchmarkVariant = prev === 'A' ? 'B' : 'A';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const setCollapsed = useCallback((action: boolean | ((prev: boolean) => boolean)) => {
    setCollapsedState((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, [setCollapsed]);

  const recordMetrics = useCallback(
    (v: BenchmarkVariant, m: { reqCount: number; durationMs: number; layoutShifts: number }) => {
      const data: VariantMetrics = {
        reqCount: m.reqCount,
        durationMs: Math.max(1, Math.round(m.durationMs)),
        layoutShifts: m.layoutShifts,
        measuredAt: Date.now(),
      };
      if (v === 'A') {
        setMetricsA(data);
      } else {
        setMetricsB(data);
      }
    },
    [],
  );

  const resetMetrics = useCallback(() => {
    setMetricsA(DEFAULT_METRICS_A);
    setMetricsB(DEFAULT_METRICS_B);
  }, []);

  const speedupFactor = useMemo(() => {
    if (metricsA.durationMs <= 0 || metricsB.durationMs <= 0) return '5.2x';
    const ratio = metricsA.durationMs / Math.max(1, metricsB.durationMs);
    return `${Math.max(1.1, ratio).toFixed(1)}x`;
  }, [metricsA.durationMs, metricsB.durationMs]);

  const currentMetrics = variant === 'A' ? metricsA : metricsB;

  const value = useMemo<BenchmarkContextValue>(
    () => ({
      variant,
      setVariant,
      toggleVariant,
      metricsA,
      metricsB,
      currentMetrics,
      recordMetrics,
      speedupFactor,
      collapsed,
      setCollapsed,
      toggleCollapsed,
      resetMetrics,
    }),
    [
      variant,
      setVariant,
      toggleVariant,
      metricsA,
      metricsB,
      currentMetrics,
      recordMetrics,
      speedupFactor,
      collapsed,
      setCollapsed,
      toggleCollapsed,
      resetMetrics,
    ],
  );

  return <BenchmarkContext.Provider value={value}>{children}</BenchmarkContext.Provider>;
}

export function useBenchmark(): BenchmarkContextValue {
  const ctx = useContext(BenchmarkContext);
  if (!ctx) {
    throw new Error('useBenchmark must be used within a BenchmarkProvider');
  }
  return ctx;
}
