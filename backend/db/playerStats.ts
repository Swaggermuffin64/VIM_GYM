/**
 * Read-only aggregate queries backing the profile page's stats section.
 * Includes the per-user volume aggregates (all-mode run count, multiplayer
 * split, 26-week activity calendar, weekly and 30-day race-time trends)
 * that feed the bento layout; all date bucketing is UTC.
 *
 * Counterpart to the writers in db/stats.ts: null-pool tolerant, logs
 * failures with the pg error code, and degrades to a zero-state so the
 * profile page renders identity-only instead of erroring.
 */
import { getPool } from './pool.js';

export interface RecentGame {
  playMode: string;
  position: number | null;
  finished: boolean;
  leftRace: boolean;
  totalTimeMs: number | null;
  startedAt: Date;
}

/** One UTC calendar day on which the player had at least one run. */
export interface ActivityDay {
  /** UTC date, YYYY-MM-DD. */
  day: string;
  /** Runs started that day, all modes. */
  runs: number;
  /** Quick-play / private-match wins that day. */
  multiplayerWins: number;
}

/** Average finished-run time for one UTC week (weeks without finishes are omitted). */
export interface WeeklyRaceTime {
  /** Monday of the week, UTC, YYYY-MM-DD. */
  weekStart: string;
  avgMs: number;
}

/** How many weeks back the activity calendar reaches. */
export const ACTIVITY_WEEKS = 26;
/** How many weeks back the weekly race-time trend reaches. */
export const RACE_TIME_WEEKS = 12;

export interface PlayerStats {
  racesPlayed: number;
  wins: number;
  bestRaceMs: number | null;
  tasksCompleted: number;
  avgTaskMs: number | null;
  /** Mean session time over finished sessions in ALL modes incl. practice. */
  avgRaceMs: number | null;
  /**
   * Mean of per-attempt optimal/actual keystroke ratios, capped at 1.0
   * (beating the recommended sequence reads as 100%). Only attempts where
   * both counts exist contribute; null when none qualify.
   */
  avgTaskEfficiency: number | null;
  /** Number of attempts behind avgTaskEfficiency (frontend hides small N). */
  efficiencySample: number;
  recentGames: RecentGame[];
  /** Runs in every mode, practice and daily included. */
  totalRuns: number;
  /** Quick-play + private-match record only (the basis of win rate). */
  multiplayer: { races: number; wins: number };
  /** UTC days with at least one run in the last ACTIVITY_WEEKS, ascending. */
  activity: ActivityDay[];
  /** Weekly mean finished-run time over the last RACE_TIME_WEEKS, ascending. */
  raceTimeWeekly: WeeklyRaceTime[];
  /** Mean finished-run time, all modes, runs started in the last 30 days. */
  avgRaceMs30d: number | null;
  /** Same mean for runs started 30 to 60 days ago. */
  avgRaceMsPrev30d: number | null;
}

const ZERO_STATS: Readonly<PlayerStats> = Object.freeze({
  racesPlayed: 0,
  wins: 0,
  bestRaceMs: null,
  tasksCompleted: 0,
  avgTaskMs: null,
  avgRaceMs: null,
  avgTaskEfficiency: null,
  efficiencySample: 0,
  recentGames: Object.freeze([]) as readonly RecentGame[] as RecentGame[],
  totalRuns: 0,
  multiplayer: Object.freeze({ races: 0, wins: 0 }),
  activity: Object.freeze([]) as readonly ActivityDay[] as ActivityDay[],
  raceTimeWeekly: Object.freeze(
    []
  ) as readonly WeeklyRaceTime[] as WeeklyRaceTime[],
  avgRaceMs30d: null,
  avgRaceMsPrev30d: null,
});

/** Default number of recent games returned for the profile page list. */
export const RECENT_GAMES_LIMIT = 8;

/**
 * Aggregates a player's racing record, task totals, all-mode session time,
 * keystroke efficiency, recent games, and the all-mode volume/trend
 * aggregates in six queries (kept at or below the
 * connection pool size so they can run concurrently). Returns the
 * zero-state when persistence is disabled or a query fails — callers never
 * need a try/catch.
 */
