/**
 * Connection Limiter
 *
 * Guards the process against socket exhaustion with two ceilings:
 *
 * - **Per IP** — stops a single host from monopolising the server. Set well
 *   above per-person usage because shared NATs (offices, universities, VPNs)
 *   put many legitimate players behind one address.
 * - **Server-wide** — the real protection. All race state lives in this
 *   process's memory, so if connections grow until RSS crosses the `/health`
 *   memory limit, Fly restarts the machine and every in-progress race dies.
 *   Refusing *new* connections instead lets players already racing finish.
 *
 * Both ceilings are configured in `config.ts` and reported on `/health` so the
 * numbers can be tuned against observed memory use.
 */

import type { ConnectionRejectionReason } from './connectionRejection.js';
import {
  MAX_CONNECTIONS_PER_IP,
  MAX_TOTAL_SOCKET_CONNECTIONS,
} from '../config.js';

export interface ConnectionLimiterOptions {
  /** Maximum connections allowed per IP */
  maxConnectionsPerIp: number;
  /** Maximum connections the process will admit in total */
  maxTotalConnections: number;
  /** How long to track an IP after all connections close (ms) */
  cleanupDelayMs: number;
}

/** Outcome of an admission check: allowed, or refused with a reason. */
export type ConnectionAdmission =
  | { admitted: true }
  | { admitted: false; reason: ConnectionRejectionReason };

const ADMITTED: ConnectionAdmission = { admitted: true };

const DEFAULT_OPTIONS: ConnectionLimiterOptions = {
  maxConnectionsPerIp: MAX_CONNECTIONS_PER_IP,
  maxTotalConnections: MAX_TOTAL_SOCKET_CONNECTIONS,
  cleanupDelayMs: 60000, // Keep tracking for 1 minute after disconnect
};

export class ConnectionLimiter {
  private connections: Map<string, Set<string>> = new Map(); // IP -> Set of socket IDs
  private options: ConnectionLimiterOptions;
  private cleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  // Tracked incrementally rather than summed on demand: this is read on every
  // handshake, and the number of tracked IPs is unbounded.
  private totalConnections = 0;
  private capacityRejections = 0;

  constructor(options: Partial<ConnectionLimiterOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Whether a new connection from an IP would be admitted, and if not, why.
   * Server capacity is checked first: when the process is full that is the more
   * useful thing to tell the client, since closing tabs would not help.
   */
  checkAdmission(ip: string): ConnectionAdmission {
    if (this.totalConnections >= this.options.maxTotalConnections) {
      return { admitted: false, reason: 'server_at_capacity' };
    }
    const fromThisIp = this.connections.get(ip)?.size ?? 0;
    if (fromThisIp >= this.options.maxConnectionsPerIp) {
      return { admitted: false, reason: 'too_many_from_ip' };
    }
    return ADMITTED;
  }

  /**
   * Register a new connection if both ceilings allow it.
   * @returns the admission outcome; the connection is tracked only if admitted.
   */
  addConnection(ip: string, socketId: string): ConnectionAdmission {
    // Clear any pending cleanup for this IP
    const cleanupTimer = this.cleanupTimers.get(ip);
    if (cleanupTimer) {
      clearTimeout(cleanupTimer);
      this.cleanupTimers.delete(ip);
    }

    const admission = this.checkAdmission(ip);
    if (!admission.admitted) {
      if (admission.reason === 'server_at_capacity') {
        this.capacityRejections += 1;
      }
      return admission;
    }

    // Add connection. Only a socket id that was not already tracked moves the
    // total, so a repeated call for the same socket cannot inflate it.
    let ipConnections = this.connections.get(ip);
    if (!ipConnections) {
      ipConnections = new Set();
      this.connections.set(ip, ipConnections);
    }
    if (!ipConnections.has(socketId)) {
      ipConnections.add(socketId);
      this.totalConnections += 1;
    }

    return admission;
  }

  /**
   * Remove a connection when socket disconnects.
   *
   * Safe to call more than once for the same socket: a handshake can be
   * rejected by a later middleware *and* then disconnect, and the total must
   * only be decremented for a connection that was actually tracked.
   */
  removeConnection(ip: string, socketId: string): void {
    const ipConnections = this.connections.get(ip);
    if (!ipConnections) return;

    if (ipConnections.delete(socketId)) {
      this.totalConnections -= 1;
    }

    // If no more connections from this IP, schedule cleanup
    if (ipConnections.size === 0) {
      const timer = setTimeout(() => {
        this.connections.delete(ip);
        this.cleanupTimers.delete(ip);
      }, this.options.cleanupDelayMs);

      this.cleanupTimers.set(ip, timer);
    }
  }

  /**
   * Get current connection count for an IP.
   */
  getConnectionCount(ip: string): number {
    return this.connections.get(ip)?.size ?? 0;
  }

  /**
   * Get total number of tracked IPs.
   */
  getTrackedIpCount(): number {
    return this.connections.size;
  }

  /**
   * Get total number of active connections.
   */
  getTotalConnections(): number {
    return this.totalConnections;
  }

  /** Configured server-wide ceiling, for reporting on `/health`. */
  getMaxTotalConnections(): number {
    return this.options.maxTotalConnections;
  }

  /** Configured per-IP ceiling, for logging and reporting on `/health`. */
  getMaxConnectionsPerIp(): number {
    return this.options.maxConnectionsPerIp;
  }

  /**
   * How many connections have been refused for server capacity since startup.
   * A non-zero value means the process is shedding load and needs more machines
   * (or a higher ceiling, if memory headroom allows).
   */
  getCapacityRejectionCount(): number {
    return this.capacityRejections;
  }
}

// Singleton instance for the backend, using the configured ceilings.
export const connectionLimiter = new ConnectionLimiter();
