/**
 * Tests for the matchmaking ConnectionLimiter — per-IP concurrent
 * connection caps for the matchmaking WebSocket server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionLimiter } from './connectionLimiter.js';

describe('ConnectionLimiter (matchmaking)', () => {
  let limiter: ConnectionLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new ConnectionLimiter({
      maxConnectionsPerIp: 2,
      cleanupDelayMs: 1000,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('allows connections up to the per-IP cap', () => {
    expect(limiter.addConnection('1.1.1.1', 's1')).toBe(true);
    expect(limiter.addConnection('1.1.1.1', 's2')).toBe(true);
    expect(limiter.addConnection('1.1.1.1', 's3')).toBe(false);
    expect(limiter.getConnectionCount('1.1.1.1')).toBe(2);
  });

  it('tracks IPs independently', () => {
    limiter.addConnection('1.1.1.1', 's1');
    limiter.addConnection('1.1.1.1', 's2');
    expect(limiter.addConnection('2.2.2.2', 's3')).toBe(true);
  });

  it('frees a slot when a connection is removed', () => {
    limiter.addConnection('1.1.1.1', 's1');
    limiter.addConnection('1.1.1.1', 's2');
    limiter.removeConnection('1.1.1.1', 's1');
    expect(limiter.addConnection('1.1.1.1', 's3')).toBe(true);
  });

  it('cancels pending cleanup when the IP reconnects', () => {
    limiter.addConnection('1.1.1.1', 's1');
    limiter.removeConnection('1.1.1.1', 's1');
    limiter.addConnection('1.1.1.1', 's2');
    vi.advanceTimersByTime(2000);
    expect(limiter.getConnectionCount('1.1.1.1')).toBe(1);
  });
});
