// backend/daily/dailyRolloverScheduler.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./eagerDailyRaceCreation.js', () => ({
  eagerlyCreateTodaysDailyRace: vi.fn().mockResolvedValue('ok'),
}));

import { eagerlyCreateTodaysDailyRace } from './eagerDailyRaceCreation.js';
import { startDailyRolloverScheduler } from './dailyRolloverScheduler.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // 22:00 UTC — two hours before the daily rollover.
  vi.setSystemTime(new Date('2026-09-08T22:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

describe('startDailyRolloverScheduler', () => {
  it('does nothing when disabled (local dev)', async () => {
    startDailyRolloverScheduler(false);

    await vi.advanceTimersByTimeAsync(DAY_MS * 2);

    expect(eagerlyCreateTodaysDailyRace).not.toHaveBeenCalled();
  });

  it("creates today's race immediately on startup when enabled", () => {
    const scheduler = startDailyRolloverScheduler(true);

    expect(eagerlyCreateTodaysDailyRace).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('does not fire again before UTC midnight', async () => {
    const scheduler = startDailyRolloverScheduler(true);

    // Right up to midnight (but before the post-midnight buffer elapses).
    await vi.advanceTimersByTimeAsync(TWO_HOURS_MS);

    expect(eagerlyCreateTodaysDailyRace).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("creates the new day's race just after UTC midnight", async () => {
    const scheduler = startDailyRolloverScheduler(true);

    // Cross midnight plus the anti-early-fire buffer.
    await vi.advanceTimersByTimeAsync(TWO_HOURS_MS + 2000);

    expect(eagerlyCreateTodaysDailyRace).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('re-arms itself for each following midnight', async () => {
    const scheduler = startDailyRolloverScheduler(true);

    await vi.advanceTimersByTimeAsync(TWO_HOURS_MS + 2000); // midnight #1
    await vi.advanceTimersByTimeAsync(DAY_MS); // midnight #2

    expect(eagerlyCreateTodaysDailyRace).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

  it('stops firing after stop() is called', async () => {
    const scheduler = startDailyRolloverScheduler(true);
    scheduler.stop();

    await vi.advanceTimersByTimeAsync(DAY_MS * 2);

    expect(eagerlyCreateTodaysDailyRace).toHaveBeenCalledTimes(1);
  });
});
