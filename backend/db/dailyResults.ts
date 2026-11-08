/**
 * Read-side queries for the Race of the Day efficiency board, placing history,
 * and badges (spec: docs/superpowers/specs/2026-10-19-daily-efficiency-badges-replays-design.md).
 *
 * Nothing here is stored per day: efficiency and ranks are computed from
 * daily_attempts + task_attempts + tasks on every read, so results cover the
 * whole history of the daily without any backfill. The only write is the
 * seen-badges acknowledgement on profiles.
 *
 * Same conventions as db/daily.ts: null-pool tolerant, logs failures with the
 * pg error code, never throws into request flow.
 */
import { getPool } from './pool.js';

function logSkip(fn: string): void {
  console.warn(`[dailyResults] ${fn} skipped: no pool (is DATABASE_URL set?)`);
}

function logError(fn: string, err: unknown): void {
  const code = (err as { code?: string })?.code;
  console.error(`[dailyResults] ${fn} failed`, { code, err });
}

/**
 * CTEs ranking every scorable attempt's efficiency, restricted to race date
 * `$1` (or every day when `$1` is NULL).
 *
 * attempt_eff — one row per finished attempt whose every task has both a
 *   recorded keystroke count and an optimal count; efficiency is
 *   SUM(optimal) / SUM(actual), capped at 1.0; both sums are kept for display
 *   (optimal_keys, actual_keys). When a task has duplicate
 *   task_attempts rows for the game, the latest one counts.
 * eff_ranked  — each user's best attempt per day (efficiency, then the faster
 *   time on that attempt), ranked within the day by the same ordering.
 */
const EFFICIENCY_CTES = `
  attempt_eff AS (
    SELECT da.user_id, da.race_date, da.duration_ms,
           LEAST(1.0, SUM(t.optimal_keystroke_count)::float8
                        / SUM(ta.keystroke_count)) AS efficiency,
           SUM(t.optimal_keystroke_count)::int AS optimal_keys,
           SUM(ta.keystroke_count)::int AS actual_keys
      FROM daily_attempts da
      JOIN daily_races dr ON dr.race_date = da.race_date
      CROSS JOIN LATERAL unnest(dr.task_hashes) AS h(hash)
      LEFT JOIN tasks t ON t.content_hash = h.hash
      LEFT JOIN LATERAL (
        SELECT keystroke_count
          FROM task_attempts
         WHERE game_id = da.game_id AND task_hash = h.hash
         ORDER BY completed_at DESC
         LIMIT 1
      ) ta ON true
     WHERE da.duration_ms IS NOT NULL
       AND ($1::date IS NULL OR da.race_date = $1::date)
     GROUP BY da.id
    HAVING COUNT(ta.keystroke_count) = COUNT(*)
       AND COUNT(t.optimal_keystroke_count) = COUNT(*)
  ),
  eff_best AS (
    SELECT DISTINCT ON (user_id, race_date)
           user_id, race_date, efficiency, duration_ms, optimal_keys, actual_keys
      FROM attempt_eff
     ORDER BY user_id, race_date, efficiency DESC, duration_ms ASC
  ),
  eff_ranked AS (
    SELECT user_id, race_date, efficiency, duration_ms, optimal_keys, actual_keys,
           RANK() OVER w AS rank,
           COUNT(*) OVER (PARTITION BY race_date) AS racers
      FROM eff_best
    WINDOW w AS (PARTITION BY race_date ORDER BY efficiency DESC, duration_ms ASC)
  )`;

// ---------------------------------------------------------------------------
// Efficiency board
// ---------------------------------------------------------------------------

/** One racer's row on the efficiency board for a day. */
export interface EfficiencyBoardRow {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Best attempt's efficiency, 0..1. */
  efficiency: number;
  /** Duration of that same attempt (the tiebreak), not the user's best time. */
  durationMs: number;
  /** That attempt's optimal keystroke total across all tasks. */
  optimalKeys: number;
  /** That attempt's actual keystroke total across all tasks. */
  actualKeys: number;
  rank: number;
}

/**
 * Returns the whole efficiency-ranked field for a race date, best first.
 * The route slices top-N / neighborhood / last place from this in memory —
 * a day's field is small, and one query keeps the three views consistent.
 * Returns [] on no pool or error.
 */
