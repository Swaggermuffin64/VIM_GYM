/**
 * Connection Limiter for Matchmaking Service
 *
 * Limits concurrent connections per IP address.
 */

export interface ConnectionLimiterOptions {
  maxConnectionsPerIp: number;
  cleanupDelayMs: number;
}

const DEFAULT_OPTIONS: ConnectionLimiterOptions = {
  maxConnectionsPerIp: 5, // 5 concurrent connections per IP for matchmaking
  cleanupDelayMs: 60000,
};

export class ConnectionLimiter {
  private connections: Map<string, Set<string>> = new Map();
  private options: ConnectionLimiterOptions;
  private cleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(options: Partial<ConnectionLimiterOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  canConnect(ip: string): boolean {
    const currentConnections = this.connections.get(ip)?.size ?? 0;
    return currentConnections < this.options.maxConnectionsPerIp;
  }

  addConnection(ip: string, connectionId: string): boolean {
    const cleanupTimer = this.cleanupTimers.get(ip);
    if (cleanupTimer) {
      clearTimeout(cleanupTimer);
      this.cleanupTimers.delete(ip);
    }

    if (!this.canConnect(ip)) {
      return false;
    }

    if (!this.connections.has(ip)) {
      this.connections.set(ip, new Set());
    }
    this.connections.get(ip)!.add(connectionId);

    return true;
  }

  removeConnection(ip: string, connectionId: string): void {
    const ipConnections = this.connections.get(ip);
    if (!ipConnections) return;

    ipConnections.delete(connectionId);

    if (ipConnections.size === 0) {
      const timer = setTimeout(() => {
        this.connections.delete(ip);
        this.cleanupTimers.delete(ip);
      }, this.options.cleanupDelayMs);

      this.cleanupTimers.set(ip, timer);
    }
  }

  getConnectionCount(ip: string): number {
    return this.connections.get(ip)?.size ?? 0;
  }
}

export const connectionLimiter = new ConnectionLimiter({
  maxConnectionsPerIp: 5, // Matchmaking needs fewer concurrent connections
});
