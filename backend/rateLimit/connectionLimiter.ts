/**
 * Connection Limiter
 *
 * Limits the number of concurrent connections per IP address to prevent
 * resource exhaustion attacks.
 */

export interface ConnectionLimiterOptions {
  /** Maximum connections allowed per IP */
  maxConnectionsPerIp: number;
  /** How long to track an IP after all connections close (ms) */
  cleanupDelayMs: number;
}

const DEFAULT_OPTIONS: ConnectionLimiterOptions = {
  maxConnectionsPerIp: 10, // 10 concurrent connections per IP
  cleanupDelayMs: 60000, // Keep tracking for 1 minute after disconnect
};

export class ConnectionLimiter {
  private connections: Map<string, Set<string>> = new Map(); // IP -> Set of socket IDs
  private options: ConnectionLimiterOptions;
  private cleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(options: Partial<ConnectionLimiterOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Check if a new connection from an IP is allowed.
   * @returns true if connection is allowed, false if limit exceeded
   */
  canConnect(ip: string): boolean {
    const currentConnections = this.connections.get(ip)?.size ?? 0;
    return currentConnections < this.options.maxConnectionsPerIp;
  }

  /**
   * Register a new connection.
   * @returns true if registered successfully, false if limit exceeded
   */
  addConnection(ip: string, socketId: string): boolean {
    // Clear any pending cleanup for this IP
    const cleanupTimer = this.cleanupTimers.get(ip);
    if (cleanupTimer) {
      clearTimeout(cleanupTimer);
      this.cleanupTimers.delete(ip);
    }

    // Check limit
    if (!this.canConnect(ip)) {
      return false;
    }

    // Add connection
    if (!this.connections.has(ip)) {
      this.connections.set(ip, new Set());
    }
    this.connections.get(ip)!.add(socketId);

    return true;
  }

  /**
   * Remove a connection when socket disconnects.
   */
  removeConnection(ip: string, socketId: string): void {
    const ipConnections = this.connections.get(ip);
    if (!ipConnections) return;

    ipConnections.delete(socketId);

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
    let total = 0;
    for (const connections of this.connections.values()) {
      total += connections.size;
    }
    return total;
  }
}

// Singleton instance for the backend
export const connectionLimiter = new ConnectionLimiter({
  maxConnectionsPerIp: 10, // Allow 10 concurrent connections per IP
});
