import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const {
  getCachedDisplayName,
  setCachedDisplayName,
  invalidateCachedDisplayName,
  resetIdentityCacheForTests,
} = await import('./identityCache.js');

beforeEach(() => {
  resetIdentityCacheForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('identityCache', () => {
  it('returns undefined for a userId that was never cached', () => {
    expect(getCachedDisplayName('user-1')).toBeUndefined();
  });

  it('returns the cached display name within the TTL window', () => {
    setCachedDisplayName('user-1', 'zaphod');
    expect(getCachedDisplayName('user-1')).toBe('zaphod');
  });

  it('does not expire an entry read just under the TTL', () => {
    setCachedDisplayName('user-1', 'zaphod');
    vi.advanceTimersByTime(59_999);
    expect(getCachedDisplayName('user-1')).toBe('zaphod');
  });

  it('expires an entry once the TTL has elapsed', () => {
    setCachedDisplayName('user-1', 'zaphod');
    vi.advanceTimersByTime(60_001);
    expect(getCachedDisplayName('user-1')).toBeUndefined();
  });

  it('invalidate removes an entry immediately', () => {
    setCachedDisplayName('user-1', 'zaphod');
    invalidateCachedDisplayName('user-1');
    expect(getCachedDisplayName('user-1')).toBeUndefined();
  });

  it('invalidating a userId that was never cached is a no-op', () => {
    expect(() => invalidateCachedDisplayName('nobody')).not.toThrow();
  });

  it('allows refreshing an existing key even when the cache is full', () => {
    for (let i = 0; i < 10_000; i++) {
      setCachedDisplayName(`user-${i}`, `name-${i}`);
    }
    setCachedDisplayName('user-0', 'updated-name');
    expect(getCachedDisplayName('user-0')).toBe('updated-name');
  });

  it('rejects a new key once the cache is at capacity', () => {
    for (let i = 0; i < 10_000; i++) {
      setCachedDisplayName(`user-${i}`, `name-${i}`);
    }
    setCachedDisplayName('overflow-user', 'someone');
    expect(getCachedDisplayName('overflow-user')).toBeUndefined();
  });
});
