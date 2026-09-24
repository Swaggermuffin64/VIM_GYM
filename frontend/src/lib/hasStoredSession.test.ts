// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { hasStoredSession } from './hasStoredSession';

beforeEach(() => {
  window.localStorage.clear();
});

describe('hasStoredSession', () => {
  it('is false with empty storage', () => {
    expect(hasStoredSession()).toBe(false);
  });

  it('is true when a supabase auth token is present', () => {
    window.localStorage.setItem('sb-abcdef-auth-token', '{"access_token":"x"}');
    expect(hasStoredSession()).toBe(true);
  });

  it('ignores unrelated keys', () => {
    window.localStorage.setItem('theme', 'dark');
    window.localStorage.setItem('sb-something-else', 'x');
    expect(hasStoredSession()).toBe(false);
  });

  it('does not throw when localStorage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    expect(() => hasStoredSession()).not.toThrow();
    expect(hasStoredSession()).toBe(false);
    if (original) Object.defineProperty(window, 'localStorage', original);
  });
});