export async function getPlayerStats(
  userId: string,
  recentLimit: number = RECENT_GAMES_LIMIT
): Promise<PlayerStats> {
  const pool = getPool();
  if (!pool) {
    console.warn(
      '[playerStats] getPlayerStats skipped: no pool (is DATABASE_URL set?)'
    );
    return ZERO_STATS;
  }
  try {
    const [racing, tasks, efficiency, recent, activityRows, weeklyRows] =
      await Promise.all([
        pool.query<{
          races_played: number;
          wins: number;
          best_race_ms: number | null;
          avg_race_ms: number | null;
          total_runs: number;
          multiplayer_races: number;
          multiplayer_wins: number;
          avg_30d: number | null;
          avg_prev_30d: number | null;
        }>(
          `SELECT
           (COUNT(*) FILTER (WHERE g.play_mode <> 'practice'))::int AS races_played,
           (COUNT(*) FILTER (
              WHERE g.play_mode <> 'practice' AND gp.position = 1
           ))::int AS wins,
           MIN(gp.total_time_ms) FILTER (
             WHERE gp.finished AND g.play_mode <> 'practice') AS best_race_ms,
           ROUND(AVG(gp.total_time_ms) FILTER (WHERE gp.finished))::int
             AS avg_race_ms,
           COUNT(*)::int AS total_runs,
           (COUNT(*) FILTER (WHERE g.play_mode IN ('quick_play', 'private_match')))::int
             AS multiplayer_races,
           (COUNT(*) FILTER (
              WHERE g.play_mode IN ('quick_play', 'private_match') AND gp.position = 1
           ))::int AS multiplayer_wins,
           ROUND(AVG(gp.total_time_ms) FILTER (
             WHERE gp.finished AND g.started_at >= now() - interval '30 days'))::int
             AS avg_30d,
           ROUND(AVG(gp.total_time_ms) FILTER (
             WHERE gp.finished
               AND g.started_at < now() - interval '30 days'
               AND g.started_at >= now() - interval '60 days'))::int
             AS avg_prev_30d
         FROM game_players gp
         JOIN games g ON g.id = gp.game_id
         WHERE gp.user_id = $1`,
          [userId]
        ),
        pool.query<{ tasks_completed: number; avg_task_ms: number | null }>(
          `SELECT
           COUNT(*)::int AS tasks_completed,
           ROUND(AVG(duration_ms))::int AS avg_task_ms
         FROM task_attempts
         WHERE user_id = $1`,
          [userId]
        ),
        pool.query<{
          avg_task_efficiency: number | null;
          efficiency_sample: number;
        }>(
          `SELECT
           AVG(LEAST(1.0, t.optimal_keystroke_count::float8 / ta.keystroke_count))
             AS avg_task_efficiency,
           COUNT(*)::int AS efficiency_sample
         FROM task_attempts ta
         JOIN tasks t ON t.content_hash = ta.task_hash
         WHERE ta.user_id = $1
           AND ta.keystroke_count > 0
           AND t.optimal_keystroke_count IS NOT NULL`,
          [userId]
        ),
        pool.query<{
          play_mode: string;
          position: number | null;
          finished: boolean;
          left_race: boolean;
          total_time_ms: number | null;
          started_at: Date;
        }>(
          `SELECT g.play_mode, gp.position, gp.finished, gp.left_race,
                gp.total_time_ms, g.started_at
         FROM game_players gp
         JOIN games g ON g.id = gp.game_id
         WHERE gp.user_id = $1
         ORDER BY g.started_at DESC
         LIMIT $2`,
          [userId, recentLimit]
        ),
        pool.query<{ day: string; runs: number; multiplayer_wins: number }>(
          `SELECT
           to_char((g.started_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS runs,
           (COUNT(*) FILTER (
              WHERE g.play_mode IN ('quick_play', 'private_match') AND gp.position = 1
           ))::int AS multiplayer_wins
         FROM game_players gp
         JOIN games g ON g.id = gp.game_id
         WHERE gp.user_id = $1
           AND g.started_at >= now() - ($2 * interval '1 week')
         GROUP BY 1
         ORDER BY 1`,
          [userId, ACTIVITY_WEEKS]
        ),
        pool.query<{ week_start: string; avg_ms: number }>(
          `SELECT
           to_char(date_trunc('week', g.started_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')
             AS week_start,
           ROUND(AVG(gp.total_time_ms))::int AS avg_ms
         FROM game_players gp
         JOIN games g ON g.id = gp.game_id
         WHERE gp.user_id = $1
           AND gp.finished
           AND g.started_at >= now() - ($2 * interval '1 week')
         GROUP BY 1
         ORDER BY 1`,
          [userId, RACE_TIME_WEEKS]
        ),
      ]);
    const r = racing.rows[0]!;
    const t = tasks.rows[0]!;
    const e = efficiency.rows[0]!;
    return {
      racesPlayed: r.races_played,
      wins: r.wins,
      bestRaceMs: r.best_race_ms,
      tasksCompleted: t.tasks_completed,
      avgTaskMs: t.avg_task_ms,
      avgRaceMs: r.avg_race_ms,
      avgTaskEfficiency: e.avg_task_efficiency,
      efficiencySample: e.efficiency_sample,
      recentGames: recent.rows.map((row) => ({
        playMode: row.play_mode,
        position: row.position,
        finished: row.finished,
        leftRace: row.left_race,
        totalTimeMs: row.total_time_ms,
        startedAt: row.started_at,
      })),
      totalRuns: r.total_runs,
      multiplayer: {
        races: r.multiplayer_races,
        wins: r.multiplayer_wins,
      },
      activity: activityRows.rows.map((row) => ({
        day: row.day,
        runs: row.runs,
        multiplayerWins: row.multiplayer_wins,
      })),
      raceTimeWeekly: weeklyRows.rows.map((row) => ({
        weekStart: row.week_start,
        avgMs: row.avg_ms,
      })),
      avgRaceMs30d: r.avg_30d,
      avgRaceMsPrev30d: r.avg_prev_30d,
    };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    console.error('[playerStats] getPlayerStats failed', { code, err });
    return ZERO_STATS;
  }
}
