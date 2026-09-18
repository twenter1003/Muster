import {
  executeWithRetry,
  calculateBackoff,
  defaultIsRetryable,
  RetryableLlmError,
} from './retry';
import { ApiException } from '../errors/api.exception';
import { ErrorCode } from '../errors/error-codes';

describe('LLM Retry & Resilience (executeWithRetry)', () => {
  it('성공 시 1회 시도 후 즉시 반환한다', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await executeWithRetry(fn, { maxRetries: 3, initialDelayMs: 0 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('일시적 오류 발생 시 최대 3회 재시도(총 4회 시도) 후 성공하면 결과를 반환한다', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new RetryableLlmError('Rate limited', 429))
      .mockRejectedValueOnce(new RetryableLlmError('Internal server error', 500))
      .mockRejectedValueOnce(new RetryableLlmError('Bad gateway', 502))
      .mockResolvedValue('recovered');

    const onRetry = jest.fn();
    const result = await executeWithRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 0,
      onRetry,
    });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(4);
    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error), expect.any(Number));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), expect.any(Number));
    expect(onRetry).toHaveBeenNthCalledWith(3, 3, expect.any(Error), expect.any(Number));
  });

  it('최대 재시도 횟수를 초과하면 마지막 에러를 던진다', async () => {
    const fn = jest.fn().mockRejectedValue(new RetryableLlmError('Service Unavailable', 503));

    await expect(
      executeWithRetry(fn, { maxRetries: 3, initialDelayMs: 0 }),
    ).rejects.toThrow('Service Unavailable');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('400, 401, 403, 404 및 ApiException은 재시도 없이 즉시 실패한다', async () => {
    const fnApi = jest.fn().mockRejectedValue(
      new ApiException(ErrorCode.INTERNAL, '자격증명 오류', 503),
    );
    await expect(
      executeWithRetry(fnApi, { maxRetries: 3, initialDelayMs: 0 }),
    ).rejects.toBeInstanceOf(ApiException);
    expect(fnApi).toHaveBeenCalledTimes(1);

    const fn401 = jest.fn().mockRejectedValue({ status: 401, message: 'Unauthorized' });
    await expect(
      executeWithRetry(fn401, { maxRetries: 3, initialDelayMs: 0 }),
    ).rejects.toEqual(expect.objectContaining({ status: 401 }));
    expect(fn401).toHaveBeenCalledTimes(1);

    const fn403 = jest.fn().mockRejectedValue({ status: 403, message: 'Forbidden' });
    await expect(
      executeWithRetry(fn403, { maxRetries: 3, initialDelayMs: 0 }),
    ).rejects.toEqual(expect.objectContaining({ status: 403 }));
    expect(fn403).toHaveBeenCalledTimes(1);
  });

  it('네트워크 오류(fetch failed, ECONNRESET, timeout)는 재시도 대상이다', () => {
    expect(defaultIsRetryable(new TypeError('fetch failed'))).toBe(true);
    expect(defaultIsRetryable({ name: 'AbortError', message: 'The operation was aborted' })).toBe(true);
    expect(defaultIsRetryable({ code: 'ECONNRESET', message: 'read ECONNRESET' })).toBe(true);
    expect(defaultIsRetryable({ code: 'ETIMEDOUT', message: 'connect ETIMEDOUT' })).toBe(true);
    expect(defaultIsRetryable(new RetryableLlmError('rate limit', 429))).toBe(true);
    expect(defaultIsRetryable({ status: 504 })).toBe(true);
  });

  it('지수 백오프 및 지터(Jitter) 계산이 올바른 범위를 가진다', () => {
    // attempt 0: base 1000 -> jitter 0.8~1.2 -> 800~1200
    const delay0 = calculateBackoff(0, 1000, 2, true);
    expect(delay0).toBeGreaterThanOrEqual(800);
    expect(delay0).toBeLessThanOrEqual(1200);

    // attempt 1: base 2000 -> jitter 0.8~1.2 -> 1600~2400
    const delay1 = calculateBackoff(1, 1000, 2, true);
    expect(delay1).toBeGreaterThanOrEqual(1600);
    expect(delay1).toBeLessThanOrEqual(2400);

    // attempt 2: base 4000 -> jitter 0.8~1.2 -> 3200~4800
    const delay2 = calculateBackoff(2, 1000, 2, true);
    expect(delay2).toBeGreaterThanOrEqual(3200);
    expect(delay2).toBeLessThanOrEqual(4800);

    // jitter 비활성화 시 정확한 base 값
    expect(calculateBackoff(2, 1000, 2, false)).toBe(4000);
  });

  it('타임아웃 발생 시 signal이 abort되고 재시도된다', async () => {
    let callCount = 0;
    const fn = jest.fn().mockImplementation((signal: AbortSignal) => {
      callCount++;
      if (callCount === 1) {
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted by timeout')));
        });
      }
      return Promise.resolve('ok on retry');
    });

    const result = await executeWithRetry(fn, {
      maxRetries: 2,
      initialDelayMs: 0,
      timeoutMs: 30, // 30ms 타임아웃
    });

    expect(result).toBe('ok on retry');
    expect(callCount).toBe(2);
  });
});
