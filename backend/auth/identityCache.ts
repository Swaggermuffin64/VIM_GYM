interface IdentityCacheEntry {
  displayName: string;
  cachedAt: number;
}

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 10_000;
const CACHE_SWEEP_INTERVAL_MS = 60_000;

const cache = new Map<string, IdentityCacheEntry>();

/** Returns the cached display name if present and younger than the TTL, else undefined. */
export function getCachedDisplayName(userId: string): string | undefined {
  const entry = cache.get(userId);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(userId);
    return undefined;
  }
  return entry.displayName;
}

/** Caches a display name for userId. No-ops on a new key once the cache is at capacity. */
export function setCachedDisplayName(
  userId: string,
  displayName: string
): void {
  if (cache.size >= CACHE_MAX_ENTRIES && !cache.has(userId)) return;
  cache.set(userId, { displayName, cachedAt: Date.now() });
}

/** Immediately removes userId's cached entry, e.g. after a profile update. */
export function invalidateCachedDisplayName(userId: string): void {
  cache.delete(userId);
}

/** Clears the whole cache. For tests only. */
export function resetIdentityCacheForTests(): void {
  cache.clear();
}

// unref'd so importing this module (e.g. via tests) never keeps the process alive.
const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of cache) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      cache.delete(userId);
    }
  }
}, CACHE_SWEEP_INTERVAL_MS);
sweepInterval.unref();
