/**
 * Tiny in-memory cache with a fixed time-to-live per entry.
 *
 * Used by the API clients to serve recently fetched leaderboard data from
 * memory instead of re-querying the backend on every navigation. The cache
 * lives for the lifetime of the tab; writers that change the underlying data
 * (submitting a run, completing a daily attempt) call `clear()` so the next
 * read is fresh.
 */
export class TtlCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  /** The cached value for `key`, or undefined if absent or expired. */
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Store `value` under `key`, replacing any prior entry and its TTL. */
  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Drop every entry, forcing the next get of any key to miss. */
  clear(): void {
    this.entries.clear();
  }
}