export async function queryEfficiencyBoard(
  raceDate: string
): Promise<EfficiencyBoardRow[]> {
  const pool = getPool();
  if (!pool) {
    logSkip('queryEfficiencyBoard');
    return [];
  }
  try {
    const res = await pool.query<{
      user_id: string;
      display_name: string;
      avatar_url: string | null;
      efficiency: number;
      duration_ms: number;
      optimal_keys: number;
      actual_keys: number;
      rank: string;
    }>(
      `WITH ${EFFICIENCY_CTES}
      SELECT e.user_id, p.display_name, p.avatar_url,
             e.efficiency, e.duration_ms, e.optimal_keys, e.actual_keys, e.rank
        FROM eff_ranked e JOIN profiles p ON p.id = e.user_id
       ORDER BY e.rank ASC, e.user_id ASC`,
      [raceDate]
    );
    return res.rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      efficiency: Number(r.efficiency),
      durationMs: Number(r.duration_ms),
      optimalKeys: Number(r.optimal_keys),
      actualKeys: Number(r.actual_keys),
      rank: Number(r.rank),
    }));
  } catch (err) {
    logError('queryEfficiencyBoard', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Per-user daily history
// ---------------------------------------------------------------------------

/** One user's result for one day, ranked against that day's whole field. */
export interface DailyDayResult {
  userId: string;
  raceDate: string;
  bestMs: number;
  speedRank: number;
  racers: number;
  /** Null when none of the user's attempts that day were scorable. */
  efficiency: number | null;
  efficiencyMs: number | null;
  /** Key totals of that most efficient attempt; null with efficiency. */
  optimalKeys: number | null;
  actualKeys: number | null;
  efficiencyRank: number | null;
  efficiencyRacers: number | null;
}

/**
 * Returns every day each of `userIds` finished a daily attempt, oldest first,
 * with their speed and efficiency placings. Ranks are computed over each
 * day's full field before filtering to the requested users.
 * Returns [] for an empty id list, on no pool, or on error.
 */
export async function queryDailyHistory(
  userIds: string[]
): Promise<DailyDayResult[]> {
  if (userIds.length === 0) return [];
  const pool = getPool();
  if (!pool) {
    logSkip('queryDailyHistory');
    return [];
  }
  try {
    const res = await pool.query<{
      user_id: string;
      race_date: string;
      best_ms: number;
      speed_rank: string;
      racers: string;
      efficiency: number | null;
      efficiency_ms: number | null;
      optimal_keys: number | null;
      actual_keys: number | null;
      efficiency_rank: string | null;
      efficiency_racers: string | null;
    }>(
      `WITH ${EFFICIENCY_CTES},
      speed AS (
        SELECT user_id, race_date, MIN(duration_ms) AS best_ms
          FROM daily_attempts
         WHERE duration_ms IS NOT NULL
         GROUP BY user_id, race_date
      ),
      speed_ranked AS (
        SELECT user_id, race_date, best_ms,
               RANK() OVER (PARTITION BY race_date ORDER BY best_ms ASC) AS rank,
               COUNT(*) OVER (PARTITION BY race_date) AS racers
          FROM speed
      )
      SELECT s.user_id,
             to_char(s.race_date, 'YYYY-MM-DD') AS race_date,
             s.best_ms,
             s.rank        AS speed_rank,
             s.racers,
             e.efficiency,
             e.duration_ms AS efficiency_ms,
             e.optimal_keys,
             e.actual_keys,
             e.rank        AS efficiency_rank,
             e.racers      AS efficiency_racers
        FROM speed_ranked s
        LEFT JOIN eff_ranked e
          ON e.user_id = s.user_id AND e.race_date = s.race_date
       WHERE s.user_id = ANY ($2::uuid[])
       ORDER BY s.user_id, s.race_date`,
      [null, userIds]
    );
    return res.rows.map((r) => ({
      userId: r.user_id,
      raceDate: r.race_date,
      bestMs: Number(r.best_ms),
      speedRank: Number(r.speed_rank),
      racers: Number(r.racers),
      efficiency: r.efficiency === null ? null : Number(r.efficiency),
      efficiencyMs: r.efficiency_ms === null ? null : Number(r.efficiency_ms),
      optimalKeys: r.optimal_keys === null ? null : Number(r.optimal_keys),
      actualKeys: r.actual_keys === null ? null : Number(r.actual_keys),
      efficiencyRank:
        r.efficiency_rank === null ? null : Number(r.efficiency_rank),
      efficiencyRacers:
        r.efficiency_racers === null ? null : Number(r.efficiency_racers),
    }));
  } catch (err) {
    logError('queryDailyHistory', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Seen-badges acknowledgement
// ---------------------------------------------------------------------------

/**
 * Returns the badge ids the user has already been shown, or null on no
 * pool/error (callers then treat nothing as unseen rather than re-toasting).
 */
export async function getSeenBadges(userId: string): Promise<string[] | null> {
  const pool = getPool();
  if (!pool) {
    logSkip('getSeenBadges');
    return null;
  }
  try {
    const res = await pool.query<{ seen_badges: string[] }>(
      `SELECT seen_badges FROM profiles WHERE id = $1`,
      [userId]
    );
    return res.rows[0]?.seen_badges ?? [];
  } catch (err) {
    logError('getSeenBadges', err);
    return null;
  }
}

/**
 * Adds `badgeIds` to the user's seen set (deduplicated). Returns false on no
 * pool/error.
 */
export async function addSeenBadges(
  userId: string,
  badgeIds: string[]
): Promise<boolean> {
  const pool = getPool();
  if (!pool) {
    logSkip('addSeenBadges');
    return false;
  }
  try {
    await pool.query(
      `UPDATE profiles
          SET seen_badges = ARRAY(
                SELECT DISTINCT unnest(seen_badges || $2::text[])
              )
        WHERE id = $1`,
      [userId, badgeIds]
    );
    return true;
  } catch (err) {
    logError('addSeenBadges', err);
    return false;
  }
}
