import { isSupabaseToken, verifySupabaseToken } from './supabaseAuth.js';
import { getProfile } from '../db/profiles.js';

export type SocketIdentityResult =
  | { ok: true; userId: string; displayName: string }
  | { ok: false; error: string };

/**
 * Resolve a Socket.IO handshake token into an authenticated user id and
 * their profile display name. There is no anonymous/guest path — every
 * multiplayer connection must resolve successfully or be rejected.
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

  const profile = await getProfile(verifyResult.user.id);
  if (!profile) {
    return { ok: false, error: 'Profile not found' };
  }

  return {
    ok: true,
    userId: verifyResult.user.id,
    displayName: profile.display_name,
  };
}
