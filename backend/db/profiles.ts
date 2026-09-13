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
 *
 * Display names are case-insensitively unique (006_unique_display_names.sql);
 * a collision surfaces as { status: 'name_taken' } rather than an exception
 * so routes can return a friendly 409. Other database errors still throw.
 */
export type UpsertProfileResult =
  | { status: 'ok'; profile: Profile }
  | { status: 'name_taken' }
  | { status: 'error' };

export async function upsertProfile(
  userId: string,
  data: { display_name: string; avatar_url?: string | null | undefined }
): Promise<UpsertProfileResult> {
  const pool = getPool();
  if (!pool) return { status: 'error' };

  try {
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
    const profile = result.rows[0];
    if (!profile) return { status: 'error' };
    return { status: 'ok', profile };
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return { status: 'name_taken' };
    }
    throw err;
  }
}
