/**
 * Integration tests for POST /api/user/profile against a real spawned backend
 * and Postgres. These pin the sanitization seam: what the endpoint persists
 * must be the *sanitized* display name, and avatar URLs must be validated —
 * both regressions found in code review of the auth branch.
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

interface ProfileResponse {
  success: boolean;
  error?: string;
  profile?: { display_name: string; avatar_url: string | null };
}

async function postProfile(body: Record<string, unknown>) {
  const res = await fetch(`${base}/api/user/profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mintTestToken(TEST_USERS.alice)}`,
    },
    body: JSON.stringify(body),
  });
  return { res, body: (await res.json()) as ProfileResponse };
}

async function profileRow() {
  const r = await db.query(
    'SELECT display_name, avatar_url FROM profiles WHERE id = $1',
    [TEST_USERS.alice]
  );
  return r.rows[0] as { display_name: string; avatar_url: string | null };
}

beforeAll(async () => {
  db = await startTestDatabase();
  const port = 3900 + Math.floor(Math.random() * 400);
  base = `http://localhost:${port}`;

  server = spawn('npx', ['tsx', 'index.ts'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      BACKEND_PORT: String(port),
      DATABASE_URL: db.url,
      SUPABASE_JWT_SECRET: TEST_JWT_SECRET,
      SUPABASE_URL: '', // keep the JWKS path and issuer pinning off
      TASK_CACHE_NAVIGATE_COUNT: '5',
      TASK_CACHE_DELETE_COUNT: '5',
      TASK_CACHE_YANK_PASTE_COUNT: '5',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const res = await fetch(`${base}/`);
      if (res.ok) break;
    } catch {
      // server not up yet
    }
    if (Date.now() > deadline) throw new Error('backend did not start');
    await new Promise((r) => setTimeout(r, 200));
  }
});

afterAll(async () => {
  server?.kill('SIGTERM');
  await db?.stop();
});

describe('POST /api/user/profile', () => {
  it('persists the sanitized display name, not the raw input', async () => {
    const { res, body } = await postProfile({
      display_name: `<b>Speedy</b>"&'`,
    });
    expect(res.status).toBe(200);

    // Neither the response nor the stored row may contain HTML-dangerous
    // characters — validatePlayerName strips <>'"&\ before persistence.
    const stored = await profileRow();
    for (const value of [body.profile!.display_name, stored.display_name]) {
      expect(value).not.toMatch(/[<>'"&\\]/);
    }
    expect(stored.display_name).toBe(body.profile!.display_name);
  });

  it('rejects a javascript: avatar_url with 400 and persists nothing', async () => {
    const before = await profileRow();
    const { res } = await postProfile({
      display_name: 'Speedy',
      avatar_url: 'javascript:alert(1)',
    });
    expect(res.status).toBe(400);
    const after = await profileRow();
    expect(after.avatar_url).toBe(before.avatar_url);
  });

  it('accepts and persists a well-formed https avatar_url', async () => {
    const url = 'https://cdn.example.com/avatars/alice.png';
    const { res, body } = await postProfile({
      display_name: 'Speedy',
      avatar_url: url,
    });
    expect(res.status).toBe(200);
    expect(body.profile!.avatar_url).toBe(url);
    expect((await profileRow()).avatar_url).toBe(url);
  });
});
