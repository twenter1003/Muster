import { ApiException } from '../errors/api.exception';

export interface RetryOptions {
  maxRetries?: number; // 기본 3회 (총 4회 시도)
  initialDelayMs?: number; // 기본 1000ms (1초)
  backoffMultiplier?: number; // 기본 2
  jitter?: boolean; // 기본 true (±20% 지터)
  timeoutMs?: number; // 기본 30000ms (30초)
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  isRetryable?: (error: unknown) => boolean;
}

export class RetryableLlmError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'RetryableLlmError';
    this.status = status;
  }
}

/**
 * 재시도 대상인지 판정:
 * - RetryableLlmError
 * - 429 (Rate Limit / Quota)
 * - 500, 502, 503, 504 (Transient Server Error)
 * - 네트워크 에러 (FetchError, AbortError, Timeout, ECONNRESET, ETIMEDOUT 등)
 * 단, 400, 401, 403, 404 및 자격증명 관련 ApiException은 즉시 실패 (재시도 불가).
 */
export function defaultIsRetryable(error: unknown): boolean {
  if (error instanceof ApiException) {
    return false;
  }
  if (error instanceof RetryableLlmError) {
    return true;
  }
  const err = error as {
    status?: number;
    statusCode?: number;
    name?: string;
    message?: string;
    code?: string;
  };
  const status = err.status ?? err.statusCode;
  if (status !== undefined) {
    if (status === 400 || status === 401 || status === 403 || status === 404) {
      return false;
    }
    if (status === 429 || status >= 500) {
      return true;
    }
  }

  // 네트워크 / 타임아웃 / Abort 에러 확인
  const name = err.name?.toLowerCase() ?? '';
  const msg = err.message?.toLowerCase() ?? '';
  const code = err.code?.toLowerCase() ?? '';

  if (
    name.includes('abort') ||
    name.includes('timeout') ||
    msg.includes('abort') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    code.includes('econnreset') ||
    code.includes('etimedout')
  ) {
    return true;
  }

  return false;
}

export function calculateBackoff(
  attempt: number,
  initialDelayMs: number,
  multiplier: number,
  useJitter: boolean,
): number {
  const base = initialDelayMs * Math.pow(multiplier, attempt);
  if (!useJitter || base === 0) return base;
  // 0.8 ~ 1.2 범위 지터
  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.round(base * jitterFactor);
}

export async function executeWithRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs =
    options.initialDelayMs ?? (process.env.NODE_ENV === 'test' ? 0 : 1000);
  const backoffMultiplier = options.backoffMultiplier ?? 2;
  const useJitter = options.jitter ?? true;
  const timeoutMs = options.timeoutMs ?? 30000;
  const isRetryable = options.isRetryable ?? defaultIsRetryable;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`Timeout of ${timeoutMs}ms exceeded`)),
      timeoutMs,
    );

    try {
      const result = await fn(controller.signal);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;

      if (attempt === maxRetries || !isRetryable(err)) {
        throw err;
      }

      const delay = calculateBackoff(attempt, initialDelayMs, backoffMultiplier, useJitter);
      options.onRetry?.(attempt + 1, err, delay);

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
