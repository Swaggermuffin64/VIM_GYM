/**
 * Read-only aggregate queries backing the profile page's stats section.
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

export interface PlayerStats {
  racesPlayed: number;
  wins: number;
  bestRaceMs: number | null;
  tasksCompleted: number;
  avgTaskMs: number | null;
  recentGames: RecentGame[];
}

const ZERO_STATS: PlayerStats = {
  racesPlayed: 0,
  wins: 0,
  bestRaceMs: null,
  tasksCompleted: 0,
  avgTaskMs: null,
  recentGames: [],
};

/** Default number of recent games returned for the profile page list. */
export const RECENT_GAMES_LIMIT = 8;

/**
 * Aggregates a player's racing record, task totals, and recent games in
 * three queries. Returns the zero-state when persistence is disabled or a
 * query fails — callers never need a try/catch.
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
    const [racing, tasks, recent] = await Promise.all([
      pool.query<{
        races_played: number;
        wins: number;
        best_race_ms: number | null;
      }>(
        `SELECT
           COUNT(*)::int AS races_played,
           (COUNT(*) FILTER (WHERE gp.position = 1))::int AS wins,
           MIN(gp.total_time_ms) FILTER (WHERE gp.finished) AS best_race_ms
         FROM game_players gp
         JOIN games g ON g.id = gp.game_id
         WHERE gp.user_id = $1 AND g.play_mode <> 'practice'`,
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
    ]);
    const r = racing.rows[0]!;
    const t = tasks.rows[0]!;
    return {
      racesPlayed: r.races_played,
      wins: r.wins,
      bestRaceMs: r.best_race_ms,
      tasksCompleted: t.tasks_completed,
      avgTaskMs: t.avg_task_ms,
      recentGames: recent.rows.map((row) => ({
        playMode: row.play_mode,
        position: row.position,
        finished: row.finished,
        leftRace: row.left_race,
        totalTimeMs: row.total_time_ms,
        startedAt: row.started_at,
      })),
    };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    console.error('[playerStats] getPlayerStats failed', { code, err });
    return ZERO_STATS;
  }
}
