// backend/daily/eagerDailyRaceCreation.ts
/**
 * Eager creation of the Race of the Day at backend startup.
 *
 * The daily-restart GitHub Action restarts the Fly machine at 0:00 UTC, so
 * running this on boot guarantees each day's race exists moments after the
 * UTC rollover instead of waiting for the first visitor. Lazy creation in
 * routes/daily.ts remains the fallback for the (rare) case this fails.
 *
 * Gated by an explicit flag (DAILY_EAGER_CREATE, set only in the production
 * fly.toml) so local dev restarts — which share the production database —
 * never pick the day's task set from a dev machine's cache.
 */
import { getOrCreateDailyRace } from '../db/daily.js';
import { pickTasksFromCache } from '../taskPool.js';
import { utcDateKey } from './dailyDate.js';

export type EagerDailyRaceResult = 'ok' | 'skipped' | 'failed';

/**
 * Ensures today's daily race exists. Never throws: startup must not be
 * blocked or crashed by this, since lazy creation covers any failure.
 */
export async function eagerlyCreateTodaysDailyRace(
  enabled: boolean
): Promise<EagerDailyRaceResult> {
  if (!enabled) {
    console.log(
      '[daily] eager race creation disabled (DAILY_EAGER_CREATE unset); relying on lazy creation'
    );
    return 'skipped';
  }
  const raceDate = utcDateKey(new Date());
  try {
    const race = await getOrCreateDailyRace(raceDate, pickTasksFromCache);
    if (!race) {
      console.warn(`[daily] eager race creation failed for ${raceDate}`);
      return 'failed';
    }
    console.log(
      `[daily] race for ${raceDate} ready (${race.taskHashes.length} tasks)`
    );
    return 'ok';
  } catch (err) {
    console.error(`[daily] eager race creation errored for ${raceDate}:`, err);
    return 'failed';
  }
}
