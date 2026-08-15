import { isSupabaseToken, verifySupabaseToken } from './supabaseAuth.js';
import { getProfile } from '../db/profiles.js';
import { getCachedDisplayName, setCachedDisplayName } from './identityCache.js';

export type SocketIdentityResult =
  | { ok: true; userId: string; displayName: string }
  | { ok: false; error: string };

/**
 * Resolve a Socket.IO handshake token into an authenticated user id and
 * their profile display name. There is no anonymous/guest path — every
 * multiplayer connection must resolve successfully or be rejected.
 *
 * A short-lived cache skips the getProfile() lookup for a userId resolved
 * in the last 60s, so a burst of reconnects from the same users (e.g.
 * after a backend redeploy) doesn't hammer the DB pool. Token verification
 * itself is never skipped.
 */
export async function resolveSocketIdentity(
  userToken: string | undefined
): Promise<SocketIdentityResult> {
  if (!userToken || !isSupabaseToken(userToken)) {
    return { ok: false, error: 'Authentication required' };
  }

  const verifyResult = await verifySupabaseToken(userToken);
  if (!verifyResult.success || !verifyResult.user) {
    return { ok: false, error: verifyResult.error || 'Authentication failed' };
  }

  const userId = verifyResult.user.id;
  const cachedDisplayName = getCachedDisplayName(userId);
  if (cachedDisplayName !== undefined) {
    return { ok: true, userId, displayName: cachedDisplayName };
  }

  const profile = await getProfile(userId);
  if (!profile) {
    return { ok: false, error: 'Profile not found' };
  }

  setCachedDisplayName(userId, profile.display_name);
  return { ok: true, userId, displayName: profile.display_name };
}
