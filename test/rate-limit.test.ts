import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../src/rateLimit.js';

describe('Rate Limiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      tokensPerInterval: 10,
      interval: 1000, // 1 second
      maxTokens: 10,
    });
  });

  it('should allow requests within rate limit', () => {
    const key = 'client-1';

    // Should allow 10 requests
    for (let i = 0; i < 10; i++) {
      expect(limiter.tryConsume(key)).toBe(true);
    }
  });

  it('should reject requests exceeding rate limit', () => {
    const key = 'client-2';

    // Consume all tokens
    for (let i = 0; i < 10; i++) {
      limiter.tryConsume(key);
    }

    // 11th request should be rejected
    expect(limiter.tryConsume(key)).toBe(false);
  });

  it('should refill tokens over time', async () => {
    const key = 'client-3';

    // Consume all tokens
    for (let i = 0; i < 10; i++) {
      limiter.tryConsume(key);
    }

    // Should be rejected immediately
    expect(limiter.tryConsume(key)).toBe(false);

    // Wait for partial refill (100ms = 1 token)
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should have ~1 token now
    expect(limiter.tryConsume(key)).toBe(true);
    expect(limiter.tryConsume(key)).toBe(false); // Second should fail
  });

  it('should track separate buckets for different keys', () => {
    const key1 = 'client-4';
    const key2 = 'client-5';

    // Exhaust key1
    for (let i = 0; i < 10; i++) {
      limiter.tryConsume(key1);
    }

    // key1 should be rate limited
    expect(limiter.tryConsume(key1)).toBe(false);

    // key2 should still have tokens
    expect(limiter.tryConsume(key2)).toBe(true);
  });

  it('should return current token count', () => {
    const key = 'client-6';

    // Initial tokens
    expect(limiter.getTokens(key)).toBe(10);

    // Consume 3 tokens
    limiter.tryConsume(key, 3);
    expect(limiter.getTokens(key)).toBe(7);
  });

  it('should support consuming multiple tokens at once', () => {
    const key = 'client-7';

    // Consume 5 tokens
    expect(limiter.tryConsume(key, 5)).toBe(true);
    expect(limiter.getTokens(key)).toBeCloseTo(5, 1);

    // Try to consume 6 tokens (should fail)
    expect(limiter.tryConsume(key, 6)).toBe(false);

    // Consume 5 tokens (should succeed)
    expect(limiter.tryConsume(key, 5)).toBe(true);
    expect(limiter.getTokens(key)).toBeCloseTo(0, 1);
  });

  it('should cap tokens at maxTokens', async () => {
    const key = 'client-8';

    // Consume 5 tokens
    limiter.tryConsume(key, 5);

    // Wait long enough to refill beyond maxTokens
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Should be capped at 10
    expect(limiter.getTokens(key)).toBeLessThanOrEqual(10);
  });

  it('should reset all buckets', () => {
    limiter.tryConsume('client-9', 10);
    limiter.tryConsume('client-10', 10);

    expect(limiter.size()).toBe(2);

    limiter.reset();

    expect(limiter.size()).toBe(0);
    expect(limiter.tryConsume('client-9')).toBe(true); // Fresh bucket
  });

  it('should cleanup stale buckets', async () => {
    const key = 'client-11';

    // Consume a token to create bucket
    limiter.tryConsume(key, 1);
    expect(limiter.size()).toBe(1);

    // Wait for refill and stale period
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Cleanup should remove fully refilled buckets
    limiter.cleanup();
    expect(limiter.size()).toBe(0);
  });

  it('should not cleanup active buckets', async () => {
    const key = 'client-12';

    // Consume all tokens
    limiter.tryConsume(key, 10);
    expect(limiter.size()).toBe(1);

    // Wait for partial refill
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Cleanup should not remove partially depleted buckets
    limiter.cleanup();
    expect(limiter.size()).toBe(1);
  });

  it('should handle high request rates gracefully', () => {
    const key = 'client-13';
    let allowed = 0;
    let denied = 0;

    // Hammer with 100 requests
    for (let i = 0; i < 100; i++) {
      if (limiter.tryConsume(key)) {
        allowed++;
      } else {
        denied++;
      }
    }

    expect(allowed).toBe(10);
    expect(denied).toBe(90);
  });

  it('should support custom maxTokens different from tokensPerInterval', () => {
    const customLimiter = new RateLimiter({
      tokensPerInterval: 5,
      interval: 1000,
      maxTokens: 20, // Allow burst up to 20
    });

    const key = 'burst-client';

    // Should allow 20 tokens initially
    for (let i = 0; i < 20; i++) {
      expect(customLimiter.tryConsume(key)).toBe(true);
    }

    // 21st should fail
    expect(customLimiter.tryConsume(key)).toBe(false);
  });
});
