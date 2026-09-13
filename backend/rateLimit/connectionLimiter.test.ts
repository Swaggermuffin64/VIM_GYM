/**
 * Tests for ConnectionLimiter — per-IP and server-wide concurrent connection
 * caps. Guards against resource-exhaustion regressions, and against the
 * opposite failure: turning away players who should have been admitted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionLimiter } from './connectionLimiter.js';

describe('ConnectionLimiter', () => {
  let limiter: ConnectionLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new ConnectionLimiter({
      maxConnectionsPerIp: 2,
      maxTotalConnections: 3,
      cleanupDelayMs: 1000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows connections up to the per-IP cap', () => {
    expect(limiter.addConnection('1.1.1.1', 's1').admitted).toBe(true);
    expect(limiter.addConnection('1.1.1.1', 's2').admitted).toBe(true);
    expect(limiter.addConnection('1.1.1.1', 's3')).toEqual({
      admitted: false,
      reason: 'too_many_from_ip',
    });
    expect(limiter.getConnectionCount('1.1.1.1')).toBe(2);
  });

  it('tracks IPs independently', () => {
    limiter.addConnection('1.1.1.1', 's1');
    limiter.addConnection('1.1.1.1', 's2');
    expect(limiter.addConnection('2.2.2.2', 's3').admitted).toBe(true);
    expect(limiter.getTrackedIpCount()).toBe(2);
    expect(limiter.getTotalConnections()).toBe(3);
  });

  it('frees a slot when a connection is removed', () => {
    limiter.addConnection('1.1.1.1', 's1');
    limiter.addConnection('1.1.1.1', 's2');
    limiter.removeConnection('1.1.1.1', 's1');
    expect(limiter.addConnection('1.1.1.1', 's3').admitted).toBe(true);
  });

  it('forgets an IP after the cleanup delay once all connections close', () => {
    limiter.addConnection('1.1.1.1', 's1');
    limiter.removeConnection('1.1.1.1', 's1');
    expect(limiter.getTrackedIpCount()).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(limiter.getTrackedIpCount()).toBe(0);
  });

  it('cancels pending cleanup when the IP reconnects', () => {
    limiter.addConnection('1.1.1.1', 's1');
    limiter.removeConnection('1.1.1.1', 's1');
    limiter.addConnection('1.1.1.1', 's2');
    vi.advanceTimersByTime(2000);
    expect(limiter.getConnectionCount('1.1.1.1')).toBe(1);
  });

  describe('server-wide cap', () => {
    it('refuses connections from fresh IPs once the process is full', () => {
      limiter.addConnection('1.1.1.1', 's1');
      limiter.addConnection('2.2.2.2', 's2');
      limiter.addConnection('3.3.3.3', 's3');

      expect(limiter.getTotalConnections()).toBe(3);
      expect(limiter.addConnection('4.4.4.4', 's4')).toEqual({
        admitted: false,
        reason: 'server_at_capacity',
      });
      expect(limiter.getTotalConnections()).toBe(3);
    });

    it('reports capacity as the reason even when the IP has room', () => {
      limiter.addConnection('1.1.1.1', 's1');
      limiter.addConnection('2.2.2.2', 's2');
      limiter.addConnection('3.3.3.3', 's3');

      // 1.1.1.1 is at 1 of its 2 allowed connections, so the per-IP cap is not
      // what stops it — the client must be told the server is full instead.
      expect(limiter.addConnection('1.1.1.1', 's4')).toEqual({
        admitted: false,
        reason: 'server_at_capacity',
      });
    });

    it('admits again once a connection closes', () => {
      limiter.addConnection('1.1.1.1', 's1');
      limiter.addConnection('2.2.2.2', 's2');
      limiter.addConnection('3.3.3.3', 's3');
      limiter.removeConnection('2.2.2.2', 's2');

      expect(limiter.addConnection('4.4.4.4', 's4').admitted).toBe(true);
    });

    it('counts capacity rejections so shedding is observable', () => {
      limiter.addConnection('1.1.1.1', 's1');
      limiter.addConnection('2.2.2.2', 's2');
      limiter.addConnection('3.3.3.3', 's3');
      expect(limiter.getCapacityRejectionCount()).toBe(0);

      limiter.addConnection('4.4.4.4', 's4');
      limiter.addConnection('5.5.5.5', 's5');
      expect(limiter.getCapacityRejectionCount()).toBe(2);

      // Per-IP rejections are a different problem and must not inflate it.
      // Free enough room that the server-wide cap is not what bites here.
      limiter.removeConnection('1.1.1.1', 's1');
      limiter.removeConnection('3.3.3.3', 's3');
      expect(limiter.addConnection('2.2.2.2', 's6').admitted).toBe(true);
      expect(limiter.addConnection('2.2.2.2', 's7')).toEqual({
        admitted: false,
        reason: 'too_many_from_ip',
      });
      expect(limiter.getCapacityRejectionCount()).toBe(2);
    });

    it('keeps the total accurate when a socket is removed twice', () => {
      // A handshake can be rejected by a later middleware (which cleans up) and
      // then fire `disconnect` (which cleans up again). A double decrement
      // would leak capacity upward forever.
      limiter.addConnection('1.1.1.1', 's1');
      limiter.addConnection('2.2.2.2', 's2');
      limiter.removeConnection('1.1.1.1', 's1');
      limiter.removeConnection('1.1.1.1', 's1');

      expect(limiter.getTotalConnections()).toBe(1);
    });

    it('does not double-count a repeated socket id', () => {
      limiter.addConnection('1.1.1.1', 's1');
      limiter.addConnection('1.1.1.1', 's1');
      expect(limiter.getTotalConnections()).toBe(1);
      expect(limiter.getConnectionCount('1.1.1.1')).toBe(1);
    });
  });

  it('exposes its configured ceilings for /health reporting', () => {
    expect(limiter.getMaxConnectionsPerIp()).toBe(2);
    expect(limiter.getMaxTotalConnections()).toBe(3);
  });

  it('checks admission without registering the connection', () => {
    expect(limiter.checkAdmission('1.1.1.1').admitted).toBe(true);
    expect(limiter.getTotalConnections()).toBe(0);
  });
});
