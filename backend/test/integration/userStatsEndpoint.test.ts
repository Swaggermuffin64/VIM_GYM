/**
 * Integration tests for GET /api/user/stats — the authenticated endpoint
 * that returns aggregated racing statistics for the signed-in user's
 * profile page.
 *
 * Spawns a real backend against a real Postgres container, just like
 * statsEndpoints.test.ts, and exercises the auth gate + zero-state +
 * seeded-data paths.
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

/** Poll until a predicate returns a truthy value, or throw after `ms`. */
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

describe('GET /api/user/stats', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${base}/api/user/stats`);
    expect(res.status).toBe(401);
  });

  it('returns zeroed stats for a user with no data', async () => {
    const res = await fetch(`${base}/api/user/stats`, {
      headers: { Authorization: `Bearer ${mintTestToken(TEST_USERS.mallory)}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      stats: {
        races_played: 0,
        wins: 0,
        win_rate: 0,
        best_race_ms: null,
        tasks_completed: 0,
        avg_task_ms: null,
        recent_games: [],
      },
    });
  });

  it('returns aggregates and recent games for a seeded user', async () => {
    // Seed one won race for alice directly via the harness db handle.
    await db.query(
      `INSERT INTO tasks (content_hash, task_type, task_json) VALUES ('h1', 'navigate', '{}')`
    );
    await db.query(
      `INSERT INTO games (id, play_mode, task_hashes, started_at, finished_at)
       VALUES (201, 'quick_play', '{h1}', now(), now())`
    );
    await db.query(
      `INSERT INTO game_players (game_id, user_id, position, total_time_ms, finished)
       VALUES (201, $1, 1, 60000, true)`,
      [TEST_USERS.alice]
    );
    const res = await fetch(`${base}/api/user/stats`, {
      headers: { Authorization: `Bearer ${mintTestToken(TEST_USERS.alice)}` },
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.stats.races_played).toBe(1);
    expect(body.stats.wins).toBe(1);
    expect(body.stats.win_rate).toBe(1);
    expect(body.stats.best_race_ms).toBe(60000);
    expect(body.stats.recent_games).toHaveLength(1);
    expect(body.stats.recent_games[0].play_mode).toBe('quick_play');
  });
});
