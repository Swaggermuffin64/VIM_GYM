// backend/daily/dailyRolloverScheduler.ts
/**
 * In-process scheduler that keeps the Race of the Day existing without
 * depending on server restarts.
 *
 * On startup it creates today's race immediately, then arms a timer for the
 * next UTC midnight (plus a small buffer so an early-firing timer can never
 * land on the old date) and re-arms after every rollover. This guarantees
 * each day's race exists moments after midnight even if the server never
 * restarts and nobody plays; lazy creation in routes/daily.ts remains the
 * last-resort fallback.
 *
 * Gated by DAILY_EAGER_CREATE (set only in the production fly.toml) so local
 * dev servers — which share the production database — never pick the day's
 * task set from a dev machine's cache.
 */
import { eagerlyCreateTodaysDailyRace } from './eagerDailyRaceCreation.js';
import { msUntilNextUtcMidnight } from './dailyDate.js';

/**
 * Fired this long after UTC midnight rather than exactly at it: timers can
 * fire marginally early, and a pre-midnight firing would compute yesterday's
 * date and skip creating the new day's race.
 */
const ROLLOVER_BUFFER_MS = 1000;

/**
 * Starts the rollover scheduler. Returns a handle whose stop() disarms the
 * timer (used by tests; production runs it for the process lifetime).
 */
export function startDailyRolloverScheduler(enabled: boolean): {
  stop: () => void;
} {
  if (!enabled) {
    console.log(
      '[daily] rollover scheduler disabled (DAILY_EAGER_CREATE unset); relying on lazy creation'
    );
    return { stop: () => {} };
  }

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const armForNextMidnight = () => {
    if (stopped) return;
    const delayMs = msUntilNextUtcMidnight(new Date()) + ROLLOVER_BUFFER_MS;
    timer = setTimeout(() => {
      // eagerlyCreateTodaysDailyRace never rejects, so re-arming in .finally
      // keeps the chain alive on both success and failure.
      void eagerlyCreateTodaysDailyRace(true).finally(armForNextMidnight);
    }, delayMs);
    // Never hold the process open just for this timer.
    timer.unref?.();
  };

  void eagerlyCreateTodaysDailyRace(true);
  armForNextMidnight();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
