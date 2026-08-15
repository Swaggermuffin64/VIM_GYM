import { getPool } from './pool.js';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_premium: boolean;
  has_completed_onboarding: boolean;
  created_at: Date;
}

/** Fetch a profile by Supabase user UUID. Returns null if not found or no DB. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const pool = getPool();
  if (!pool) return null;

  const result = await pool.query<Profile>(
    `SELECT id, display_name, avatar_url, is_premium, has_completed_onboarding, created_at
     FROM profiles WHERE id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

/**
 * Insert or update a profile's display_name and avatar_url.
 * avatar_url is only overwritten when explicitly provided (not null-coalesced away).
 * Sets has_completed_onboarding = true.
 */
export async function upsertProfile(
  userId: string,
  data: { display_name: string; avatar_url?: string | null | undefined }
): Promise<Profile | null> {
  const pool = getPool();
  if (!pool) return null;

  const result = await pool.query<Profile>(
    `INSERT INTO profiles (id, display_name, avatar_url, has_completed_onboarding)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
       has_completed_onboarding = true
     RETURNING id, display_name, avatar_url, is_premium, has_completed_onboarding, created_at`,
    [userId, data.display_name, data.avatar_url ?? null]
  );
  return result.rows[0] ?? null;
}
