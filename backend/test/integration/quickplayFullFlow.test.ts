/**
 * Full quickplay flow against a real spawned backend AND matchmaker: two
 * players queue on the matchmaker WebSocket, receive match:found with a room
 * id + match token, connect to the game server exactly as the frontend does
 * (match token + Supabase user token in the handshake), join the matched room,
 * and race. Asserts the game session is persisted as play_mode='quick_play'.
 *
 * Exists to catch quickplay-only persistence regressions that the simpler
 * quickplayPersistence test (no matchmaker, no match token) cannot see.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import WebSocket from 'ws';
import {
  startTestDatabase,
  mintTestToken,
  TEST_JWT_SECRET,
  TEST_USERS,
  type TestDatabase,
} from './harness.js';

const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);
const BACKEND_DIR = path.join(REPO_ROOT, 'backend');
const MATCHMAKING_DIR = path.join(REPO_ROOT, 'matchmaking');

let db: TestDatabase;
let backend: ChildProcess | undefined;
let matchmaker: ChildProcess | undefined;
let backendBase = '';
let matchmakerBase = '';

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

interface MatchFound {
  type: 'match:found';
  roomId: string;
  connectionUrl: string;
  token?: string;
}

/** Queue a player on the matchmaker and resolve with its match:found payload. */
function queueForMatch(playerName: string): Promise<MatchFound> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(matchmakerBase);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`matchmaker timed out for ${playerName}`));
    }, 15_000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'queue:join', playerName }));
    });
    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'match:found') {
        clearTimeout(timer);
        ws.close();
        resolve(msg as MatchFound);
      }
      if (msg.type === 'error') {
        clearTimeout(timer);
        ws.close();
        reject(new Error(`matchmaker error: ${msg.message}`));
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Connect to the game server the way the frontend's connectSocket does. */
function connectPlayer(userId: string, matchToken?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(backendBase, {
      transports: ['websocket'],
      auth: {
        ...(matchToken ? { token: matchToken } : {}),
        userToken: mintTestToken(userId),
      },
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
}

function waitForEvent<T>(
  socket: Socket,
  event: string,
  ms = 20_000
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
  const backendPort = 4200 + Math.floor(Math.random() * 90);
  const matchmakerPort = 4300 + Math.floor(Math.random() * 90);
  backendBase = `http://localhost:${backendPort}`;
  matchmakerBase = `ws://localhost:${matchmakerPort}`;

  backend = spawn('npx', ['tsx', 'index.ts'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      BACKEND_PORT: String(backendPort),
      DATABASE_URL: db.url,
      SUPABASE_JWT_SECRET: TEST_JWT_SECRET,
      SUPABASE_URL: '',
      TASK_CACHE_NAVIGATE_COUNT: '20',
      TASK_CACHE_DELETE_COUNT: '20',
      TASK_CACHE_YANK_PASTE_COUNT: '10',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  matchmaker = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: MATCHMAKING_DIR,
    env: {
      ...process.env,
      PORT: String(matchmakerPort),
      GAME_SERVER_URL: backendBase,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const proc of [backend, matchmaker]) {
    proc.stderr?.on('data', (d: Buffer) => {
      const line = d.toString();
      if (/error/i.test(line)) console.error('[proc]', line.trim());
    });
    proc.stdout?.on('data', (d: Buffer) => {
      const line = d.toString();
      if (line.includes('[stats]')) console.error('[proc]', line.trim());
    });
  }

  await eventually(async () => {
    try {
      const res = await fetch(`${backendBase}/`);
      return res.ok ? true : null;
    } catch {
      return null;
    }
  }, 60_000);
  await eventually(async () => {
    try {
      const res = await fetch(
        `http://localhost:${matchmakerPort}/health`
      ).catch(() => fetch(`http://localhost:${matchmakerPort}/`));
      return res ? true : null;
    } catch {
      return null;
    }
  }, 30_000);
}, 120_000);

afterAll(async () => {
  backend?.kill('SIGTERM');
  matchmaker?.kill('SIGTERM');
  await db?.stop();
});

describe('quickplay full flow (matchmaker + game server)', () => {
  it('persists the matched race as a quick_play game session', async () => {
    const [aliceMatch, bobMatch] = await Promise.all([
      queueForMatch('alice'),
      queueForMatch('bob'),
    ]);
    expect(aliceMatch.roomId).toBe(bobMatch.roomId);

    const alice = await connectPlayer(TEST_USERS.alice, aliceMatch.token);
    const bob = await connectPlayer(TEST_USERS.bob, bobMatch.token);
    try {
      const aliceIn = Promise.race([
        waitForEvent(alice, 'room:created'),
        waitForEvent(alice, 'room:joined'),
      ]);
      alice.emit('room:join_matched', { roomId: aliceMatch.roomId });
      await aliceIn;

      const bobIn = Promise.race([
        waitForEvent(bob, 'room:created'),
        waitForEvent(bob, 'room:joined'),
      ]);
      bob.emit('room:join_matched', { roomId: bobMatch.roomId });
      await bobIn;

      const raceStarted = Promise.all([
        waitForEvent(alice, 'game:start'),
        waitForEvent(bob, 'game:start'),
      ]);
      alice.emit('player:ready_to_play');
      bob.emit('player:ready_to_play');
      await raceStarted;

      const game = await eventually(async () => {
        const res = await db.query(
          `SELECT id, room_id FROM games WHERE play_mode = 'quick_play'`
        );
        return res.rows.length > 0 ? res.rows[0] : null;
      });
      expect(game.room_id).toBe(aliceMatch.roomId);

      const players = await db.query(
        `SELECT user_id FROM game_players WHERE game_id = $1 ORDER BY user_id`,
        [game.id]
      );
      expect(players.rows.map((r) => r.user_id)).toEqual([
        TEST_USERS.alice,
        TEST_USERS.bob,
      ]);

      // Results-screen stats: each client submits its task keystrokes the way
      // the frontend does, then fetches the per-player averages endpoint.
      const now = Date.now();
      for (const [socket, name] of [
        [alice, 'alice'],
        [bob, 'bob'],
      ] as const) {
        const res = await fetch(`${backendBase}/api/task/keystrokes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            source: 'multiplayer',
            taskId: `task-${name}`,
            taskType: 'navigate',
            startedAt: now - 3000,
            completedAt: now,
            roomId: aliceMatch.roomId,
            playerId: socket.id,
            events: [
              {
                key: 'j',
                altKey: false,
                ctrlKey: false,
                metaKey: false,
                shiftKey: false,
                repeat: false,
                dtMs: 0,
              },
            ],
          }),
        });
        const body = (await res.json()) as { success: boolean; error?: string };
        expect(body).toMatchObject({ success: true });
      }

      const statsRes = await fetch(
        `${backendBase}/api/multiplayer/stats/${aliceMatch.roomId}`,
        { headers: { Authorization: `Bearer ${aliceMatch.token}` } }
      );
      expect(statsRes.status).toBe(200);
      const stats = (await statsRes.json()) as {
        success: boolean;
        players: Array<{ playerId: string }>;
      };
      expect(stats.success).toBe(true);
      expect(stats.players.map((p) => p.playerId).sort()).toEqual(
        [alice.id, bob.id].sort()
      );
    } finally {
      alice.disconnect();
      bob.disconnect();
    }
  }, 90_000);
});
