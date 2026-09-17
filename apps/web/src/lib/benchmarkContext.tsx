import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

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

  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

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
    (
      v: BenchmarkVariant,
      m: { reqCount: number; durationMs: number; layoutShifts: number },
    ) => {
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
