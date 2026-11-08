/**
 * Integration tests for the Race of the Day results queries against a real
 * Postgres: efficiency scoring and ranking, per-user history with ranks over
 * the whole field, and the seen-badges acknowledgement.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDatabase, TEST_USERS, type TestDatabase } from './harness.js';

let db: TestDatabase;
let results: typeof import('../../db/dailyResults.js');
let closePool: () => Promise<void>;

const { alice, bob, mallory } = TEST_USERS;

/**
 * Inserts a finished daily attempt and its per-task keystroke counts
 * (`keys[i]` for task t{i+1}; null leaves that task unrecorded).
 */
async function attempt(
  userId: string,
  raceDate: string,
  attemptNumber: number,
  durationMs: number,
  keys: Array<number | null>
): Promise<void> {
  const game = await db.query(
    `INSERT INTO games (play_mode, task_hashes, started_at)
     VALUES ('daily', '{t1,t2}', now()) RETURNING id`
  );
  const gameId = game.rows[0].id;
  await db.query(
    `INSERT INTO daily_attempts
       (user_id, race_date, attempt_number, game_id, duration_ms, completed_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [userId, raceDate, attemptNumber, gameId, durationMs]
  );
  for (const [i, count] of keys.entries()) {
    if (count === null) continue;
    await db.query(
      `INSERT INTO task_attempts
         (user_id, task_hash, game_id, play_mode, duration_ms, keystroke_count)
       VALUES ($1, $2, $3, 'daily', 1000, $4)`,
      [userId, `t${i + 1}`, gameId, count]
    );
  }
}

beforeAll(async () => {
  db = await startTestDatabase();
  // DATABASE_URL must be set before the config module is first imported.
  process.env.DATABASE_URL = db.url;
  results = await import('../../db/dailyResults.js');
  ({ closePool } = await import('../../db/pool.js'));

  // Optimal: 3 + 4 = 7 keys per run.
  await db.query(
    `INSERT INTO tasks (content_hash, task_type, task_json, optimal_keystroke_count)
     VALUES ('t1', 'navigate', '{}', 3), ('t2', 'delete', '{}', 4)`
  );
  await db.query(
    `INSERT INTO daily_races (race_date, task_hashes)
     VALUES ('2026-10-17', '{t1,t2}'), ('2026-10-18', '{t1,t2}')`
  );

  // 10-17: alice's slow perfect run beats her fast sloppy one on efficiency;
  // mallory is missing a task's keystrokes, so ranks on speed only.
  await attempt(alice, '2026-10-17', 1, 10_000, [3, 4]); // 7/7
  await attempt(alice, '2026-10-17', 2, 8_000, [5, 5]); // 7/10
  await attempt(bob, '2026-10-17', 1, 9_000, [3, 5]); // 7/8
  await attempt(mallory, '2026-10-17', 1, 12_000, [3, null]);
  // 10-18: both have a perfect run, alice's faster; bob's fastest run is a
  // different, less efficient attempt.
  await attempt(alice, '2026-10-18', 1, 7_000, [3, 4]); // 7/7
  await attempt(bob, '2026-10-18', 1, 7_500, [3, 4]); // 7/7
  await attempt(bob, '2026-10-18', 2, 6_500, [3, 5]); // 7/8, faster
});

afterAll(async () => {
  await closePool?.();
  await db?.stop();
});

describe('queryEfficiencyBoard', () => {
  it("ranks each racer's most efficient attempt, skipping unscorable runs", async () => {
    const board = await results.queryEfficiencyBoard('2026-10-17');
    expect(
      board.map((r) => [r.displayName, r.efficiency, r.durationMs, r.rank])
    ).toEqual([
      ['alice', 1, 10_000, 1],
      ['bob', 0.875, 9_000, 2],
    ]);
  });

  it('breaks equal efficiency by the faster time on that attempt', async () => {
    const board = await results.queryEfficiencyBoard('2026-10-18');
    expect(
      board.map((r) => [r.displayName, r.efficiency, r.durationMs, r.rank])
    ).toEqual([
      ['alice', 1, 7_000, 1],
      ['bob', 1, 7_500, 2],
    ]);
  });

  it('counts the latest row when a task was recorded twice', async () => {
    const game = await db.query(
      `SELECT game_id FROM daily_attempts
        WHERE user_id = $1 AND race_date = '2026-10-17'`,
      [bob]
    );
    // An older, worse duplicate for t2 must not drag bob's 7/8 down.
    await db.query(
      `INSERT INTO task_attempts
         (user_id, task_hash, game_id, play_mode, duration_ms, keystroke_count, completed_at)
       VALUES ($1, 't2', $2, 'daily', 1000, 40, now() - interval '1 hour')`,
      [bob, game.rows[0].game_id]
    );
    const board = await results.queryEfficiencyBoard('2026-10-17');
    const row = board.find((r) => r.userId === bob);
    expect(row?.efficiency).toBe(0.875);
    expect([row?.optimalKeys, row?.actualKeys]).toEqual([7, 8]);
  });
});

describe('queryDailyHistory', () => {
  it("ranks the requested users against each day's whole field", async () => {
    const history = await results.queryDailyHistory([mallory, bob]);
    expect(
      history.map((d) => [
        d.userId === bob ? 'bob' : 'mallory',
        d.raceDate,
        d.speedRank,
        d.racers,
        d.efficiencyRank,
        d.efficiencyRacers,
      ])
    ).toEqual([
      ['bob', '2026-10-17', 2, 3, 2, 2],
      ['bob', '2026-10-18', 1, 2, 2, 2],
      ['mallory', '2026-10-17', 3, 3, null, null],
    ]);
  });

  it('returns nothing for an empty id list', async () => {
    expect(await results.queryDailyHistory([])).toEqual([]);
  });
});

describe('seen badges', () => {
  it('starts empty and accumulates without duplicates', async () => {
    expect(await results.getSeenBadges(alice)).toEqual([]);
    expect(await results.addSeenBadges(alice, ['days_7', 'first_win'])).toBe(
      true
    );
    expect(await results.addSeenBadges(alice, ['first_win'])).toBe(true);
    expect((await results.getSeenBadges(alice))?.sort()).toEqual([
      'days_7',
      'first_win',
    ]);
  });
});
