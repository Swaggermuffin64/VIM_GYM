import type { Task } from '../types.js';
import { getPool } from './pool.js';

export const LEADERBOARD_TASK_SCHEMA_VERSION = 1;

function pgErrorDetails(err: unknown): Record<string, string> {
  if (err && typeof err === 'object' && 'code' in err) {
    const o = err as { code?: string; detail?: string; message?: string };
    return {
      ...(o.code ? { code: o.code } : {}),
      ...(o.detail ? { detail: o.detail } : {}),
      ...(o.message ? { message: o.message } : {}),
    };
  }
  return { message: err instanceof Error ? err.message : String(err) };
}

export type LeaderboardRanks = {
  weekly: number | null;
  monthly: number | null;
  allTime: number | null;
};

const RANK_CUTOFF = 5;

async function queryLeaderboardRanks(
  durationMs: number,
  playMode: string
): Promise<LeaderboardRanks> {
  const pool = getPool();
  if (!pool) return { weekly: null, monthly: null, allTime: null };

  try {
    const result = await pool.query<{
      weekly_rank: string;
      monthly_rank: string;
      all_time_rank: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE achieved_at >= date_trunc('week', NOW() AT TIME ZONE 'UTC')) + 1 AS weekly_rank,
         COUNT(*) FILTER (WHERE achieved_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')) + 1 AS monthly_rank,
         COUNT(*) + 1 AS all_time_rank
       FROM leaderboard_runs
       WHERE duration_ms < $1 AND play_mode = $2`,
      [durationMs, playMode]
    );

    const row = result.rows[0];
    if (!row) return { weekly: null, monthly: null, allTime: null };

    const weekly = Number(row.weekly_rank);
    const monthly = Number(row.monthly_rank);
    const allTime = Number(row.all_time_rank);

    console.log('[leaderboard] queryLeaderboardRanks raw', {
      durationMs,
      weekly_rank: row.weekly_rank,
      monthly_rank: row.monthly_rank,
      all_time_rank: row.all_time_rank,
      parsed: { weekly, monthly, allTime },
    });

    return {
      weekly: weekly <= RANK_CUTOFF ? weekly : null,
      monthly: monthly <= RANK_CUTOFF ? monthly : null,
      allTime: allTime <= RANK_CUTOFF ? allTime : null,
    };
  } catch (err) {
    console.error(
      '[leaderboard] queryLeaderboardRanks failed',
      pgErrorDetails(err)
    );
    return { weekly: null, monthly: null, allTime: null };
  }
}

export type InsertSessionResult =
  | { status: 'inserted'; ranks: LeaderboardRanks }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string; cause?: unknown };

const MAX_SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour
const MAX_TASKS_IN_SESSION = 50;

function playableTasksForRoom(tasks: Task[], numTasks: number): Task[] {
  return tasks.slice(0, Math.min(numTasks, tasks.length));
}

/** Validate client-supplied task list before storing as JSONB. */
export function isValidTasksPayload(tasks: unknown): tasks is Task[] {
  if (
    !Array.isArray(tasks) ||
    tasks.length < 1 ||
    tasks.length > MAX_TASKS_IN_SESSION
  ) {
    return false;
  }
  for (const item of tasks) {
    if (!item || typeof item !== 'object') return false;
    const t = item as Record<string, unknown>;
    if (typeof t.id !== 'string' || t.id.length < 1 || t.id.length > 120)
      return false;
    if (
      t.type !== 'navigate' &&
      t.type !== 'delete' &&
      t.type !== 'change' &&
      t.type !== 'insert'
    ) {
      return false;
    }
  }
  return true;
}

export async function insertSessionLeaderboardRow(params: {
  playMode: string;
  durationMs: number;
  tasks: Task[];
  playerId?: string;
  displayName?: string;
  roomId?: string;
}): Promise<InsertSessionResult> {
  const pool = getPool();
  if (!pool) {
    console.warn(
      '[leaderboard] insertSessionLeaderboardRow skipped: no pool (is DATABASE_URL set?)'
    );
    return { status: 'skipped', reason: 'no_database_pool' };
  }

  const durationMs = Math.round(params.durationMs);
  if (
    !Number.isFinite(durationMs) ||
    durationMs < 1 ||
    durationMs > MAX_SESSION_DURATION_MS
  ) {
    console.warn(
      '[leaderboard] insertSessionLeaderboardRow skipped: invalid duration_ms',
      {
        durationMs: params.durationMs,
        rounded: durationMs,
      }
    );
    return { status: 'skipped', reason: 'invalid_duration' };
  }

  const tasksJson = JSON.stringify(params.tasks);
  try {
    await pool.query(
      `INSERT INTO leaderboard_runs (
        play_mode,
        duration_ms,
        tasks_json,
        task_schema_version,
        player_id,
        display_name,
        room_id
      ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
      [
        params.playMode,
        durationMs,
        tasksJson,
        LEADERBOARD_TASK_SCHEMA_VERSION,
        params.playerId ?? null,
        params.displayName ?? null,
        params.roomId ?? null,
      ]
    );
    console.log('[leaderboard] insertSessionLeaderboardRow ok', {
      playMode: params.playMode,
      durationMs,
      taskCount: params.tasks.length,
    });
    const ranks = await queryLeaderboardRanks(durationMs, params.playMode);
    return { status: 'inserted', ranks };
  } catch (err) {
    console.error('[leaderboard] insertSessionLeaderboardRow failed', {
      ...pgErrorDetails(err),
      playMode: params.playMode,
    });
    return { status: 'failed', reason: 'insert_error', cause: err };
  }
}

/** One row per player who finished with a positive time. Returns ranks per player. */
export async function insertMultiplayerRaceLeaderboardRows(params: {
  roomId: string;
  isPublic: boolean;
  tasks: Task[];
  numTasks: number;
  rankings: Array<{
    playerId: string;
    playerName: string;
    time: number;
    position: number;
  }>;
}): Promise<Map<string, LeaderboardRanks>> {
  const ranksMap = new Map<string, LeaderboardRanks>();
  const pool = getPool();
  if (!pool) {
    console.warn(
      '[leaderboard] insertMultiplayerRaceLeaderboardRows skipped: no pool (is DATABASE_URL set?)'
    );
    return ranksMap;
  }

  const playMode = params.isPublic ? 'quick_play' : 'private_match';
  const playable = playableTasksForRoom(params.tasks, params.numTasks);
  if (playable.length === 0) {
    console.warn(
      '[leaderboard] insertMultiplayerRaceLeaderboardRows skipped: no playable tasks',
      {
        roomId: params.roomId,
      }
    );
    return ranksMap;
  }

  const tasksJson = JSON.stringify(playable);
  let inserted = 0;

  for (const r of params.rankings) {
    if (!r.time || r.time <= 0) continue;
    const durationMs = Math.round(r.time);
    if (durationMs > MAX_SESSION_DURATION_MS) continue;

    try {
      await pool.query(
        `INSERT INTO leaderboard_runs (
          play_mode,
          duration_ms,
          tasks_json,
          task_schema_version,
          player_id,
          display_name,
          room_id
        ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
        [
          playMode,
          durationMs,
          tasksJson,
          LEADERBOARD_TASK_SCHEMA_VERSION,
          r.playerId,
          r.playerName,
          params.roomId,
        ]
      );
      inserted += 1;
      const ranks = await queryLeaderboardRanks(durationMs, playMode);
      ranksMap.set(r.playerId, ranks);
      console.log('[leaderboard] insertMultiplayerRaceLeaderboardRow ok', {
        roomId: params.roomId,
        playMode,
        playerId: r.playerId,
        durationMs,
      });
    } catch (err) {
      console.error(
        '[leaderboard] insertMultiplayerRaceLeaderboardRows failed',
        {
          ...pgErrorDetails(err),
          roomId: params.roomId,
          playerId: r.playerId,
        }
      );
    }
  }

  if (inserted === 0) {
    console.warn(
      '[leaderboard] insertMultiplayerRaceLeaderboardRows: no rows inserted',
      {
        roomId: params.roomId,
        rankingCount: params.rankings.length,
      }
    );
  }

  return ranksMap;
}

export type LeaderboardEntry = {
  id: string;
  play_mode: string;
  duration_ms: number;
  display_name: string | null;
  achieved_at: string;
  has_tasks: boolean;
};

const ALLOWED_PLAY_MODE_FILTERS = new Set([
  'all',
  'practice',
  'quick_play',
  'private_match',
]);

const ALLOWED_TIME_RANGES = new Set(['all_time', 'week', 'month']);

function timeRangeWhereClause(timeRange: string): {
  sql: string;
  params: unknown[];
} {
  if (timeRange === 'week') {
    return {
      sql: `achieved_at >= date_trunc('week', NOW() AT TIME ZONE 'UTC')`,
      params: [],
    };
  }
  if (timeRange === 'month') {
    return {
      sql: `achieved_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')`,
      params: [],
    };
  }
  return { sql: '', params: [] };
}

/** Fastest runs first (`duration_ms` ascending). */
export async function queryLeaderboardTop(params: {
  limit: number;
  playMode: string;
  timeRange?: string;
}): Promise<
  | { ok: true; entries: LeaderboardEntry[]; databaseConfigured: boolean }
  | { ok: false; error: string }
> {
  const pool = getPool();
  if (!pool) {
    return { ok: true, entries: [], databaseConfigured: false };
  }

  const mode = params.playMode.toLowerCase();
  if (!ALLOWED_PLAY_MODE_FILTERS.has(mode)) {
    return { ok: false, error: 'Invalid play_mode filter' };
  }

  const timeRange = (params.timeRange ?? 'all_time').toLowerCase();
  if (!ALLOWED_TIME_RANGES.has(timeRange)) {
    return { ok: false, error: 'Invalid time_range filter' };
  }

  const limit = Math.min(100, Math.max(1, Math.floor(params.limit)));

  try {
    const filterAll = mode === 'all';
    const conditions: string[] = [];
    const queryParams: unknown[] = [];
    let paramIdx = 1;

    if (!filterAll) {
      conditions.push(`play_mode = $${paramIdx}`);
      queryParams.push(mode);
      paramIdx++;
    }

    const timeClause = timeRangeWhereClause(timeRange);
    if (timeClause.sql) {
      conditions.push(timeClause.sql);
    }

    const whereStr =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    queryParams.push(limit);
    const limitParam = `$${paramIdx + timeClause.params.length}`;

    const sql = `SELECT id::text, play_mode, duration_ms, display_name, achieved_at,
                        (tasks_json IS NOT NULL) AS has_tasks
                 FROM leaderboard_runs
                 ${whereStr}
                 ORDER BY duration_ms ASC, achieved_at ASC
                 LIMIT ${limitParam}`;

    const result = await pool.query<{
      id: string;
      play_mode: string;
      duration_ms: string;
      display_name: string | null;
      achieved_at: Date;
      has_tasks: boolean;
    }>(sql, queryParams);

    const entries: LeaderboardEntry[] = result.rows.map((row) => ({
      id: row.id,
      play_mode: row.play_mode,
      duration_ms: Number(row.duration_ms),
      display_name: row.display_name,
      achieved_at:
        row.achieved_at instanceof Date
          ? row.achieved_at.toISOString()
          : String(row.achieved_at),
      has_tasks: row.has_tasks,
    }));

    return { ok: true, entries, databaseConfigured: true };
  } catch (err) {
    console.error(
      '[leaderboard] queryLeaderboardTop failed',
      pgErrorDetails(err)
    );
    return { ok: false, error: 'Database query failed' };
  }
}

/** Fetch the saved tasks for a specific leaderboard run. */
export async function queryLeaderboardTasks(
  id: string
): Promise<{ ok: true; tasks: unknown[] } | { ok: false; error: string }> {
  const pool = getPool();
  if (!pool) return { ok: false, error: 'Database not configured' };

  try {
    const result = await pool.query<{ tasks_json: unknown[] }>(
      `SELECT tasks_json FROM leaderboard_runs WHERE id = $1 AND tasks_json IS NOT NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return { ok: false, error: 'Entry not found or has no tasks' };
    }

    return { ok: true, tasks: result.rows[0]!.tasks_json };
  } catch (err) {
    console.error(
      '[leaderboard] queryLeaderboardTasks failed',
      pgErrorDetails(err)
    );
    return { ok: false, error: 'Database query failed' };
  }
}
