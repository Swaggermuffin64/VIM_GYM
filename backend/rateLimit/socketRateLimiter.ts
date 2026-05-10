/**
 * Rate Limiter for Socket.IO Events
 *
 * Provides per-socket rate limiting for WebSocket events to prevent spam/abuse.
 * Uses a sliding window algorithm for smooth rate limiting.
 */

export interface RateLimitConfig {
  /** Maximum number of events allowed in the window */
  maxEvents: number;
  /** Time window in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
}

interface SocketRateData {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockExpires: number;
}

/**
 * Rate limiter for Socket.IO events.
 * Tracks event counts per socket and blocks sockets that exceed limits.
 */
export class SocketRateLimiter {
  private limits: Map<string, RateLimitConfig>;
  private data: Map<string, Map<string, SocketRateData>>;
  private cleanupInterval: ReturnType<typeof setInterval>;

  // Default limits for different event categories
  static readonly DEFAULTS = {
    // High-frequency events (cursor movement, text updates)
    highFrequency: { maxEvents: 60, windowMs: 1000 }, // 60/sec
    // Medium-frequency events (room actions)
    mediumFrequency: { maxEvents: 10, windowMs: 10000 }, // 10 per 10s
    // Low-frequency events (create room, join)
    lowFrequency: { maxEvents: 5, windowMs: 60000 }, // 5 per minute
  };

  constructor() {
    this.limits = new Map();
    this.data = new Map();

    // Cleanup old data every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Configure rate limit for a specific event type
   */
  setLimit(eventName: string, config: RateLimitConfig): void {
    this.limits.set(eventName, config);
  }

  /**
   * Check if an event is allowed for a socket
   */
  check(socketId: string, eventName: string): RateLimitResult {
    const config = this.limits.get(eventName);
    if (!config) {
      // No limit configured for this event
      return { allowed: true, remaining: Infinity, resetIn: 0 };
    }

    const now = Date.now();

    // Get or create socket data
    if (!this.data.has(socketId)) {
      this.data.set(socketId, new Map());
    }
    const socketData = this.data.get(socketId)!;

    // Get or create event data
    if (!socketData.has(eventName)) {
      socketData.set(eventName, {
        count: 0,
        windowStart: now,
        blocked: false,
        blockExpires: 0,
      });
    }
    const eventData = socketData.get(eventName)!;

    // Roll over to a new window if the current one has expired
    if (now - eventData.windowStart >= config.windowMs) {
      eventData.count = 0;
      eventData.windowStart = now;
      eventData.blocked = false;
    }

    // Check if currently blocked
    if (eventData.blocked) {
      return {
        allowed: false,
        remaining: 0,
        resetIn: eventData.blockExpires - now,
      };
    }

    // Check if limit exceeded
    if (eventData.count >= config.maxEvents) {
      eventData.blocked = true;
      eventData.blockExpires = eventData.windowStart + config.windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetIn: eventData.blockExpires - now,
      };
    }

    eventData.count += 1;

    return {
      allowed: true,
      remaining: config.maxEvents - eventData.count,
      resetIn: 0,
    };
  }

  /**
   * Remove all data for a socket (call on disconnect)
   */
  removeSocket(socketId: string): void {
    this.data.delete(socketId);
  }

  /**
   * Clean up old socket data
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [socketId, socketData] of this.data.entries()) {
      let hasActiveData = false;

      for (const [eventName, eventData] of socketData.entries()) {
        const config = this.limits.get(eventName);
        if (!config) continue;

        // Roll over expired windows
        if (now - eventData.windowStart >= config.windowMs) {
          eventData.count = 0;
          eventData.windowStart = now;
          eventData.blocked = false;
        }

        if (eventData.count > 0 || eventData.blocked) {
          hasActiveData = true;
        }
      }

      if (!hasActiveData) {
        this.data.delete(socketId);
      }
    }
  }

  /**
   * Stop the cleanup interval (call on shutdown)
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

// Singleton instance for the backend
export const socketRateLimiter = new SocketRateLimiter();

// Configure default limits for vim-racing events
socketRateLimiter.setLimit(
  'player:editorText',
  SocketRateLimiter.DEFAULTS.highFrequency
);
socketRateLimiter.setLimit(
  'player:task_complete',
  SocketRateLimiter.DEFAULTS.mediumFrequency
);
socketRateLimiter.setLimit(
  'room:create',
  SocketRateLimiter.DEFAULTS.lowFrequency
);
socketRateLimiter.setLimit(
  'room:join',
  SocketRateLimiter.DEFAULTS.lowFrequency
);
socketRateLimiter.setLimit(
  'room:join_matched',
  SocketRateLimiter.DEFAULTS.lowFrequency
);
socketRateLimiter.setLimit(
  'room:quick_match',
  SocketRateLimiter.DEFAULTS.lowFrequency
);
socketRateLimiter.setLimit(
  'room:leave',
  SocketRateLimiter.DEFAULTS.mediumFrequency
);
socketRateLimiter.setLimit(
  'player:ready_to_play',
  SocketRateLimiter.DEFAULTS.mediumFrequency
);
