/**
 * Reproduces the missing-quickplay-games bug: two authenticated players race
 * through the matchmaker flow (room:join_matched with a 16-hex room id) and
 * the game session must be persisted with play_mode='quick_play', exactly as
 * private matches are. A real spawned backend against a real Postgres.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io, type Socket } from 'socket.io-client';
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
let server: ChildProcess | undefined;
let base = '';

/** Fire-and-forget writes land asynchronously; poll briefly for the row. */
async function eventually<T>(
  fn: () => Promise<T | null>,
  ms = 10_000
): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const result = await fn();
    if (result !== null) return result;
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 200));
  }
}

function connectPlayer(userId: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(base, {
      transports: ['websocket'],
      auth: { userToken: mintTestToken(userId) },
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
}

function waitForEvent<T>(
  socket: Socket,
  event: string,
  ms = 15_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${event}`)),
      ms
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

beforeAll(async () => {
  db = await startTestDatabase();
  const port = 3900 + Math.floor(Math.random() * 90);
  base = `http://localhost:${port}`;

  server = spawn('npx', ['tsx', 'index.ts'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      BACKEND_PORT: String(port),
      DATABASE_URL: db.url,
      SUPABASE_JWT_SECRET: TEST_JWT_SECRET,
      SUPABASE_URL: '', // keep the JWKS path and issuer pinning off
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
  server.stdout?.on('data', (d: Buffer) => {
    const line = d.toString();
    if (line.includes('[stats]')) {
      console.error('[server]', line.trim());
    }
  });

  await eventually(async () => {
    try {
      const res = await fetch(`${base}/`);
      return res.ok ? true : null;
    } catch {
      return null;
    }
  }, 60_000);
}, 90_000);

afterAll(async () => {
  server?.kill('SIGTERM');
  await db?.stop();
});

describe('quickplay game persistence', () => {
  it('persists a quick_play games row when a matched race starts', async () => {
    const matchedRoomId = 'a1b2c3d4e5f60718'; // matchmaker-style 16-hex id

    const alice = await connectPlayer(TEST_USERS.alice);
    const bob = await connectPlayer(TEST_USERS.bob);
    try {
      const aliceCreated = waitForEvent(alice, 'room:created');
      alice.emit('room:join_matched', { roomId: matchedRoomId });
      await aliceCreated;

      const bobJoined = waitForEvent(bob, 'room:joined');
      bob.emit('room:join_matched', { roomId: matchedRoomId });
      await bobJoined;

      const raceStarted = Promise.all([
        waitForEvent(alice, 'game:start', 20_000),
        waitForEvent(bob, 'game:start', 20_000),
      ]);
      alice.emit('player:ready_to_play');
      bob.emit('player:ready_to_play');
      await raceStarted; // countdown is 3-2-1-GO, ~4s

      const game = await eventually(async () => {
        const res = await db.query(
          `SELECT id, play_mode, room_id FROM games WHERE play_mode = 'quick_play'`
        );
        return res.rows.length > 0 ? res.rows[0] : null;
      });
      expect(game.room_id).toBe(matchedRoomId);

      const players = await db.query(
        `SELECT user_id FROM game_players WHERE game_id = $1 ORDER BY user_id`,
        [game.id]
      );
      expect(players.rows.map((r) => r.user_id)).toEqual([
        TEST_USERS.alice,
        TEST_USERS.bob,
      ]);
    } finally {
      alice.disconnect();
      bob.disconnect();
    }
  }, 60_000);
});
