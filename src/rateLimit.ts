/**
 * Simple token bucket rate limiter for API endpoints
 * 
 * @example
 * const limiter = new RateLimiter({ tokensPerInterval: 100, interval: 60000 });
 * if (!limiter.tryConsume('client-ip')) {
 *   res.statusCode = 429;
 *   res.end('Rate limit exceeded');
 *   return;
 * }
 */

export type RateLimiterOptions = {
  /** Number of tokens to refill per interval */
  tokensPerInterval: number;
  /** Interval in milliseconds */
  interval: number;
  /** Maximum tokens that can accumulate (defaults to tokensPerInterval) */
  maxTokens?: number;
};

type BucketState = {
  tokens: number;
  lastRefill: number;
};

export class RateLimiter {
  private readonly tokensPerInterval: number;
  private readonly interval: number;
  private readonly maxTokens: number;
  private readonly buckets = new Map<string, BucketState>();

  constructor(opts: RateLimiterOptions) {
    this.tokensPerInterval = opts.tokensPerInterval;
    this.interval = opts.interval;
    this.maxTokens = opts.maxTokens ?? opts.tokensPerInterval;
  }

  /**
   * Attempt to consume a token for the given key (e.g., IP address)
   * @returns true if request is allowed, false if rate limited
   */
  tryConsume(key: string, tokens: number = 1): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    if (elapsed > 0) {
      const refillAmount = (elapsed / this.interval) * this.tokensPerInterval;
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refillAmount);
      bucket.lastRefill = now;
    }

    // Try to consume tokens
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Get current token count for a key
   */
  getTokens(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return this.maxTokens;

    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const refillAmount = (elapsed / this.interval) * this.tokensPerInterval;
    return Math.min(this.maxTokens, bucket.tokens + refillAmount);
  }

  /**
   * Reset all buckets (useful for testing)
   */
  reset(): void {
    this.buckets.clear();
  }

  /**
   * Get number of tracked keys
   */
  size(): number {
    return this.buckets.size;
  }

  /**
   * Clean up stale buckets (tokens fully refilled and inactive)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      const elapsed = now - bucket.lastRefill;
      const refillAmount = (elapsed / this.interval) * this.tokensPerInterval;
      const currentTokens = Math.min(this.maxTokens, bucket.tokens + refillAmount);
      
      // Remove if fully refilled and inactive for at least one interval
      if (currentTokens >= this.maxTokens && elapsed > this.interval) {
        this.buckets.delete(key);
      }
    }
  }
}
