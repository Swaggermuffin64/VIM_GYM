/**
 * Pure view derivations for the bento profile page: they turn the daily
 * profile and the player stats into the exact shapes the tiles draw
 * (best finish, week ticks, activity calendar, trophy case, showcase).
 *
 * No React and no I/O. Every date is a `YYYY-MM-DD` UTC key, and `today` is
 * always passed in so the results are deterministic and easy to test.
 */
import type {
  DailyHistoryDay,
  DailyPlacingRecord,
  DailyProfile,
  EarnedBadge,
} from '../api/daily';
import type { PlayerStats } from '../api/profile';
import { BADGE_CATALOG, badgeInfo, formatEfficiency } from './dailyBadges';
import type { BadgeInfo } from './dailyBadges';

const DAY_MS = 24 * 60 * 60 * 1000;
const FLAWLESS_BADGE_ID = 'first_perfect';
const MAX_SHOWCASED_BADGES = 3;

/** Parses a `YYYY-MM-DD` key as midnight UTC, in epoch milliseconds. */
function dayKeyToMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** The `YYYY-MM-DD` UTC key for an epoch-millisecond instant. */
function msToDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The better of the user's best speed and best efficiency daily placings:
 * lower rank wins, and on equal rank the larger field wins. Null when the
 * user has neither. Feeds the "Best finish" stat.
 */
export function bestFinish(
  pb: DailyProfile['personalBests']
): DailyPlacingRecord | null {
  const { bestSpeedPlacing: speed, bestEfficiencyPlacing: efficiency } = pb;
  if (!speed) return efficiency;
  if (!efficiency) return speed;
  if (speed.rank !== efficiency.rank) {
    return speed.rank < efficiency.rank ? speed : efficiency;
  }
  return speed.racers >= efficiency.racers ? speed : efficiency;
}

/**
 * The last seven UTC days, oldest first, ending today: 'raced' when the user
 * raced that day, otherwise 'missed' for a past day and 'open' for today
 * (still possible to race). Feeds the weekly ticks on the daily tile.
 */
export function weekTicks(
  recent: DailyHistoryDay[],
  today: string
): Array<'raced' | 'missed' | 'open'> {
  const racedDays = new Set(recent.map((d) => d.raceDate));
  const todayMs = dayKeyToMs(today);
  return Array.from({ length: 7 }, (_, i) => {
    const day = msToDayKey(todayMs - (6 - i) * DAY_MS);
    if (racedDays.has(day)) return 'raced';
    return day === today ? 'open' : 'missed';
  });
}

/** One square of the activity calendar. */
export interface ActivityCell {
  day: string;
  runs: number;
  won: boolean;
  /** True for days after `today` (the rest of the current week). */
  future: boolean;
}

/**
 * The activity calendar as `weeks` columns of 7 rows (Monday to Sunday),
 * the last column being the week containing `today`. A day is `won` when it
 * has a multiplayer win or is one of the daily `winDates`.
 */
export function activityGrid(
  activity: PlayerStats['activity'],
  winDates: string[],
  today: string,
  weeks = 26
): ActivityCell[][] {
  const activityByDay = new Map(activity.map((a) => [a.day, a]));
  const winDateSet = new Set(winDates);
  const todayMs = dayKeyToMs(today);
  const daysSinceMonday = (new Date(todayMs).getUTCDay() + 6) % 7;
  const gridStartMs = todayMs - (daysSinceMonday + (weeks - 1) * 7) * DAY_MS;

  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, row) => {
      const dayMs = gridStartMs + (week * 7 + row) * DAY_MS;
      const day = msToDayKey(dayMs);
      const entry = activityByDay.get(day);
      return {
        day,
        runs: entry?.runs ?? 0,
        won: (entry?.multiplayerWins ?? 0) > 0 || winDateSet.has(day),
        future: dayMs > todayMs,
      };
    })
  );
}

