/**
 * Supabase bearer-token helpers for HTTP routes; Socket.IO auth lives in
 * socketIdentity.ts.
 */

import { extractTokenFromAuthHeader } from './auth.js';
import { verifySupabaseToken, isSupabaseToken } from './supabaseAuth.js';
import type { SupabaseUser } from './supabaseAuth.js';

/**
 * Extract and verify a Supabase JWT from the Authorization header.
 * Returns the user on success, or sends a 401 and returns null.
 */
export async function requireSupabaseAuth(
  request: { headers: { authorization?: string | string[] | undefined } },
  reply: { status: (code: number) => { send: (body: unknown) => unknown } }
): Promise<SupabaseUser | null> {
  const token = extractTokenFromAuthHeader(request.headers);
  if (!token || !isSupabaseToken(token)) {
    reply
      .status(401)
      .send({ success: false, error: 'Authentication required' });
    return null;
  }
  const result = await verifySupabaseToken(token);
  if (!result.success || !result.user) {
    reply
      .status(401)
      .send({ success: false, error: result.error || 'Authentication failed' });
    return null;
  }
  return result.user;
}

/**
 * Attempt to resolve a Supabase user from the request's Authorization header.
 * Unlike requireSupabaseAuth, this never writes a response — it simply returns
 * null when no valid token is present. Used for endpoints where authentication
 * is optional (e.g. practice tasks served to anonymous players).
 */
export async function tryResolveSupabaseUser(request: {
  headers: { authorization?: string | string[] | undefined };
}): Promise<SupabaseUser | null> {
  const token = extractTokenFromAuthHeader(request.headers);
  if (!token || !isSupabaseToken(token)) return null;
  const result = await verifySupabaseToken(token);
  if (!result.success || !result.user) return null;
  return result.user;
}
