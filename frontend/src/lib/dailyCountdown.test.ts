// @vitest-environment jsdom
/**
 * Tests for the shared daily-rollover countdown: the pure time math and the
 * ticking hook used by the home page and the daily page.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import {
  msUntilNextUtcMidnight,
  formatCountdown,
  useUtcMidnightCountdown,
} from './dailyCountdown';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('msUntilNextUtcMidnight', () => {
  it('counts the remainder of the UTC day', () => {
    const now = Date.UTC(2026, 8, 2, 16, 17, 47);
    // 07:42:13 left until 2026-09-03T00:00:00Z.
    expect(msUntilNextUtcMidnight(now)).toBe((7 * 3600 + 42 * 60 + 13) * 1000);
  });

  it('returns a full day at exactly UTC midnight', () => {
    const now = Date.UTC(2026, 8, 2, 0, 0, 0);
    expect(msUntilNextUtcMidnight(now)).toBe(24 * 3600 * 1000);
  });
});

describe('formatCountdown', () => {
  it('zero-pads hours, minutes, and seconds', () => {
    expect(formatCountdown((7 * 3600 + 42 * 60 + 13) * 1000)).toBe('07:42:13');
    expect(formatCountdown(9 * 1000)).toBe('00:00:09');
    expect(formatCountdown(0)).toBe('00:00:00');
  });
});

describe('useUtcMidnightCountdown', () => {
  it('returns an empty string while disabled', () => {
    const { result } = renderHook(() => useUtcMidnightCountdown(false));
    expect(result.current).toBe('');
  });

  it('ticks down once a second while enabled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 2, 16, 17, 47)));

    const { result } = renderHook(() => useUtcMidnightCountdown(true));
    expect(result.current).toBe('07:42:13');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe('07:42:12');
  });

  it('stops ticking when disabled again', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 2, 16, 17, 47)));

    const { result, rerender } = renderHook(
      ({ on }) => useUtcMidnightCountdown(on),
      { initialProps: { on: true } }
    );
    expect(result.current).toBe('07:42:13');

    rerender({ on: false });
    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe('');
  });
});
