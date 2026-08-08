/**
 * Shared harness for integration tests: boots a throwaway Postgres in Docker,
 * applies the real migrations (with a stub for the Supabase-managed pieces),
 * seeds test users, and mints HS256 JWTs the backend accepts via its legacy
 * shared-secret verification path.
 *
 * Each call to startTestDatabase() gets its own container and port, so suites
 * can run in parallel without colliding.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations'
);

/** Shared HS256 secret; the spawned server gets the same value via env. */
export const TEST_JWT_SECRET = 'integration-test-secret';

export const TEST_USERS = {
  alice: '11111111-1111-1111-1111-111111111111',
  bob: '22222222-2222-2222-2222-222222222222',
  /** Seeded in auth terms but NOT a member of any game (guard tests). */
  mallory: '33333333-3333-3333-3333-333333333333',
} as const;

/**
 * profiles is normally created by migration 002, which depends on Supabase's
 * auth schema — stub just the table shape the backend queries.
 */
const STUB_PROFILES_SQL = `
  CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    is_premium BOOLEAN NOT NULL DEFAULT false,
    has_completed_onboarding BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

/** The 002 pieces that don't depend on auth.users. */
const MIGRATION_002_PORTABLE_SQL = `
  ALTER TABLE leaderboard_runs
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS is_pre_auth BOOLEAN NOT NULL DEFAULT false;
`;

export interface TestDatabase {
  url: string;
  containerName: string;
  query: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>;
  stop: () => Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const port = 55500 + Math.floor(Math.random() * 400);
  const containerName = `vimracing-it-${port}`;
  execSync(
    `docker run --rm -d --name ${containerName} -e POSTGRES_PASSWORD=t -p ${port}:5432 postgres:16`,
    { stdio: 'pipe' }
  );
  const url = `postgres://postgres:t@localhost:${port}/postgres`;

  const client = await waitForReady(url, containerName);

  await client.query(STUB_PROFILES_SQL);
  await client.query(readMigration('001_leaderboard_runs.sql'));
  await client.query(MIGRATION_002_PORTABLE_SQL);
  await client.query(readMigration('003_games_and_stats.sql'));
  await client.query(
    `INSERT INTO profiles (id, display_name) VALUES
       ($1, 'alice'), ($2, 'bob'), ($3, 'mallory')`,
    [TEST_USERS.alice, TEST_USERS.bob, TEST_USERS.mallory]
  );

  return {
    url,
    containerName,
    query: (sql, params) => client.query(sql, params as unknown[]),
    stop: async () => {
      await client.end().catch(() => {});
      execSync(`docker stop ${containerName}`, { stdio: 'pipe' });
    },
  };
}

function readMigration(name: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
}

async function waitForReady(
  url: string,
  containerName: string
): Promise<pg.Client> {
  const deadline = Date.now() + 30_000;
  // A fresh client per attempt: a failed connect poisons the Client instance.
  for (;;) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      return client;
    } catch (err) {
      await client.end().catch(() => {});
      if (Date.now() > deadline) {
        execSync(`docker stop ${containerName}`, { stdio: 'pipe' });
        throw new Error(`Postgres container not ready in 30s: ${String(err)}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

/**
 * Mint a token the backend's legacy HS256 verification path accepts.
 * `iss` must contain "supabase" to pass the isSupabaseToken() pre-check;
 * the spawned server runs with SUPABASE_URL unset, so issuer pinning is off.
 */
export function mintTestToken(userId: string): string {
  return jwt.sign(
    {
      sub: userId,
      email: `${userId.slice(0, 8)}@test.local`,
      iss: 'https://test.supabase.co/auth/v1',
    },
    TEST_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}