/** Colour intensity bucket for an activity square: 0, 1-2, 3-5, 6+ runs. */
export function activityLevel(runs: number): 0 | 1 | 2 | 3 {
  if (runs <= 0) return 0;
  if (runs <= 2) return 1;
  if (runs <= 5) return 2;
  return 3;
}

/**
 * Headline numbers under the activity calendar: how many days had a run,
 * and total wins (multiplayer wins plus daily wins).
 */
export function activitySummary(
  activity: PlayerStats['activity'],
  winDates: string[]
): { daysActive: number; wins: number } {
  return {
    daysActive: activity.filter((a) => a.runs > 0).length,
    wins:
      activity.reduce((sum, a) => sum + a.multiplayerWins, 0) + winDates.length,
  };
}

/**
 * How the last-30-days average race time compares with the 30 days before:
 * the size of the change and whether it got faster. Null when either
 * average is unknown.
 */
export function raceTimeDelta(
  avg30d: number | null,
  prev30d: number | null
): { ms: number; faster: boolean } | null {
  if (avg30d === null || prev30d === null) return null;
  return { ms: Math.abs(avg30d - prev30d), faster: avg30d < prev30d };
}

/** One badge in the trophy case, earned or still locked. */
export interface TrophyEntry {
  info: BadgeInfo;
  /** UTC day the badge was earned; null while locked. */
  earnedOn: string | null;
  have: number;
  need: number;
  /** Progress toward the badge, 0 to 1. */
  fraction: number;
  progressText: string;
}

/** Progress numbers and caption for one badge; Flawless uses best efficiency. */
function trophyProgress(
  info: BadgeInfo,
  profile: DailyProfile
): Pick<TrophyEntry, 'have' | 'need' | 'fraction' | 'progressText'> {
  const [have, need] = info.progress(profile);
  if (info.id === FLAWLESS_BADGE_ID) {
    const best = profile.personalBests.mostEfficient?.efficiency;
    return {
      have,
      need,
      fraction: best ?? 0,
      progressText:
        best === undefined ? 'Not yet' : `best ${formatEfficiency(best)}`,
    };
  }
  return {
    have,
    need,
    fraction: Math.min(have / need, 1),
    progressText: `${have} / ${need}`,
  };
}

/**
 * Every catalog badge as a trophy-case entry: earned ones first, most
 * recently earned on top, then locked ones, closest to unlocking first.
 */
export function trophyCase(profile: DailyProfile): TrophyEntry[] {
  const earnedOnById = new Map(profile.badges.map((b) => [b.id, b.earnedOn]));
  const entries = BADGE_CATALOG.map((info) => ({
    info,
    earnedOn: earnedOnById.get(info.id) ?? null,
    ...trophyProgress(info, profile),
  }));
  const earned = entries
    .filter((e) => e.earnedOn !== null)
    .sort((a, b) => (b.earnedOn as string).localeCompare(a.earnedOn as string));
  const locked = entries
    .filter((e) => e.earnedOn === null)
    .sort((a, b) => b.fraction - a.fraction);
  return [...earned, ...locked];
}

/**
 * The (up to three) badges to show on the profile header: the user's
 * showcased picks that are still earned and known, in their chosen order;
 * with none of those, the three most recently earned. Empty when nothing is
 * earned.
 */
export function showcaseBadges(
  showcased: string[],
  earned: EarnedBadge[]
): BadgeInfo[] {
  const earnedIds = new Set(earned.map((b) => b.id));
  const picked = showcased
    .filter((id) => earnedIds.has(id))
    .map((id) => badgeInfo(id))
    .filter((info): info is BadgeInfo => info !== undefined)
    .slice(0, MAX_SHOWCASED_BADGES);
  if (picked.length > 0) return picked;

  return [...earned]
    .sort((a, b) => b.earnedOn.localeCompare(a.earnedOn))
    .map((b) => badgeInfo(b.id))
    .filter((info): info is BadgeInfo => info !== undefined)
    .slice(0, MAX_SHOWCASED_BADGES);
}
