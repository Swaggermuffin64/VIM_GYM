/**
 * Tests for SocketRateLimiter — sliding-window per-socket event limits.
 * Guards the spam/abuse barrier: a regression here silently removes
 * protection from every socket event.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocketRateLimiter } from './socketRateLimiter.js';

describe('SocketRateLimiter', () => {
  let limiter: SocketRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new SocketRateLimiter();
    limiter.setLimit('test:event', { maxEvents: 3, windowMs: 1000 });
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  it('allows events with no configured limit', () => {
    const result = limiter.check('sock1', 'unconfigured:event');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
  });

  it('allows up to maxEvents then blocks for the rest of the window', () => {
    expect(limiter.check('sock1', 'test:event').allowed).toBe(true);
    expect(limiter.check('sock1', 'test:event').allowed).toBe(true);
    const third = limiter.check('sock1', 'test:event');
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = limiter.check('sock1', 'test:event');
    expect(fourth.allowed).toBe(false);
    expect(fourth.resetIn).toBeGreaterThan(0);
    expect(fourth.resetIn).toBeLessThanOrEqual(1000);
  });

  it('unblocks after the window expires', () => {
    for (let i = 0; i < 4; i++) limiter.check('sock1', 'test:event');
    expect(limiter.check('sock1', 'test:event').allowed).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(limiter.check('sock1', 'test:event').allowed).toBe(true);
  });

  it('tracks sockets independently', () => {
    for (let i = 0; i < 4; i++) limiter.check('sock1', 'test:event');
    expect(limiter.check('sock1', 'test:event').allowed).toBe(false);
    expect(limiter.check('sock2', 'test:event').allowed).toBe(true);
  });

  it('resets a socket after removeSocket', () => {
    for (let i = 0; i < 4; i++) limiter.check('sock1', 'test:event');
    limiter.removeSocket('sock1');
    expect(limiter.check('sock1', 'test:event').allowed).toBe(true);
  });
});
