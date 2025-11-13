import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  withRetry,
  isRetryableError,
  CircuitBreaker,
  withFallback,
  safeJsonParse,
  maskError,
  withTimeout,
} from '../src/errorHandling';

describe('Error Handling Utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('isRetryableError', () => {
    it('identifies retryable error codes', () => {
      const error = new Error('Connection reset');
      (error as any).code = 'ECONNRESET';
      expect(isRetryableError(error, ['ECONNRESET', 'ETIMEDOUT'])).toBe(true);
    });

    it('identifies retryable error names', () => {
      const error = new Error('Throttled');
      error.name = 'ThrottlingException';
      expect(isRetryableError(error, ['ThrottlingException'])).toBe(true);
    });

    it('identifies retryable patterns in messages', () => {
      const error = new Error('Request timeout occurred');
      expect(isRetryableError(error, ['timeout'])).toBe(true);
    });

    it('returns false for non-retryable errors', () => {
      const error = new Error('Invalid input');
      (error as any).code = 'EINVAL';
      expect(isRetryableError(error, ['ECONNRESET', 'ETIMEDOUT'])).toBe(false);
    });
  });

  describe('withRetry', () => {
    it('succeeds on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable errors', async () => {
      vi.useRealTimers(); // Use real timers for this test
      const error = new Error('Connection timeout');
      (error as any).code = 'ETIMEDOUT';

      const fn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        maxRetries: 3,
        initialDelayMs: 10, // Use short delays
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws immediately on non-retryable errors', async () => {
      const error = new Error('Invalid request');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(
        withRetry(fn, {
          maxRetries: 3,
          retryableErrors: ['ECONNRESET'],
        }),
      ).rejects.toThrow('Invalid request');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('calls onRetry callback', async () => {
      vi.useRealTimers(); // Use real timers for this test
      const error = new Error('Timeout');
      (error as any).code = 'ETIMEDOUT';

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');
      const onRetry = vi.fn();

      const result = await withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 10, // Use short delays
        onRetry,
      });

      expect(result).toBe('success');
      expect(onRetry).toHaveBeenCalledWith(error, 1);
    });

    it('exhausts retries and throws last error', async () => {
      vi.useRealTimers(); // Use real timers for this test
      const error = new Error('Connection failed');
      (error as any).code = 'ECONNRESET';

      const fn = vi.fn().mockRejectedValue(error);

      try {
        await withRetry(fn, {
          maxRetries: 2,
          initialDelayMs: 10, // Use short delays
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toBe('Connection failed');
      }

      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });

  describe('CircuitBreaker', () => {
    it('executes function when closed', async () => {
      const breaker = new CircuitBreaker(3, 60000);
      const fn = vi.fn().mockResolvedValue('success');

      const result = await breaker.execute(fn);
      expect(result).toBe('success');
      expect(breaker.getState()).toBe('closed');
    });

    it('opens after threshold failures', async () => {
      const breaker = new CircuitBreaker(2, 60000);
      const fn = vi.fn().mockRejectedValue(new Error('Fail'));

      await expect(breaker.execute(fn)).rejects.toThrow('Fail');
      await expect(breaker.execute(fn)).rejects.toThrow('Fail');

      expect(breaker.getState()).toBe('open');

      await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker is open');
    });

    it('transitions to half-open after timeout', async () => {
      vi.useRealTimers();
      const breaker = new CircuitBreaker(1, 100);
      const fn = vi.fn().mockRejectedValue(new Error('Fail'));

      await expect(breaker.execute(fn)).rejects.toThrow('Fail');
      expect(breaker.getState()).toBe('open');

      await new Promise((resolve) => setTimeout(resolve, 150));

      const successFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe('closed');
    });

    it('resets circuit breaker', async () => {
      const breaker = new CircuitBreaker(1, 60000);
      const fn = vi.fn().mockRejectedValue(new Error('Fail'));

      await expect(breaker.execute(fn)).rejects.toThrow('Fail');
      expect(breaker.getState()).toBe('open');

      breaker.reset();
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('withFallback', () => {
    it('returns primary result on success', async () => {
      const primary = vi.fn().mockResolvedValue('primary');
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await withFallback(primary, fallback);
      expect(result).toBe('primary');
      expect(fallback).not.toHaveBeenCalled();
    });

    it('returns fallback result on primary failure', async () => {
      const primary = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await withFallback(primary, fallback);
      expect(result).toBe('fallback');
      expect(fallback).toHaveBeenCalled();
    });

    it('calls onFallback callback', async () => {
      const error = new Error('Primary failed');
      const primary = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback');
      const onFallback = vi.fn();

      await withFallback(primary, fallback, { onFallback });
      expect(onFallback).toHaveBeenCalledWith(error);
    });
  });

  describe('safeJsonParse', () => {
    it('parses valid JSON', () => {
      const result = safeJsonParse('{"key":"value"}', {});
      expect(result).toEqual({ key: 'value' });
    });

    it('returns fallback on invalid JSON', () => {
      const fallback = { default: true };
      const result = safeJsonParse('{invalid', fallback);
      expect(result).toBe(fallback);
    });

    it('validates parsed data', () => {
      const validator = (data: any) => data.version === 2;
      const fallback = { version: 1 };

      const invalid = safeJsonParse('{"version":1}', fallback, validator);
      expect(invalid).toBe(fallback);

      const valid = safeJsonParse('{"version":2}', fallback, validator);
      expect(valid).toEqual({ version: 2 });
    });
  });

  describe('maskError', () => {
    it('masks AWS access keys', () => {
      const error = new Error('Secret: AKIAIOSFODNN7EXAMPLE');
      const masked = maskError(error);
      expect(masked.message).toBe('Secret: ***REDACTED***');
    });

    it('masks GitHub tokens', () => {
      const error = new Error('Token: ghp_1234567890abcdefghijklmnopqrstuvwx');
      const masked = maskError(error);
      expect(masked.message).toContain('***REDACTED***');
      expect(masked.message).not.toContain('ghp_');
    });

    it('masks JWTs', () => {
      const error = new Error('JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U');
      const masked = maskError(error);
      expect(masked.message).toContain('***REDACTED***');
      expect(masked.message).not.toContain('eyJ');
    });

    it('preserves error name and stack', () => {
      const error = new Error('Secret: AKIAIOSFODNN7EXAMPLE');
      error.name = 'CustomError';
      const masked = maskError(error);
      expect(masked.name).toBe('CustomError');
      expect(masked.stack).toBeDefined();
    });
  });

  describe('withTimeout', () => {
    it('returns result before timeout', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withTimeout(fn, 1000);
      expect(result).toBe('success');
    });

    it('throws on timeout', async () => {
      vi.useRealTimers();
      const fn = vi.fn(() => new Promise(() => {})); // Never resolves
      await expect(withTimeout(fn, 100, 'Custom timeout')).rejects.toThrow('Custom timeout');
    });

    it('uses default timeout message', async () => {
      vi.useRealTimers();
      const fn = vi.fn(() => new Promise(() => {})); // Never resolves
      await expect(withTimeout(fn, 100)).rejects.toThrow('Operation timed out');
    });
  });
});
