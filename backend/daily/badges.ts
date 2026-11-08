// backend/daily/badges.ts
/**
 * Streaks, badges, and placing summaries for Race of the Day, derived from a
 * user's per-day results (db/dailyResults.ts queryDailyHistory). Pure: the
 * caller supplies "today", so everything here is deterministic and testable.
 *
 * Day rules (spec: docs/superpowers/specs/2026-10-19-daily-efficiency-badges-replays-design.md):
 * - A raced day is any day with a finished attempt, today included.
 * - Podiums and wins only count on closed days (before today): today's ranks
 *   are still moving.
 * - The participation streak stays alive through today until a full UTC day
 *   is missed; the podium streak is alive if it ran through yesterday.
 */
import type { DailyDayResult } from '../db/dailyResults.js';

/** Every badge a player can earn. Order is display order. */
export const BADGE_IDS = [
  'days_7',
  'days_30',
  'days_100',
  'streak_7',
  'streak_30',
  'podium_streak_3',
  'podium_streak_7',
  'first_win',
  'first_perfect',
] as const;

export type BadgeId = (typeof BADGE_IDS)[number];

export function isBadgeId(value: unknown): value is BadgeId {
  return (
    typeof value === 'string' &&
    (BADGE_IDS as readonly string[]).includes(value)
  );
}

export interface EarnedBadge {
  id: BadgeId;
  /** The race date (YYYY-MM-DD) the badge was earned on. */
  earnedOn: string;
}

export interface Streak {
  current: number;
  longest: number;
}

export interface Placing {
  rank: number;
  racers: number;
  raceDate: string;
}

export interface DailySummary {
  badges: EarnedBadge[];
  streaks: { participation: Streak; podium: Streak };
  counters: {
    daysRaced: number;
    speedWins: number;
    efficiencyWins: number;
    podiums: number;
  };
  personalBests: {
    bestSpeedPlacing: Placing | null;
    bestEfficiencyPlacing: Placing | null;
    fastest: { ms: number; raceDate: string } | null;
    mostEfficient: { efficiency: number; raceDate: string } | null;
  };
  /** Most recent raced days first, at most RECENT_DAYS. */
  recent: DailyDayResult[];
}

/** Compact badge summary shown beside a name on the leaderboard. */
export interface BadgeChips {
  streak: number;
  podiumStreak: number;
  wins: number;
}

export const RECENT_DAYS = 14;

const PODIUM_MAX_RANK = 3;

/** 'YYYY-MM-DD' shifted by `days` UTC calendar days. */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

interface Run {
  start: string;
  end: string;
  length: number;
}

/** Splits ascending, de-duplicated date keys into consecutive-day runs. */
function consecutiveRuns(dates: string[]): Run[] {
  const runs: Run[] = [];
  for (const date of dates) {
    const last = runs[runs.length - 1];
    if (last && addDays(last.end, 1) === date) {
      last.end = date;
      last.length += 1;
    } else {
      runs.push({ start: date, end: date, length: 1 });
    }
  }
  return runs;
}

/**
 * Current and longest streak over `runs`. The latest run is current while it
 * ends on one of `aliveThrough`.
 */
function streakOf(runs: Run[], aliveThrough: string[]): Streak {
  const last = runs[runs.length - 1];
  return {
    current: last && aliveThrough.includes(last.end) ? last.length : 0,
    longest: runs.reduce((max, r) => Math.max(max, r.length), 0),
  };
}

/** The date a run of `n` consecutive days was first completed, if ever. */
function firstRunReaching(runs: Run[], n: number): string | null {
  const run = runs.find((r) => r.length >= n);
  return run ? addDays(run.start, n - 1) : null;
}

function isPodium(day: DailyDayResult): boolean {
  return (
    day.speedRank <= PODIUM_MAX_RANK ||
    (day.efficiencyRank !== null && day.efficiencyRank <= PODIUM_MAX_RANK)
  );
}

/**
 * The better of two placings: lower rank, then the bigger field, then the
 * more recent day.
 */
function betterPlacing(a: Placing | null, b: Placing): Placing {
  if (!a) return b;
  if (b.rank !== a.rank) return b.rank < a.rank ? b : a;
  if (b.racers !== a.racers) return b.racers > a.racers ? b : a;
  return b.raceDate > a.raceDate ? b : a;
}

/**
 * Summarizes one user's daily history. `days` must belong to a single user;
 * order doesn't matter. `today` is the current UTC date key.
 */
