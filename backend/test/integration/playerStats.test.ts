/**
 * Integration tests for the profile-page aggregate reader against a real
 * Postgres: racing record excludes practice, wins count position=1, best
 * time only over finished races, task totals average correctly, and the
 * recent list is newest-first and capped.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
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
  // Task attempts: 4000ms and 6000ms -> avg 5000. No keystroke counts, so
  // neither contributes to efficiency (h1 also has no optimal count).
  await db.query(
    `INSERT INTO task_attempts (user_id, task_hash, game_id, play_mode, duration_ms)
     VALUES ($1, 'h1', 103, 'practice', 4000), ($1, 'h1', 103, 'practice', 6000)`,
    [TEST_USERS.alice]
  );
  // Finished practice session with a total time (counts toward avg race
  // time including practice; oldest, so the recent-list cap tests still
  // see the three newer games first).
  await db.query(
    `INSERT INTO games (id, play_mode, task_hashes, started_at, finished_at)
     VALUES (104, 'practice', '{h1}', now() - interval '4 hours', now() - interval '4 hours')`
  );
  await db.query(
    `INSERT INTO game_players (game_id, user_id, total_time_ms, finished)
     VALUES (104, $1, 30000, true)`,
    [TEST_USERS.alice]
  );
  // Task with a known optimal keystroke count for efficiency math.
  await db.query(
    `INSERT INTO tasks (content_hash, task_type, task_json, optimal_keystroke_count)
     VALUES ('h2', 'navigate', '{}', 5)`
  );
  // Efficiency inputs: 5/10 = 0.5 and 5/4 = 1.25 capped to 1.0 -> avg 0.75.
  // The keystroke_count row on h1 (no optimal) must be excluded.
  await db.query(
    `INSERT INTO task_attempts (user_id, task_hash, game_id, play_mode, duration_ms, keystroke_count)
     VALUES ($1, 'h2', 104, 'practice', 3000, 10),
            ($1, 'h2', 104, 'practice', 3000, 4),
            ($1, 'h1', 104, 'practice', 3000, 7)`,
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
    expect(stats.tasksCompleted).toBe(5);
    expect(stats.avgTaskMs).toBe(3800); // (4000+6000+3000*3)/5
    expect(stats.recentGames.map((g) => g.playMode)).toEqual([
      'practice',
      'quick_play',
      'quick_play',
      'practice', // newest first; finished practice session is oldest
    ]);
    expect(stats.recentGames[0]!.position).toBeNull();
  });

  it('averages race time across finished sessions including practice', async () => {
    const stats = await playerStats.getPlayerStats(TEST_USERS.alice);
    expect(stats.avgRaceMs).toBe(60000); // (60000+90000+30000)/3
  });

  it('averages capped keystroke efficiency over attempts with both counts', async () => {
    const stats = await playerStats.getPlayerStats(TEST_USERS.alice);
    expect(stats.avgTaskEfficiency).toBeCloseTo(0.75); // (0.5 + min(1.25,1))/2
    expect(stats.efficiencySample).toBe(2); // h1 attempt with no optimal excluded
  });

  it('returns the zero-state for a user with no data', async () => {
    const stats = await playerStats.getPlayerStats(TEST_USERS.mallory);
    expect(stats).toEqual({
      racesPlayed: 0,
      wins: 0,
      bestRaceMs: null,
      tasksCompleted: 0,
      avgTaskMs: null,
      avgRaceMs: null,
      avgTaskEfficiency: null,
      efficiencySample: 0,
      recentGames: [],
      totalRuns: 0,
      multiplayer: { races: 0, wins: 0 },
      activity: [],
      raceTimeWeekly: [],
      avgRaceMs30d: null,
      avgRaceMsPrev30d: null,
    });
  });

  it('rejects zero-keystroke attempts at the schema, protecting the efficiency division', async () => {
    // The efficiency aggregate divides by keystroke_count. A zero row would
    // error the whole stats query (surfacing as the zero-state), so the
    // schema must forbid it — this pins that CHECK constraint.
    await expect(
      db.query(
        `INSERT INTO task_attempts (user_id, task_hash, game_id, play_mode, duration_ms, keystroke_count)
         VALUES ($1, 'h2', 104, 'practice', 3000, 0)`,
        [TEST_USERS.alice]
      )
    ).rejects.toThrow(/keystroke_count_check/);
    // And the aggregates over the valid rows keep working.
    const stats = await playerStats.getPlayerStats(TEST_USERS.alice);
    expect(stats.avgTaskEfficiency).toBeCloseTo(0.75);
    expect(stats.efficiencySample).toBe(2);
  });

  it('caps the recent list at the requested limit', async () => {
    const stats = await playerStats.getPlayerStats(TEST_USERS.alice, 2);
    expect(stats.recentGames).toHaveLength(2);
  });

  describe('per-user aggregates for the profile bento', () => {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const isoDay = (d: Date) => d.toISOString().slice(0, 10);
    /** UTC midnight `daysAgo` days before today. */
    const utcMidnight = (daysAgo: number) => {
      const now = new Date();
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
          daysAgo * MS_PER_DAY
      );
    };
    /** UTC Monday 00:00 of the week containing today, minus `weeksAgo` weeks. */
    const utcMonday = (weeksAgo: number) => {
      const today = utcMidnight(0);
      const sinceMonday = (today.getUTCDay() + 6) % 7;
      return new Date(
        today.getTime() - sinceMonday * MS_PER_DAY - weeksAgo * 7 * MS_PER_DAY
      );
    };

    interface SeedRun {
      playMode: string;
      startedAt: Date;
      position?: number | null;
      totalTimeMs?: number | null;
      finished?: boolean;
    }
    /** Inserts one game plus bob's game_players row for it. */
    async function seedRun(run: SeedRun) {
      const game = await db.query(
        `INSERT INTO games (play_mode, task_hashes, started_at)
         VALUES ($1, '{h1}', $2) RETURNING id`,
        [run.playMode, run.startedAt]
      );
      const gameId = (game.rows[0] as { id: string }).id;
      await db.query(
        `INSERT INTO game_players (game_id, user_id, position, total_time_ms, finished)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          gameId,
          TEST_USERS.bob,
          run.position ?? null,
          run.totalTimeMs ?? null,
          run.finished ?? run.totalTimeMs != null,
        ]
      );
    }

    afterEach(async () => {
      await db.query(
        `DELETE FROM games WHERE id IN
           (SELECT game_id FROM game_players WHERE user_id = $1)`,
        [TEST_USERS.bob]
      );
    });

    it('totalRuns counts practice and daily', async () => {
      const at = utcMidnight(1);
      await seedRun({ playMode: 'practice', startedAt: at });
      await seedRun({ playMode: 'practice', startedAt: at });
      await seedRun({ playMode: 'daily', startedAt: at });
      await seedRun({ playMode: 'quick_play', startedAt: at, position: 1 });
      const stats = await playerStats.getPlayerStats(TEST_USERS.bob);
      expect(stats.totalRuns).toBe(4);
    });

    it('multiplayer excludes daily and practice', async () => {
      const at = utcMidnight(1);
      await seedRun({ playMode: 'quick_play', startedAt: at, position: 1 });
      await seedRun({ playMode: 'private_match', startedAt: at, position: 2 });
      await seedRun({ playMode: 'daily', startedAt: at, position: null });
      await seedRun({ playMode: 'practice', startedAt: at });
      const stats = await playerStats.getPlayerStats(TEST_USERS.bob);
      expect(stats.multiplayer).toEqual({ races: 2, wins: 1 });
    });

    it('activity buckets by UTC day', async () => {
      const day1 = utcMidnight(3);
      const day2 = utcMidnight(2);
      await seedRun({
        playMode: 'quick_play',
        startedAt: new Date(day1.getTime() + 23.5 * 3600 * 1000),
        position: 1,
      });
      await seedRun({
        playMode: 'practice',
        startedAt: new Date(day2.getTime() + 0.5 * 3600 * 1000),
      });
      const stats = await playerStats.getPlayerStats(TEST_USERS.bob);
      expect(stats.activity).toEqual([
        { day: isoDay(day1), runs: 1, multiplayerWins: 1 },
        { day: isoDay(day2), runs: 1, multiplayerWins: 0 },
      ]);
    });

    it('activity keeps days within a year (52 weeks)', async () => {
      await seedRun({ playMode: 'practice', startedAt: utcMidnight(300) });
      const stats = await playerStats.getPlayerStats(TEST_USERS.bob);
      expect(stats.activity).toEqual([
        { day: isoDay(utcMidnight(300)), runs: 1, multiplayerWins: 0 },
      ]);
    });

    it('activity drops days older than 52 weeks', async () => {
      await seedRun({ playMode: 'practice', startedAt: utcMidnight(400) });
      const stats = await playerStats.getPlayerStats(TEST_USERS.bob);
      expect(stats.activity).toEqual([]);
      expect(stats.totalRuns).toBe(1);
    });

    it('raceTimeWeekly averages finished runs and skips empty weeks', async () => {
      const noon = 12 * 3600 * 1000;
      const week3 = utcMonday(3).getTime() + noon;
      await seedRun({
        playMode: 'practice',
        startedAt: new Date(week3),
        totalTimeMs: 10000,
      });
      await seedRun({
        playMode: 'daily',
        startedAt: new Date(week3),
        totalTimeMs: 20000,
      });
      // Unfinished run in week 3 must be ignored.
      await seedRun({ playMode: 'practice', startedAt: new Date(week3) });
      await seedRun({
        playMode: 'practice',
        startedAt: new Date(utcMonday(1).getTime() + noon),
        totalTimeMs: 9000,
      });
      const stats = await playerStats.getPlayerStats(TEST_USERS.bob);
      expect(stats.raceTimeWeekly).toEqual([
        { weekStart: isoDay(utcMonday(3)), avgMs: 15000 },
        { weekStart: isoDay(utcMonday(1)), avgMs: 9000 },
      ]);
    });

    it('30-day windows compare the last 30 days to the 30 before', async () => {
      await seedRun({
        playMode: 'practice',
        startedAt: utcMidnight(5),
        totalTimeMs: 10000,
      });
      await seedRun({
        playMode: 'daily',
        startedAt: utcMidnight(40),
        totalTimeMs: 20000,
      });
      const stats = await playerStats.getPlayerStats(TEST_USERS.bob);
      expect(stats.avgRaceMs30d).toBe(10000);
      expect(stats.avgRaceMsPrev30d).toBe(20000);
    });
  });
});
