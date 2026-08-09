/**
 * Simple Rate Limiter for Matchmaking WebSocket
 *
 * Tracks requests per connection and blocks excessive usage.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockExpires: number;
}

export class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private maxRequests: number;
  private windowMs: number;
  private blockDurationMs: number;

  constructor(
    options: {
      maxRequests?: number;
      windowMs?: number;
      blockDurationMs?: number;
    } = {}
  ) {
    this.maxRequests = options.maxRequests ?? 20; // 20 requests
    this.windowMs = options.windowMs ?? 60000; // per minute
    this.blockDurationMs = options.blockDurationMs ?? 60000; // block for 1 minute

    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if a request is allowed
   * @returns true if allowed, false if rate limited
   */
  check(connectionId: string): boolean {
    const now = Date.now();
    let entry = this.entries.get(connectionId);

    // Create new entry if doesn't exist
    if (!entry) {
      entry = { count: 0, windowStart: now, blocked: false, blockExpires: 0 };
      this.entries.set(connectionId, entry);
    }

    // Check if blocked
    if (entry.blocked) {
      if (now < entry.blockExpires) {
        return false;
      }
      // Block expired, reset
      entry.blocked = false;
      entry.count = 0;
      entry.windowStart = now;
    }

    // Check if window expired, reset counter
    if (now - entry.windowStart > this.windowMs) {
      entry.count = 0;
      entry.windowStart = now;
    }

    // Increment counter
    entry.count++;

    // Check if limit exceeded
    if (entry.count > this.maxRequests) {
      entry.blocked = true;
      entry.blockExpires = now + this.blockDurationMs;
      console.log(
        `⚠️ Rate limited connection ${connectionId} for ${this.blockDurationMs}ms`
      );
      return false;
    }

    return true;
  }

  /**
   * Remove entry for a connection (call on disconnect)
   */
  remove(connectionId: string): void {
    this.entries.delete(connectionId);
  }

  /**
   * Clean up old entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries.entries()) {
      // Remove entries that haven't been used in 2 windows and aren't blocked
      if (!entry.blocked && now - entry.windowStart > this.windowMs * 2) {
        this.entries.delete(id);
      }
    }
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter({
  maxRequests: 30, // 30 messages per minute (generous for matchmaking)
  windowMs: 60000,
  blockDurationMs: 60000,
});
