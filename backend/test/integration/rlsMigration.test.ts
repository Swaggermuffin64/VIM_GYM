/**
 * Integration test for migration 004 (row level security). The backend is the
 * only intended writer of these tables, but Supabase exposes them over
 * PostgREST to the anon/authenticated roles by default. Migration 004 enables
 * RLS with no policies, which denies those roles everything while leaving the
 * owning role (the backend's connection) untouched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestDatabase, TEST_USERS, type TestDatabase } from './harness.js';

const MIGRATION_004 = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
  '004_enable_rls.sql'
);

const PROTECTED_TABLES = [
  'profiles',
  'leaderboard_runs',
  'games',
  'game_players',
  'tasks',
  'task_attempts',
];

let db: TestDatabase;

beforeAll(async () => {
  db = await startTestDatabase();
  await db.query(readFileSync(MIGRATION_004, 'utf8'));

  // Simulate Supabase's PostgREST client role: broad table grants, but no
  // table ownership and no BYPASSRLS.
  await db.query(`CREATE ROLE pseudo_anon NOLOGIN`);
  await db.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pseudo_anon`
  );
  await db.query(
    `GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pseudo_anon`
  );
});

afterAll(async () => {
  await db?.stop();
});

describe('migration 004: row level security', () => {
  it('enables RLS on every user-data table', async () => {
    const r = await db.query(
      `SELECT relname FROM pg_class
       WHERE relname = ANY($1) AND relrowsecurity`,
      [PROTECTED_TABLES]
    );
    expect(r.rows.map((row) => row.relname).sort()).toEqual(
      [...PROTECTED_TABLES].sort()
    );
  });

  it('denies a granted-but-unowned role all reads (no policies exist)', async () => {
    await db.query(`SET ROLE pseudo_anon`);
    try {
      const r = await db.query(`SELECT * FROM profiles`);
      expect(r.rows).toEqual([]); // rows exist, but RLS filters them all
    } finally {
      await db.query(`RESET ROLE`);
    }
    const asOwner = await db.query(`SELECT count(*)::int AS n FROM profiles`);
    expect(asOwner.rows[0].n).toBeGreaterThan(0);
  });

  it('denies a granted-but-unowned role writes', async () => {
    await db.query(`SET ROLE pseudo_anon`);
    try {
      await expect(
        db.query(
          `UPDATE profiles SET display_name = 'pwned' WHERE id = $1 RETURNING id`,
          [TEST_USERS.alice]
        )
      ).resolves.toMatchObject({ rowCount: 0 });
      await expect(
        db.query(
          `INSERT INTO games (play_mode, task_hashes, started_at) VALUES ('practice', '{}', now())`
        )
      ).rejects.toThrow(/row-level security/);
    } finally {
      await db.query(`RESET ROLE`);
    }
  });

  it('leaves the owning role (the backend connection) unrestricted', async () => {
    const r = await db.query(
      `UPDATE profiles SET display_name = display_name WHERE id = $1 RETURNING id`,
      [TEST_USERS.alice]
    );
    expect(r.rowCount).toBe(1);
  });
});
