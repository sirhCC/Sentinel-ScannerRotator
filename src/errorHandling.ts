/**
 * Error handling utilities for network operations, retries, and recovery
 */

export type RetryOptions = {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
  onRetry?: (error: Error, attempt: number) => void;
};

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ENETUNREACH',
    'EAI_AGAIN',
    'NetworkingError',
    'ThrottlingException',
    'ServiceUnavailable',
    'TooManyRequestsException',
    'RequestTimeout',
  ],
  onRetry: () => {},
};

/**
 * Determines if an error is retryable based on error code or message
 */
export function isRetryableError(error: Error, retryableErrors: string[]): boolean {
  const errorCode = (error as any).code;
  const errorName = error.name;
  const errorMessage = error.message;

  // Check error code
  if (errorCode && retryableErrors.includes(errorCode)) {
    return true;
  }

  // Check error name
  if (retryableErrors.includes(errorName)) {
    return true;
  }

  // Check if error message contains retryable patterns
  return retryableErrors.some((pattern) =>
    errorMessage.toLowerCase().includes(pattern.toLowerCase()),
  );
}

/**
 * Calculates delay for exponential backoff with jitter
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const baseDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(baseDelay, options.maxDelayMs);
  // Add jitter (±25% randomization)
  const jitter = cappedDelay * 0.25 * (Math.random() - 0.5);
  return Math.floor(cappedDelay + jitter);
}

/**
 * Executes a function with automatic retry and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt > opts.maxRetries) {
        throw lastError;
      }

      // Check if error is retryable
      if (!isRetryableError(lastError, opts.retryableErrors)) {
        throw lastError;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, opts);
      opts.onRetry(lastError, attempt);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Circuit breaker state
 */
type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000,
    private readonly halfOpenAttempts: number = 1,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is open - service unavailable');
      }
    }

    try {
      const result = await fn();

      if (this.state === 'half-open') {
        this.successCount++;
        if (this.successCount >= this.halfOpenAttempts) {
          this.state = 'closed';
          this.failures = 0;
        }
      }

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.threshold) {
        this.state = 'open';
      } else if (this.state === 'half-open') {
        this.state = 'open';
      }

      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successCount = 0;
  }
}

/**
 * Graceful degradation wrapper
 * Executes primary function, falls back to secondary on failure
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T> | T,
  options?: {
    onFallback?: (error: Error) => void;
  },
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    options?.onFallback?.(error instanceof Error ? error : new Error(String(error)));
    return await fallback();
  }
}

/**
 * Safe JSON parse with validation and recovery
 */
export function safeJsonParse<T>(
  text: string,
  fallback: T,
  validator?: (data: any) => boolean,
): T {
  try {
    const parsed = JSON.parse(text);
    if (validator && !validator(parsed)) {
      return fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

/**
 * Error masking for sensitive data
 * Removes potential secrets from error messages
 */
export function maskError(error: Error): Error {
  const maskedMessage = error.message
    .replace(/gh[ps]_[a-zA-Z0-9]{30,}/g, '***REDACTED***') // GitHub tokens (ghp_, ghs_)
    .replace(/AKIA[A-Z0-9]{16}/g, '***REDACTED***') // AWS access keys
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '***REDACTED***') // JWTs
    .replace(/sk_live_[a-zA-Z0-9]{24,}/g, '***REDACTED***') // Stripe keys
    .replace(/\b[A-Z0-9]{20,}\b/g, '***REDACTED***'); // Generic long alphanumeric (AWS-like keys)

  const masked = new Error(maskedMessage);
  masked.name = error.name;
  masked.stack = error.stack?.replace(error.message, maskedMessage);
  return masked;
}

/**
 * Timeout wrapper with cancellation
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutError?: string,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutError || 'Operation timed out')), timeoutMs),
    ),
  ]);
}