export function summarizeDailyHistory(
  days: DailyDayResult[],
  today: string
): DailySummary {
  const sorted = [...days].sort((a, b) =>
    a.raceDate < b.raceDate ? -1 : a.raceDate > b.raceDate ? 1 : 0
  );
  const yesterday = addDays(today, -1);
  const closed = sorted.filter((d) => d.raceDate < today);

  const racedRuns = consecutiveRuns(sorted.map((d) => d.raceDate));
  const podiumDays = closed.filter(isPodium);
  const podiumRuns = consecutiveRuns(podiumDays.map((d) => d.raceDate));

  const badges: EarnedBadge[] = [];
  const earn = (id: BadgeId, earnedOn: string | null | undefined) => {
    if (earnedOn) badges.push({ id, earnedOn });
  };
  earn('days_7', sorted[6]?.raceDate);
  earn('days_30', sorted[29]?.raceDate);
  earn('days_100', sorted[99]?.raceDate);
  earn('streak_7', firstRunReaching(racedRuns, 7));
  earn('streak_30', firstRunReaching(racedRuns, 30));
  earn('podium_streak_3', firstRunReaching(podiumRuns, 3));
  earn('podium_streak_7', firstRunReaching(podiumRuns, 7));
  earn(
    'first_win',
    closed.find((d) => d.speedRank === 1 || d.efficiencyRank === 1)?.raceDate
  );
  earn(
    'first_perfect',
    sorted.find((d) => d.efficiency !== null && d.efficiency >= 1)?.raceDate
  );

  let bestSpeedPlacing: Placing | null = null;
  let bestEfficiencyPlacing: Placing | null = null;
  for (const d of closed) {
    bestSpeedPlacing = betterPlacing(bestSpeedPlacing, {
      rank: d.speedRank,
      racers: d.racers,
      raceDate: d.raceDate,
    });
    if (d.efficiencyRank !== null && d.efficiencyRacers !== null) {
      bestEfficiencyPlacing = betterPlacing(bestEfficiencyPlacing, {
        rank: d.efficiencyRank,
        racers: d.efficiencyRacers,
        raceDate: d.raceDate,
      });
    }
  }

  let fastest: DailySummary['personalBests']['fastest'] = null;
  let mostEfficient: DailySummary['personalBests']['mostEfficient'] = null;
  for (const d of sorted) {
    if (!fastest || d.bestMs < fastest.ms) {
      fastest = { ms: d.bestMs, raceDate: d.raceDate };
    }
    if (
      d.efficiency !== null &&
      (!mostEfficient || d.efficiency > mostEfficient.efficiency)
    ) {
      mostEfficient = { efficiency: d.efficiency, raceDate: d.raceDate };
    }
  }

  return {
    badges,
    streaks: {
      participation: streakOf(racedRuns, [today, yesterday]),
      podium: streakOf(podiumRuns, [yesterday]),
    },
    counters: {
      daysRaced: sorted.length,
      speedWins: closed.filter((d) => d.speedRank === 1).length,
      efficiencyWins: closed.filter((d) => d.efficiencyRank === 1).length,
      podiums: podiumDays.length,
    },
    personalBests: {
      bestSpeedPlacing,
      bestEfficiencyPlacing,
      fastest,
      mostEfficient,
    },
    recent: sorted.slice(-RECENT_DAYS).reverse(),
  };
}

/** The leaderboard-row badge summary for one user's summary. */
export function chipsFromSummary(summary: DailySummary): BadgeChips {
  return {
    streak: summary.streaks.participation.current,
    podiumStreak: summary.streaks.podium.current,
    wins: summary.counters.speedWins + summary.counters.efficiencyWins,
  };
}

/**
 * Badge chips for every user in `history` (which may mix users), keyed by
 * user id. Users with no history are absent.
 */
export function chipsByUser(
  history: DailyDayResult[],
  today: string
): Map<string, BadgeChips> {
  const byUser = new Map<string, DailyDayResult[]>();
  for (const day of history) {
    const list = byUser.get(day.userId);
    if (list) list.push(day);
    else byUser.set(day.userId, [day]);
  }
  const chips = new Map<string, BadgeChips>();
  for (const [userId, days] of byUser) {
    chips.set(userId, chipsFromSummary(summarizeDailyHistory(days, today)));
  }
  return chips;
}
