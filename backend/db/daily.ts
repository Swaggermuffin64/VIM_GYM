/**
 * Persistence for Race of the Day: daily_races, daily_attempts, and
 * daily_share_links (spec: docs/superpowers/specs/2026-08-15-race-of-the-day-design.md).
 *
 * Same conventions as db/stats.ts: every function is null-pool tolerant,
 * logs failures with the pg error code, and never throws into request flow.
 * Stats parity (games/game_players/task_attempts) is handled by db/stats.ts;
 * this module owns only the daily-specific tables.
 */
import { randomBytes } from 'node:crypto';
import type { Task } from '../types.js';
import { getPool } from './pool.js';
import { upsertTasksOnFirstUse } from './stats.js';

const SLUG_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SLUG_LENGTH = 10;

/** Maximum number of attempts a user is allowed per daily race. */
export const MAX_DAILY_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Logging helpers (same pattern as db/stats.ts)
// ---------------------------------------------------------------------------

function logSkip(fn: string): void {
  console.warn(`[daily] ${fn} skipped: no pool (is DATABASE_URL set?)`);
}

function logError(fn: string, err: unknown): void {
  const code = (err as { code?: string })?.code;
  console.error(`[daily] ${fn} failed`, { code, err });
}

// ---------------------------------------------------------------------------
// Share slug generation
// ---------------------------------------------------------------------------

/** Random 10-char base62 slug for share links (~59 bits of entropy). */
export function generateShareSlug(): string {
  const bytes = randomBytes(SLUG_LENGTH);
  let slug = '';
  for (let i = 0; i < SLUG_LENGTH; i++) {
    slug += SLUG_ALPHABET[bytes[i]! % SLUG_ALPHABET.length];
  }
  return slug;
}

// ---------------------------------------------------------------------------
// Daily race lifecycle
// ---------------------------------------------------------------------------

/**
 * Returns the canonical task set for `raceDate`, creating it on first request.
 * Concurrent first-requests converge: both insert with ON CONFLICT DO NOTHING
 * and then re-read the winning row. Task JSON is served from the tasks table
 * (not the in-memory cache) so historical days remain reconstructable.
 *
 * Called by routes/daily.ts to serve the day's puzzle set to the client.
 */
