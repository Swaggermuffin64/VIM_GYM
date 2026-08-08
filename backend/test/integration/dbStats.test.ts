/**
 * Integration tests for the stats writers against a real Postgres.
 * Proves the SQL itself: upsert idempotency, transactional session writes,
 * the game-membership guard, keystroke attachment, and the profile-page
 * percentile query the whole feature exists to serve.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDatabase, TEST_USERS, type TestDatabase } from './harness.js';
import type { Task, PositionTask } from '../../types.js';

let db: TestDatabase;
let stats: typeof import('../../db/stats.js');
let closePool: () => Promise<void>;

function makeTask(id: string, targetOffset: number): PositionTask {
  return {
    id,
    type: 'navigate',
    description: 'move',
    codeSnippet: 'const x = 1;\nconst y = 2;',
    targetPosition: { line: 2, col: 6 },
    targetOffset,
    recommendedSequence: ['j', 'w'],
    recommendedWeight: 2,
  };
}

let tasks: Task[];

beforeAll(async () => {
  db = await startTestDatabase();
  // DATABASE_URL must be set before the config module is first imported.
  process.env.DATABASE_URL = db.url;
  stats = await import('../../db/stats.js');
  ({ closePool } = await import('../../db/pool.js'));
  const { attachContentHashes } = await import('../../taskPool.js');
  tasks = attachContentHashes([makeTask('t1', 14), makeTask('t2', 20)]);
});

afterAll(async () => {
  await closePool?.();
  await db?.stop();
});

describe('upsertTasksOnFirstUse', () => {
  it('inserts each distinct task once, idempotently', async () => {
    await stats.upsertTasksOnFirstUse(tasks);
    await stats.upsertTasksOnFirstUse(tasks); // second call must be a no-op
    const res = await db.query(
      'SELECT content_hash, task_type, optimal_keystroke_count FROM tasks ORDER BY content_hash'
    );
    expect(res.rowCount).toBe(2);
    expect(res.rows.every((r) => r.task_type === 'navigate')).toBe(true);
    expect(res.rows.every((r) => r.optimal_keystroke_count === 2)).toBe(true);
  });
});

describe('createGameSession / finishGameSession', () => {
  let gameId: number;

  it('creates the games row and one game_players row per user', async () => {
    const id = await stats.createGameSession({
      playMode: 'quick_play',
      roomId: 'ROOM1',
      taskHashes: tasks.map((t) => t.contentHash!),
      startedAt: new Date(),
      userIds: [TEST_USERS.alice, TEST_USERS.bob],
    });
    expect(id).not.toBeNull();
    gameId = id!;

    const players = await db.query(
      'SELECT user_id, position, finished FROM game_players WHERE game_id = $1 ORDER BY user_id',
      [gameId]
    );
    expect(players.rowCount).toBe(2);
    expect(players.rows.every((r) => r.position === null)).toBe(true);
  });

  it('records positions, times, and finished_at on finish', async () => {
    await stats.finishGameSession({
      gameId,
      finishedAt: new Date(),
      results: [
        {
          userId: TEST_USERS.alice,
          position: 1,
          totalTimeMs: 30_000,
          finished: true,
          leftRace: false,
        },
        {
          userId: TEST_USERS.bob,
          position: null,
          totalTimeMs: null,
          finished: false,
          leftRace: true,
        },
      ],
    });
    const game = await db.query('SELECT finished_at FROM games WHERE id = $1', [
      gameId,
    ]);
    expect(game.rows[0].finished_at).not.toBeNull();

    const alice = await db.query(
      'SELECT position, total_time_ms, finished FROM game_players WHERE game_id = $1 AND user_id = $2',
      [gameId, TEST_USERS.alice]
    );
    expect(alice.rows[0]).toMatchObject({
      position: 1,
      total_time_ms: 30_000,
      finished: true,
    });

    const bob = await db.query(
      'SELECT position, left_race FROM game_players WHERE game_id = $1 AND user_id = $2',
      [gameId, TEST_USERS.bob]
    );
    expect(bob.rows[0]).toMatchObject({ position: null, left_race: true });
  });

  it('inserts attempts for members and silently drops non-members', async () => {
    const base = {
      taskHash: tasks[0]!.contentHash!,
      gameId,
      playMode: 'quick_play',
      durationMs: 4000,
      keystrokeCount: 3,
      keystrokes: [
        { k: 'j', t: 0 },
        { k: 'w', t: 150 },
        { k: 'w', t: 300 },
      ],
    };
    await stats.insertTaskAttempt({ ...base, userId: TEST_USERS.alice });
    // mallory has a profile but is NOT in game_players for this game
    await stats.insertTaskAttempt({ ...base, userId: TEST_USERS.mallory });

    const res = await db.query(
      'SELECT user_id FROM task_attempts WHERE game_id = $1',
      [gameId]
    );
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].user_id).toBe(TEST_USERS.alice);
  });

  it('attaches keystrokes only to the latest NULL-count attempt', async () => {
    // Two multiplayer-style attempts (no keystrokes yet) for the same task
    for (const durationMs of [5000, 6000]) {
      await stats.insertTaskAttempt({
        userId: TEST_USERS.alice,
        taskHash: tasks[1]!.contentHash!,
        gameId,
        playMode: 'quick_play',
        durationMs,
        keystrokeCount: null,
        keystrokes: null,
      });
    }
    await stats.attachKeystrokesToAttempt({
      userId: TEST_USERS.alice,
      gameId,
      taskHash: tasks[1]!.contentHash!,
      keystrokeCount: 2,
      keystrokes: [
        { k: 'j', t: 0 },
        { k: 'w', t: 200 },
      ],
    });

    const res = await db.query(
      `SELECT duration_ms, keystroke_count FROM task_attempts
       WHERE game_id = $1 AND task_hash = $2 ORDER BY id`,
      [gameId, tasks[1]!.contentHash]
    );
    expect(res.rowCount).toBe(2);
    expect(res.rows[0].keystroke_count).toBeNull(); // earlier row untouched
    expect(res.rows[1].keystroke_count).toBe(2); // latest row filled
  });

  it('serves the profile-page percentile query from the recorded data', async () => {
    const res = await db.query(
      `SELECT t.task_type,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY a.duration_ms) AS median_ms
       FROM task_attempts a JOIN tasks t ON t.content_hash = a.task_hash
       WHERE a.user_id = $1
       GROUP BY t.task_type`,
      [TEST_USERS.alice]
    );
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].task_type).toBe('navigate');
    // alice's durations: 4000, 5000, 6000 → median 5000
    expect(Number(res.rows[0].median_ms)).toBe(5000);
  });
});
