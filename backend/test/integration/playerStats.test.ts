/**
 * Integration tests for the profile-page aggregate reader against a real
 * Postgres: racing record excludes practice, wins count position=1, best
 * time only over finished races, task totals average correctly, and the
 * recent list is newest-first and capped.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDatabase, TEST_USERS, type TestDatabase } from './harness.js';

let db: TestDatabase;
let playerStats: typeof import('../../db/playerStats.js');
let closePool: () => Promise<void>;

beforeAll(async () => {
  db = await startTestDatabase();
  process.env.DATABASE_URL = db.url;
  playerStats = await import('../../db/playerStats.js');
  ({ closePool } = await import('../../db/pool.js'));

  // Seed: profiles rows exist for TEST_USERS via the harness. Add one task,
  // three games for alice (2 races + 1 practice) and task attempts.
  await db.query(
    `INSERT INTO tasks (content_hash, task_type, task_json) VALUES ('h1', 'navigate', '{}')`
  );
  // Race 1: alice wins (position 1, 60s), finished.
  await db.query(
    `INSERT INTO games (id, play_mode, task_hashes, started_at, finished_at)
     VALUES (101, 'quick_play', '{h1}', now() - interval '3 hours', now() - interval '3 hours')`
  );
  await db.query(
    `INSERT INTO game_players (game_id, user_id, position, total_time_ms, finished)
     VALUES (101, $1, 1, 60000, true)`,
    [TEST_USERS.alice]
  );
  // Race 2: alice loses (position 2, 90s), finished.
  await db.query(
    `INSERT INTO games (id, play_mode, task_hashes, started_at, finished_at)
     VALUES (102, 'quick_play', '{h1}', now() - interval '2 hours', now() - interval '2 hours')`
  );
  await db.query(
    `INSERT INTO game_players (game_id, user_id, position, total_time_ms, finished)
     VALUES (102, $1, 2, 90000, true)`,
    [TEST_USERS.alice]
  );
  // Practice session (must not count as a race, but must appear in recent).
  await db.query(
    `INSERT INTO games (id, play_mode, task_hashes, started_at)
     VALUES (103, 'practice', '{h1}', now() - interval '1 hour')`
  );
  await db.query(
    `INSERT INTO game_players (game_id, user_id) VALUES (103, $1)`,
    [TEST_USERS.alice]
  );
  // Task attempts: 4000ms and 6000ms -> avg 5000.
  await db.query(
    `INSERT INTO task_attempts (user_id, task_hash, game_id, play_mode, duration_ms)
     VALUES ($1, 'h1', 103, 'practice', 4000), ($1, 'h1', 103, 'practice', 6000)`,
    [TEST_USERS.alice]
  );
});

afterAll(async () => {
  await closePool?.();
  await db?.stop();
});

describe('getPlayerStats', () => {
  it('aggregates racing record, task totals, and recent games', async () => {
    const stats = await playerStats.getPlayerStats(TEST_USERS.alice);
    expect(stats.racesPlayed).toBe(2); // practice excluded
    expect(stats.wins).toBe(1);
    expect(stats.bestRaceMs).toBe(60000);
    expect(stats.tasksCompleted).toBe(2);
    expect(stats.avgTaskMs).toBe(5000);
    expect(stats.recentGames.map((g) => g.playMode)).toEqual([
      'practice',
      'quick_play',
      'quick_play', // newest first
    ]);
    expect(stats.recentGames[0]!.position).toBeNull();
  });

  it('returns the zero-state for a user with no data', async () => {
    const stats = await playerStats.getPlayerStats(TEST_USERS.mallory);
    expect(stats).toEqual({
      racesPlayed: 0,
      wins: 0,
      bestRaceMs: null,
      tasksCompleted: 0,
      avgTaskMs: null,
      recentGames: [],
    });
  });

  it('caps the recent list at the requested limit', async () => {
    const stats = await playerStats.getPlayerStats(TEST_USERS.alice, 2);
    expect(stats.recentGames).toHaveLength(2);
  });
});