export async function getOrCreateDailyRace(
  raceDate: string,
  pickTasks: () => Task[]
): Promise<{ taskHashes: string[]; tasks: Task[] } | null> {
  const pool = getPool();
  if (!pool) {
    logSkip('getOrCreateDailyRace');
    return null;
  }
  try {
    let res = await pool.query<{ task_hashes: string[] }>(
      `SELECT task_hashes FROM daily_races WHERE race_date = $1`,
      [raceDate]
    );
    if (res.rows.length === 0) {
      const picked = pickTasks();
      const hashes = picked
        .map((t) => t.contentHash)
        .filter((h): h is string => typeof h === 'string');
      if (hashes.length !== picked.length) return null;
      await upsertTasksOnFirstUse(picked);
      await pool.query(
        `INSERT INTO daily_races (race_date, task_hashes) VALUES ($1, $2)
         ON CONFLICT (race_date) DO NOTHING`,
        [raceDate, hashes]
      );
      res = await pool.query(
        `SELECT task_hashes FROM daily_races WHERE race_date = $1`,
        [raceDate]
      );
      if (res.rows.length === 0) return null;
    }
    const taskHashes = res.rows[0]!.task_hashes;
    const taskRows = await pool.query<{
      content_hash: string;
      task_json: Task;
    }>(
      `SELECT content_hash, task_json FROM tasks WHERE content_hash = ANY($1)`,
      [taskHashes]
    );
    const byHash = new Map(
      taskRows.rows.map((r) => [r.content_hash, r.task_json])
    );
    const tasks = taskHashes
      .map((h) => byHash.get(h))
      .filter((t): t is Task => t !== undefined);
    if (tasks.length !== taskHashes.length) return null;
    return { taskHashes, tasks };
  } catch (err) {
    logError('getOrCreateDailyRace', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Attempt management
// ---------------------------------------------------------------------------

/**
 * Returns all attempts for a user on a given race date, ordered by attempt
 * number. Used by routes/daily.ts to show the user's attempt history.
 * Returns an empty array on no pool or error.
 */
export async function getDailyAttempts(
  userId: string,
  raceDate: string
): Promise<
  Array<{
    attemptNumber: number;
    durationMs: number | null;
    completedAt: Date | null;
  }>
> {
  const pool = getPool();
  if (!pool) {
    logSkip('getDailyAttempts');
    return [];
  }
  try {
    const res = await pool.query<{
      attempt_number: number;
      duration_ms: number | null;
      completed_at: Date | null;
    }>(
      `SELECT attempt_number, duration_ms, completed_at
         FROM daily_attempts
        WHERE user_id = $1 AND race_date = $2
        ORDER BY attempt_number`,
      [userId, raceDate]
    );
    return res.rows.map((r) => ({
      attemptNumber: r.attempt_number,
      durationMs: r.duration_ms,
      completedAt: r.completed_at,
    }));
  } catch (err) {
    logError('getDailyAttempts', err);
    return [];
  }
}

/**
 * Claims the next attempt slot (1-3) for the user on `raceDate`. The
 * INSERT..SELECT computes MAX+1 and the HAVING clause enforces the cap in the
 * same statement; a concurrent duplicate hits the UNIQUE constraint, inserts
 * nothing, and the single retry recomputes.
 *
 * Called by routes/daily.ts when the user starts a daily attempt and has no
 * abandoned (claimed-but-unraced) slot to reuse; the route checks for one
 * first, so closing the tab or losing the start response never burns a slot.
 */
export async function claimDailyAttempt(
  userId: string,
  raceDate: string
): Promise<
  | { status: 'claimed'; attemptNumber: number }
  | { status: 'out_of_attempts' }
  | { status: 'error' }
> {
  const pool = getPool();
  if (!pool) {
    logSkip('claimDailyAttempt');
    return { status: 'error' };
  }
  try {
    for (let tries = 0; tries < 2; tries++) {
      const res = await pool.query<{ attempt_number: number }>(
        `INSERT INTO daily_attempts (user_id, race_date, attempt_number)
         SELECT $1, $2, COALESCE(MAX(attempt_number), 0) + 1
           FROM daily_attempts
          WHERE user_id = $1 AND race_date = $2
         HAVING COALESCE(MAX(attempt_number), 0) < $3
         ON CONFLICT (user_id, race_date, attempt_number) DO NOTHING
         RETURNING attempt_number`,
        [userId, raceDate, MAX_DAILY_ATTEMPTS]
      );
      if (res.rows.length > 0) {
        return {
          status: 'claimed',
          attemptNumber: res.rows[0]!.attempt_number,
        };
      }
      const count = await pool.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM daily_attempts
          WHERE user_id = $1 AND race_date = $2`,
        [userId, raceDate]
      );
      if (Number(count.rows[0]!.n) >= MAX_DAILY_ATTEMPTS) {
        return { status: 'out_of_attempts' };
      }
      // Lost a concurrent race for the same slot number; retry once.
    }
    return { status: 'error' };
  } catch (err) {
    logError('claimDailyAttempt', err);
    return { status: 'error' };
  }
}

/**
 * Links a game session id to an existing daily attempt row. Called by
 * routes/daily.ts after createGameSession so the attempt tracks which
 * stats-parity game session backs it.
 */
export async function attachGameToDailyAttempt(params: {
  userId: string;
  raceDate: string;
  attemptNumber: number;
  gameId: number;
}): Promise<void> {
  const pool = getPool();
  if (!pool) {
    logSkip('attachGameToDailyAttempt');
    return;
  }
  try {
    await pool.query(
      `UPDATE daily_attempts SET game_id = $4
        WHERE user_id = $1 AND race_date = $2 AND attempt_number = $3`,
      [params.userId, params.raceDate, params.attemptNumber, params.gameId]
    );
  } catch (err) {
    logError('attachGameToDailyAttempt', err);
  }
}

// ---------------------------------------------------------------------------
// Game lookup
// ---------------------------------------------------------------------------

/**
 * Looks up a daily game session that belongs to the given user, for
 * server-side timing validation. Same contract as getPracticeGameForUser
 * (db/stats.ts) but filters on play_mode = 'daily'. Also returns the
 * game's task count so timing validation uses the actual number of tasks
 * rather than a hardcoded constant.
 *
 * Returns null when no matching game exists, or when no pool is configured.
 */
export async function getDailyGameForUser(
  gameId: number,
  userId: string
): Promise<{
  startedAt: Date;
  finishedAt: Date | null;
  taskCount: number;
} | null> {
  const pool = getPool();
  if (!pool) {
    logSkip('getDailyGameForUser');
    return null;
  }
  try {
    const res = await pool.query<{
      started_at: Date;
      finished_at: Date | null;
      task_count: string | null;
    }>(
      `SELECT g.started_at, g.finished_at, array_length(g.task_hashes, 1) AS task_count
         FROM games g
         JOIN game_players gp ON gp.game_id = g.id
        WHERE g.id = $1 AND gp.user_id = $2 AND g.play_mode = 'daily'`,
      [gameId, userId]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      // Spec prescribes 10-task daily composition; fall back to 10 only if
      // task_hashes is NULL (should not happen for valid game rows).
      taskCount: row.task_count !== null ? Number(row.task_count) : 10,
    };
  } catch (err) {
    logError('getDailyGameForUser', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Attempt completion
// ---------------------------------------------------------------------------

/**
 * Finalizes the NULL-duration attempt tied to this game, marking it complete
 * with the given duration. Returns the attempt number and race date so the
 * caller can refresh leaderboard/placing data, or null if no matching
 * uncompleted attempt exists (already completed, unknown game, or no pool).
 *
 * Called by routes/daily.ts when the user finishes all tasks.
 */
export async function completeDailyAttempt(params: {
  userId: string;
  gameId: number;
  durationMs: number;
}): Promise<{ attemptNumber: number; raceDate: string } | null> {
  const pool = getPool();
  if (!pool) {
    logSkip('completeDailyAttempt');
    return null;
  }
  try {
    const res = await pool.query<{
      attempt_number: number;
      race_date: string;
    }>(
      `UPDATE daily_attempts
          SET duration_ms = $3, completed_at = now()
        WHERE user_id = $1 AND game_id = $2 AND duration_ms IS NULL
        RETURNING attempt_number, race_date::text AS race_date`,
      [params.userId, params.gameId, Math.round(params.durationMs)]
    );
    const row = res.rows[0];
    if (!row) return null;
    return { attemptNumber: row.attempt_number, raceDate: row.race_date };
  } catch (err) {
    logError('completeDailyAttempt', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/**
 * Returns the top finishers for a given race date, ordered by best time.
 * Each entry includes the user's display name, avatar URL from the
 * profiles table, and a competition rank (ties share the same rank via
 * SQL RANK()). Returns an empty array on no pool or error.
 *
 * Called by routes/daily.ts and routes/share.ts for the leaderboard view.
 */
export async function queryDailyLeaderboard(
  raceDate: string,
  limit: number
): Promise<
  Array<{
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    bestMs: number;
    rank: number;
  }>
> {
  const pool = getPool();
  if (!pool) {
    logSkip('queryDailyLeaderboard');
    return [];
  }
  try {
    const res = await pool.query<{
      user_id: string;
      display_name: string;
      avatar_url: string | null;
      best_ms: string;
      rank: string;
    }>(
      `SELECT user_id, display_name, avatar_url, best_ms,
              RANK() OVER (ORDER BY best_ms ASC) AS rank
         FROM (
           SELECT da.user_id, p.display_name, p.avatar_url,
                  MIN(da.duration_ms) AS best_ms
             FROM daily_attempts da JOIN profiles p ON p.id = da.user_id
            WHERE da.race_date = $1 AND da.duration_ms IS NOT NULL
            GROUP BY da.user_id, p.display_name, p.avatar_url
         ) sub
        ORDER BY best_ms ASC
        LIMIT $2`,
      [raceDate, limit]
    );
    return res.rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      bestMs: Number(r.best_ms),
      rank: Number(r.rank),
    }));
  } catch (err) {
    logError('queryDailyLeaderboard', err);
    return [];
  }
}

/**
 * Returns the leaderboard rows whose rank is within +-1 of the given user's
 * rank for a race date: their "neighborhood" (the racer directly above, the
 * user, the racer directly below). Rank ties can widen the window slightly,
 * so results are capped at 5 rows. Returns [] when the user has no finished
 * attempt, or on no pool/error.
 *
 * Called by routes/daily.ts so a mid-pack user still appears on the board
 * when they fall outside the top-N entries.
 */
export async function queryDailyNeighborhood(
  userId: string,
  raceDate: string
): Promise<
  Array<{
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    bestMs: number;
    rank: number;
  }>
> {
  const pool = getPool();
  if (!pool) {
    logSkip('queryDailyNeighborhood');
    return [];
  }
  try {
    const res = await pool.query<{
      user_id: string;
      display_name: string;
      avatar_url: string | null;
      best_ms: string;
      rank: string;
    }>(
      `WITH ranked AS (
        SELECT user_id, display_name, avatar_url, best_ms,
               RANK() OVER (ORDER BY best_ms ASC) AS rank
          FROM (
            SELECT da.user_id, p.display_name, p.avatar_url,
                   MIN(da.duration_ms) AS best_ms
              FROM daily_attempts da JOIN profiles p ON p.id = da.user_id
             WHERE da.race_date = $1 AND da.duration_ms IS NOT NULL
             GROUP BY da.user_id, p.display_name, p.avatar_url
          ) sub
      )
      SELECT user_id, display_name, avatar_url, best_ms, rank
        FROM ranked
       WHERE rank BETWEEN
               (SELECT rank FROM ranked WHERE user_id = $2) - 1
           AND (SELECT rank FROM ranked WHERE user_id = $2) + 1
       ORDER BY rank ASC, best_ms ASC
       LIMIT 5`,
      [raceDate, userId]
    );
    return res.rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      bestMs: Number(r.best_ms),
      rank: Number(r.rank),
    }));
  } catch (err) {
    logError('queryDailyNeighborhood', err);
    return [];
  }
}

/**
 * Returns the number of users with at least one finished attempt for a race
 * date. Used for the "N racers" board header; the fetched top-N row count
 * understates the field once it exceeds the display limit.
 * Returns 0 on no pool/error.
 */
export async function countDailyRacers(raceDate: string): Promise<number> {
  const pool = getPool();
  if (!pool) {
    logSkip('countDailyRacers');
    return 0;
  }
  try {
    const res = await pool.query<{ racers: string }>(
      `SELECT COUNT(DISTINCT user_id) AS racers
         FROM daily_attempts
        WHERE race_date = $1 AND duration_ms IS NOT NULL`,
      [raceDate]
    );
    return Number(res.rows[0]?.racers ?? 0);
  } catch (err) {
    logError('countDailyRacers', err);
    return 0;
  }
}

/**
 * Returns the user's rank, total number of racers, and personal best time
 * for a given race date. Returns null when the user has no finished attempt,
 * or on no pool/error.
 *
 * Called by routes/daily.ts and routes/share.ts for the placing display.
 */
export async function queryDailyPlacing(
  userId: string,
  raceDate: string
): Promise<{ rank: number; totalRacers: number; bestMs: number } | null> {
  const pool = getPool();
  if (!pool) {
    logSkip('queryDailyPlacing');
    return null;
  }
  try {
    const res = await pool.query<{
      best_ms: string | null;
      total_racers: string;
      rank: string;
    }>(
      `WITH best AS (
        SELECT user_id, MIN(duration_ms) AS best_ms
          FROM daily_attempts
         WHERE race_date = $1 AND duration_ms IS NOT NULL
         GROUP BY user_id
      )
      SELECT
        (SELECT best_ms FROM best WHERE user_id = $2)                       AS best_ms,
        (SELECT COUNT(*) FROM best)                                        AS total_racers,
        (SELECT COUNT(*) + 1 FROM best
          WHERE best_ms < (SELECT best_ms FROM best WHERE user_id = $2))   AS rank`,
      [raceDate, userId]
    );
    const row = res.rows[0];
    if (!row || row.best_ms === null) return null;
    return {
      rank: Number(row.rank),
      totalRacers: Number(row.total_racers),
      bestMs: Number(row.best_ms),
    };
  } catch (err) {
    logError('queryDailyPlacing', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

/**
 * Returns (or creates) a share slug for the user's daily result. Idempotent:
 * the first call inserts a new slug; concurrent or subsequent calls return
 * the existing one via a read-after-write pattern. The astronomically unlikely
 * slug PK collision surfaces as a logged error and returns null.
 *
 * Called by routes/share.ts when the user clicks "Share".
 */
export async function getOrCreateShareLink(
  userId: string,
  raceDate: string
): Promise<string | null> {
  const pool = getPool();
  if (!pool) {
    logSkip('getOrCreateShareLink');
    return null;
  }
  try {
    const slug = generateShareSlug();
    await pool.query(
      `INSERT INTO daily_share_links (slug, user_id, race_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, race_date) DO NOTHING`,
      [slug, userId, raceDate]
    );
    const res = await pool.query<{ slug: string }>(
      `SELECT slug FROM daily_share_links WHERE user_id = $1 AND race_date = $2`,
      [userId, raceDate]
    );
    if (res.rows.length === 0) return null;
    return res.rows[0]!.slug;
  } catch (err) {
    logError('getOrCreateShareLink', err);
    return null;
  }
}

/**
 * Resolves a share slug to the sharer's user id, display name, and race date.
 * Returns null when the slug does not exist or on error.
 *
 * Called by routes/share.ts for the unfurl page and challenge redirect.
 */
export async function getShareInfo(slug: string): Promise<{
  userId: string;
  displayName: string;
  raceDate: string;
} | null> {
  const pool = getPool();
  if (!pool) {
    logSkip('getShareInfo');
    return null;
  }
  try {
    const res = await pool.query<{
      user_id: string;
      display_name: string;
      race_date: string;
    }>(
      `SELECT dsl.user_id, dsl.race_date::text AS race_date, p.display_name
         FROM daily_share_links dsl
         JOIN profiles p ON p.id = dsl.user_id
        WHERE dsl.slug = $1`,
      [slug]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      displayName: row.display_name,
      raceDate: row.race_date,
    };
  } catch (err) {
    logError('getShareInfo', err);
    return null;
  }
}
