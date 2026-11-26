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
import type { PlayerStats, RecentGame } from '../api/profile';
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
 * Headline numbers over the activity calendar: how many days had a run,
 * and total wins (multiplayer wins plus daily wins). Only days inside the
 * grid window (the `weeks` columns ending at `today`) count, so the header
 * always agrees with the squares drawn by `activityGrid`.
 */
export function activitySummary(
  activity: PlayerStats['activity'],
  winDates: string[],
  today: string,
  weeks = 26
): { daysActive: number; wins: number } {
  const todayMs = dayKeyToMs(today);
  const daysSinceMonday = (new Date(todayMs).getUTCDay() + 6) % 7;
  const gridStart = msToDayKey(
    todayMs - (daysSinceMonday + (weeks - 1) * 7) * DAY_MS
  );
  const inWindow = (day: string) => day >= gridStart && day <= today;
  const days = activity.filter((a) => inWindow(a.day));
  return {
    daysActive: days.filter((a) => a.runs > 0).length,
    wins:
      days.reduce((sum, a) => sum + a.multiplayerWins, 0) +
      winDates.filter(inWindow).length,
  };
}

/**
 * The Monday (UTC `YYYY-MM-DD`) of each of the last `weeks` weeks, oldest
 * first, the last being the week containing `today`. The fixed x-axis of the
 * race-time chart, so weeks without finished runs show up as gaps.
 */
export function weekStartAxis(today: string, weeks = 12): string[] {
  const todayMs = dayKeyToMs(today);
  const daysSinceMonday = (new Date(todayMs).getUTCDay() + 6) % 7;
  const thisMondayMs = todayMs - daysSinceMonday * DAY_MS;
  return Array.from({ length: weeks }, (_, i) =>
    msToDayKey(thisMondayMs - (weeks - 1 - i) * 7 * DAY_MS)
  );
}

/**
 * How the last-30-days average race time compares with the 30 days before:
 * the size of the change and whether it got faster. Null when either
 * average is unknown, or when the change rounds to zero at the one-decimal
 * display precision (under 50ms), so equal averages show no delta.
 */
export function raceTimeDelta(
  avg30d: number | null,
  prev30d: number | null
): { ms: number; faster: boolean } | null {
  if (avg30d === null || prev30d === null) return null;
  const ms = Math.abs(avg30d - prev30d);
  if (ms < 50) return null;
  return { ms, faster: avg30d < prev30d };
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

/** A placing on one daily board: rank out of that board's field. */
export interface BoardPlacing {
  rank: number;
  racers: number;
}

/**
 * One row of the "Recent games" list. A Race of the Day is one row per day
 * (all attempts that day folded together, with both board placings and the
 * day's best time); every other mode is one row per game.
 */
export type RecentActivityRow =
  | {
      kind: 'daily';
      /** The race's UTC date key. */
      day: string;
      bestMs: number;
      speed: BoardPlacing;
      /** Null when no attempt that day had complete keystroke data. */
      efficiency: BoardPlacing | null;
    }
  | { kind: 'game'; game: RecentGame };

/** Rows the "Recent games" list shows at most. */
export const RECENT_ACTIVITY_LIMIT = 8;

/**
 * Builds the "Recent games" list: daily attempts collapse into one row per
 * raced day (from the daily profile's recent days, so placings are always
 * present), other games stay one row each, newest first, capped at `limit`.
 * A daily day sorts by its latest attempt in `games`, or midday UTC when none
 * of its attempts are in the list.
 */
export function recentActivity(
  games: RecentGame[],
  dailyRecent: DailyHistoryDay[],
  limit = RECENT_ACTIVITY_LIMIT
): RecentActivityRow[] {
  const latestDailyAttempt = new Map<string, string>();
  for (const game of games) {
    if (game.playMode !== 'daily') continue;
    const day = game.startedAt.slice(0, 10);
    const seen = latestDailyAttempt.get(day);
    if (!seen || game.startedAt > seen)
      latestDailyAttempt.set(day, game.startedAt);
  }

  const dailyRows = dailyRecent.map((d) => ({
    sortKey:
      latestDailyAttempt.get(d.raceDate) ?? `${d.raceDate}T12:00:00.000Z`,
    row: {
      kind: 'daily' as const,
      day: d.raceDate,
      bestMs: d.bestMs,
      speed: { rank: d.speedRank, racers: d.racers },
      efficiency:
        d.efficiencyRank !== null && d.efficiencyRacers !== null
          ? { rank: d.efficiencyRank, racers: d.efficiencyRacers }
          : null,
    },
  }));
  const gameRows = games
    .filter((game) => game.playMode !== 'daily')
    .map((game) => ({
      sortKey: game.startedAt,
      row: { kind: 'game' as const, game },
    }));

  return [...dailyRows, ...gameRows]
    .sort((a, b) =>
      a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0
    )
    .slice(0, limit)
    .map((entry) => entry.row);
}
