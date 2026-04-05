import pg from 'pg';
import { DATABASE_URL } from '../config.js';

let pool: pg.Pool | null = null;

/** Shared pool when `DATABASE_URL` is set; otherwise `null`. */
export function getPool(): pg.Pool | null {
  if (!DATABASE_URL) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 8,
    });
  }
  return pool;
}

/** For tests or graceful shutdown. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function dbHealthCheck(): Promise<'ok' | 'skipped' | 'error'> {
  const p = getPool();
  if (!p) return 'skipped';
  try {
    await p.query('SELECT 1');
    return 'ok';
  } catch {
    return 'error';
  }
}
