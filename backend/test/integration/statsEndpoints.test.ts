/**
 * Endpoint integration tests: a real spawned backend against a real Postgres.
 * These cover the client↔server seam that unit tests can't — exactly where
 * the missing-auth-header and stale-validator bugs lived.
 *
 * Auth uses the backend's legacy HS256 path: the server is spawned with
 * SUPABASE_JWT_SECRET set to a test secret and we mint matching JWTs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startTestDatabase,
  mintTestToken,
  TEST_JWT_SECRET,
  TEST_USERS,
  type TestDatabase,
} from './harness.js';

const BACKEND_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

let db: TestDatabase;
let server: ChildProcess;
let base: string;
const aliceToken = () => mintTestToken(TEST_USERS.alice);

interface PracticeResponse {
  tasks: Array<{
    id: string;
    type: string;
    contentHash?: string;
  }>;
  gameId: number | null;
}

function keystrokeEvents(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    key: 'j',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    dtMs: i === 0 ? 0 : 100,
  }));
}

/** Fire-and-forget writes land asynchronously; poll briefly for the row. */
async function eventually<T>(
  fn: () => Promise<T | null>,
  ms = 5000
): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const result = await fn();
    if (result !== null) return result;
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 200));
  }
}

beforeAll(async () => {
  db = await startTestDatabase();
  const port = 3500 + Math.floor(Math.random() * 400);
  base = `http://localhost:${port}`;

  server = spawn('npx', ['tsx', 'index.ts'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      BACKEND_PORT: String(port),
      DATABASE_URL: db.url,
      SUPABASE_JWT_SECRET: TEST_JWT_SECRET,
      SUPABASE_URL: '', // keep the JWKS path and issuer pinning off
      // Small task cache so startup takes seconds, not a minute
      TASK_CACHE_NAVIGATE_COUNT: '20',
      TASK_CACHE_DELETE_COUNT: '20',
      TASK_CACHE_YANK_PASTE_COUNT: '10',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr?.on('data', (d: Buffer) => {
    const line = d.toString();
    if (line.includes('Error') || line.includes('error')) {
      console.error('[server]', line.trim());
    }
  });

  // Server waits for the task cache before listening; allow for generation.
  // Poll the root health check — unlike /health it never gates on tokens.
  await eventually(async () => {
    try {
      const res = await fetch(`${base}/`);
      return res.ok ? true : null;
    } catch {
      return null;
    }
  }, 60_000);
});

afterAll(async () => {
  server?.kill('SIGTERM');
  await db?.stop();
});

describe('GET /api/task/practice', () => {
  it('anonymous: serves tasks, no session row, gameId null', async () => {
    const before = await db.query('SELECT count(*)::int AS n FROM games');
    const res = await fetch(`${base}/api/task/practice`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as PracticeResponse;
    expect(body.tasks.length).toBeGreaterThan(0);
    expect(body.gameId).toBeNull();
    const after = await db.query('SELECT count(*)::int AS n FROM games');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('authenticated: returns gameId with matching games + game_players rows', async () => {
    const res = await fetch(`${base}/api/task/practice`, {
      headers: { Authorization: `Bearer ${aliceToken()}` },
    });
    const body = (await res.json()) as PracticeResponse;
    expect(typeof body.gameId).toBe('number');
    expect(
      body.tasks.every((t) => /^[0-9a-f]{64}$/.test(t.contentHash ?? ''))
    ).toBe(true);

    const game = await db.query(
      'SELECT play_mode, task_hashes FROM games WHERE id = $1',
      [body.gameId]
    );
    expect(game.rows[0].play_mode).toBe('practice');
    expect(game.rows[0].task_hashes).toHaveLength(body.tasks.length);

    const player = await db.query(
      'SELECT user_id FROM game_players WHERE game_id = $1',
      [body.gameId]
    );
    expect(player.rows).toEqual([{ user_id: TEST_USERS.alice }]);
  });
});

describe('POST /api/task/keystrokes', () => {
  let gameId: number;
  let taskHash: string;
  let taskId: string;
  let taskType: string;

  beforeAll(async () => {
    const res = await fetch(`${base}/api/task/practice`, {
      headers: { Authorization: `Bearer ${aliceToken()}` },
    });
    const body = (await res.json()) as PracticeResponse;
    gameId = body.gameId!;
    taskHash = body.tasks[0]!.contentHash!;
    taskId = body.tasks[0]!.id;
    taskType = body.tasks[0]!.type;
  });

  function submission() {
    const now = Date.now();
    return {
      source: 'practice',
      taskId,
      taskType,
      startedAt: now - 3000,
      completedAt: now,
      events: keystrokeEvents(4),
      gameId,
      taskHash,
    };
  }

  it('with auth: persists the attempt with compacted keystrokes', async () => {
    const res = await fetch(`${base}/api/task/keystrokes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken()}`,
      },
      body: JSON.stringify(submission()),
    });
    expect(res.ok).toBe(true);

    const row = await eventually(async () => {
      const r = await db.query(
        `SELECT duration_ms, keystroke_count, keystrokes FROM task_attempts
         WHERE game_id = $1 AND task_hash = $2`,
        [gameId, taskHash]
      );
      return r.rowCount ? r.rows[0] : null;
    });
    expect(row.duration_ms).toBe(3000);
    expect(row.keystroke_count).toBe(4);
    expect(row.keystrokes).toHaveLength(4);
    expect(row.keystrokes[0]).toEqual({ k: 'j', t: 0 });
  });

  it('without auth: accepts the request but persists nothing', async () => {
    const before = await db.query(
      'SELECT count(*)::int AS n FROM task_attempts'
    );
    const res = await fetch(`${base}/api/task/keystrokes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission()),
    });
    expect(res.ok).toBe(true); // in-memory replay recording still succeeds
    await new Promise((r) => setTimeout(r, 500));
    const after = await db.query(
      'SELECT count(*)::int AS n FROM task_attempts'
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

describe('POST /api/leaderboard/session', () => {
  it('accepts yank_paste tasks and finishes the referenced session', async () => {
    const practice = await fetch(`${base}/api/task/practice`, {
      headers: { Authorization: `Bearer ${aliceToken()}` },
    });
    const body = (await practice.json()) as PracticeResponse;
    // Real served tasks — includes yank_paste, the type the old validator rejected
    expect(body.tasks.some((t) => t.type === 'yank_paste')).toBe(true);

    // The timing validator anchors duration to the server-created session:
    // >= 250ms/task and <= server-elapsed + 5s tolerance. With 10 tasks the
    // floor is 2500ms, which fits the tolerance window with no waiting.
    const duration_ms = body.tasks.length * 250 + 100;

    const res = await fetch(`${base}/api/leaderboard/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken()}`,
      },
      body: JSON.stringify({
        play_mode: 'practice',
        duration_ms,
        tasks: body.tasks,
        game_id: body.gameId,
      }),
    });
    expect(res.status, await res.clone().text()).toBe(200);

    const finished = await eventually(async () => {
      const r = await db.query('SELECT finished_at FROM games WHERE id = $1', [
        body.gameId,
      ]);
      return r.rows[0]?.finished_at ?? null;
    });
    expect(finished).not.toBeNull();

    const player = await db.query(
      'SELECT total_time_ms, finished FROM game_players WHERE game_id = $1',
      [body.gameId]
    );
    expect(player.rows[0]).toMatchObject({
      total_time_ms: duration_ms,
      finished: true,
    });
  });
});
