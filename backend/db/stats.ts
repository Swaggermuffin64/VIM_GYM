/**
 * Persistence for games, game_players, tasks, and task_attempts
 * (spec: docs/superpowers/specs/2026-08-08-games-and-player-stats-design.md).
 *
 * Every writer here is best-effort: null-pool tolerant, logs failures with
 * the pg error code, and never throws into the game/practice flow.
 */
import type { KeystrokeEvent, Task } from '../types.js';
import { getPool } from './pool.js';
import {
  optimalKeystrokeCountForTask,
  STATS_TASK_SCHEMA_VERSION,
} from '../taskHash.js';

/** Hard cap on stored replay events; bigger arrays are dropped (metrics kept). */
export const MAX_STORED_KEYSTROKES = 50;

export interface CompactKeystroke {
  /** Key with modifier prefix: "w", "C-r" (ctrl), "M-x" (meta), "A-b" (alt). */
  k: string;
  /** Milliseconds since the first event; non-decreasing. */
  t: number;
}

/**
 * Compact client KeystrokeEvents into the stored replay shape.
 * Returns null when empty or over the cap — caller stores SQL NULL.
 */
export function compactKeystrokes(
  events: KeystrokeEvent[]
): CompactKeystroke[] | null {
  if (events.length === 0 || events.length > MAX_STORED_KEYSTROKES) return null;
  const out: CompactKeystroke[] = [];
  let t = 0;
  let first = true;
  for (const e of events) {
    if (!first) t += Math.max(0, e.dtMs);
    first = false;
    let k = e.key;
    if (e.altKey) k = `A-${k}`;
    if (e.metaKey) k = `M-${k}`;
    if (e.ctrlKey) k = `C-${k}`;
    out.push({ k, t });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Session / attempt / task writers
// ---------------------------------------------------------------------------

/** Hashes already upserted this process — skips the statement for repeat tasks. */
const upsertedHashes = new Set<string>();
const UPSERTED_HASHES_MAX = 20_000;

function logSkip(fn: string): void {
  console.warn(`[stats] ${fn} skipped: no pool (is DATABASE_URL set?)`);
}

function logError(fn: string, err: unknown): void {
  const code = (err as { code?: string })?.code;
  console.error(`[stats] ${fn} failed`, { code, err });
}

/**
 * Batch-inserts rows into the `tasks` table for any tasks whose contentHash
 * has not yet been upserted during this process lifetime. Uses
 * INSERT ... ON CONFLICT (content_hash) DO NOTHING so concurrent inserts are
 * harmless. No-ops (with a warning) when DATABASE_URL is unset.
 */
export async function upsertTasksOnFirstUse(tasks: Task[]): Promise<void> {
  const pool = getPool();
  if (!pool) return logSkip('upsertTasksOnFirstUse');
  const fresh = tasks.filter(
    (t) => t.contentHash && !upsertedHashes.has(t.contentHash)
  );
  if (fresh.length === 0) return;
  try {
    // One multi-row statement; conflict = someone else inserted it first, fine.
    const values: unknown[] = [];
    const rows = fresh.map((t, i) => {
      const base = i * 5;
      values.push(
        t.contentHash,
        t.type,
        JSON.stringify(t),
        optimalKeystrokeCountForTask(t),
        STATS_TASK_SCHEMA_VERSION
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });
    await pool.query(
      `INSERT INTO tasks (content_hash, task_type, task_json, optimal_keystroke_count, task_schema_version)
       VALUES ${rows.join(', ')}
       ON CONFLICT (content_hash) DO NOTHING`,
      values
    );
    if (upsertedHashes.size > UPSERTED_HASHES_MAX) upsertedHashes.clear();
    for (const t of fresh) upsertedHashes.add(t.contentHash!);
  } catch (err) {
    logError('upsertTasksOnFirstUse', err);
  }
}

/**
 * Creates a game session record plus one game_players row per user, all inside
 * a transaction. Returns the new `games.id` or null on failure / no pool.
 */
export async function createGameSession(params: {
  playMode: string;
  roomId?: string;
  taskHashes: string[];
  startedAt: Date;
  userIds: string[];
}): Promise<number | null> {
  const pool = getPool();
  if (!pool) {
    logSkip('createGameSession');
    return null;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query<{ id: string }>(
      `INSERT INTO games (play_mode, room_id, task_hashes, started_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        params.playMode,
        params.roomId ?? null,
        params.taskHashes,
        params.startedAt,
      ]
    );
    const gameId = Number(res.rows[0]!.id);
    for (const userId of params.userIds) {
      await client.query(
        `INSERT INTO game_players (game_id, user_id) VALUES ($1, $2)
         ON CONFLICT (game_id, user_id) DO NOTHING`,
        [gameId, userId]
      );
    }
    await client.query('COMMIT');
    return gameId;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // 23503 = FK violation: a userId with no profiles row (e.g. ephemeral
    // match-token id). Signed-in-only policy: drop the whole session record.
    logError('createGameSession', err);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Marks a game as finished and updates each player's final stats (position,
 * total time, finished/left flags) in a transaction. No-ops when no pool.
 */
export async function finishGameSession(params: {
  gameId: number;
  finishedAt: Date;
  results: Array<{
    userId: string;
    position: number | null;
    totalTimeMs: number | null;
    finished: boolean;
    leftRace: boolean;
  }>;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return logSkip('finishGameSession');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE games SET finished_at = $2 WHERE id = $1`, [
      params.gameId,
      params.finishedAt,
    ]);
    for (const r of params.results) {
      await client.query(
        `UPDATE game_players
         SET position = $3, total_time_ms = $4, finished = $5, left_race = $6
         WHERE game_id = $1 AND user_id = $2`,
        [
          params.gameId,
          r.userId,
          r.position,
          r.totalTimeMs,
          r.finished,
          r.leftRace,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logError('finishGameSession', err);
  } finally {
    client.release();
  }
}

/**
 * Inserts a single task_attempts row with keystroke data. Rounds durationMs to
 * the nearest integer. No-ops when no pool.
 */
export async function insertTaskAttempt(params: {
  userId: string;
  taskHash: string;
  gameId: number;
  playMode: string;
  durationMs: number;
  keystrokeCount: number | null;
  keystrokes: CompactKeystroke[] | null;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return logSkip('insertTaskAttempt');
  try {
    await pool.query(
      `INSERT INTO task_attempts
         (user_id, task_hash, game_id, play_mode, duration_ms, keystroke_count, keystrokes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        params.userId,
        params.taskHash,
        params.gameId,
        params.playMode,
        Math.round(params.durationMs),
        params.keystrokeCount,
        params.keystrokes ? JSON.stringify(params.keystrokes) : null,
      ]
    );
  } catch (err) {
    logError('insertTaskAttempt', err);
  }
}

/**
 * Fills keystroke data into the latest matching task_attempts row whose
 * keystroke_count IS NULL. Used for the multiplayer late-arrival path where
 * the attempt row is inserted before keystrokes arrive. No-ops when no pool.
 */
export async function attachKeystrokesToAttempt(params: {
  userId: string;
  gameId: number;
  taskHash: string;
  keystrokeCount: number;
  keystrokes: CompactKeystroke[] | null;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return logSkip('attachKeystrokesToAttempt');
  try {
    // Latest matching attempt still missing its array (multiplayer late-arrival).
    await pool.query(
      `UPDATE task_attempts SET keystroke_count = $4, keystrokes = $5
       WHERE id = (
         SELECT id FROM task_attempts
         WHERE user_id = $1 AND game_id = $2 AND task_hash = $3
           AND keystroke_count IS NULL
         ORDER BY id DESC LIMIT 1
       )`,
      [
        params.userId,
        params.gameId,
        params.taskHash,
        params.keystrokeCount,
        params.keystrokes ? JSON.stringify(params.keystrokes) : null,
      ]
    );
  } catch (err) {
    logError('attachKeystrokesToAttempt', err);
  }
}
