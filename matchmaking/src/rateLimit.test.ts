/**
 * Tests for the matchmaking RateLimiter — fixed-window request limits with
 * a block period for offenders.
 * Fake timers are installed BEFORE construction because the constructor
 * starts a cleanup setInterval.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from './rateLimit.js';

describe('RateLimiter (matchmaking)', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter({
      maxRequests: 3,
      windowMs: 1000,
      blockDurationMs: 2000,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('allows up to maxRequests within the window', () => {
    expect(limiter.check('c1')).toBe(true);
    expect(limiter.check('c1')).toBe(true);
    expect(limiter.check('c1')).toBe(true);
  });

  it('blocks after exceeding the limit and stays blocked for the block duration', () => {
    for (let i = 0; i < 4; i++) limiter.check('c1');
    expect(limiter.check('c1')).toBe(false);
    vi.advanceTimersByTime(1500); // window over, but block still active
    expect(limiter.check('c1')).toBe(false);
  });

  it('allows again after the block expires', () => {
    for (let i = 0; i < 4; i++) limiter.check('c1');
    vi.advanceTimersByTime(2001);
    expect(limiter.check('c1')).toBe(true);
  });

  it('tracks connections independently', () => {
    for (let i = 0; i < 4; i++) limiter.check('c1');
    expect(limiter.check('c2')).toBe(true);
  });

  it('resets the counter when the window expires without a block', () => {
    limiter.check('c1');
    limiter.check('c1');
    vi.advanceTimersByTime(1001);
    expect(limiter.check('c1')).toBe(true);
    expect(limiter.check('c1')).toBe(true);
    expect(limiter.check('c1')).toBe(true);
  });
});
