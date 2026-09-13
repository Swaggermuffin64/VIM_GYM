import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TtlCache } from './ttlCache';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TtlCache', () => {
  it('returns undefined for a key that was never set', () => {
    const cache = new TtlCache<string>(1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns the stored value while it is fresh', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('k', 'value');
    vi.advanceTimersByTime(999);
    expect(cache.get('k')).toBe('value');
  });

  it('expires an entry once its TTL has elapsed', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('k', 'value');
    vi.advanceTimersByTime(1000);
    expect(cache.get('k')).toBeUndefined();
  });

  it('stores entries under independent keys', () => {
    const cache = new TtlCache<number>(1000);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
  });

  it('overwrites an existing key and restarts its TTL', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('k', 'old');
    vi.advanceTimersByTime(800);
    cache.set('k', 'new');
    vi.advanceTimersByTime(800);
    expect(cache.get('k')).toBe('new');
  });

  it('clear drops every entry', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', 'x');
    cache.set('b', 'y');
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });
});
