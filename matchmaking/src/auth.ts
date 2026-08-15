/**
 * Matchmaker Authentication
 *
 * Two responsibilities:
 *
 * 1. `verifyQueueAuth` — verify the Supabase access token a client presents
 *    on queue:join. The matchmaker is the gatekeeper to the game server (it
 *    signs match tokens the game server trusts), so queue entry must prove a
 *    real identity in production. Mirrors the backend's verifier: legacy
 *    HS256 shared secret or asymmetric keys published as a JWKS, with issuer
 *    pinning to our own project.
 *
 * 2. `signMatchToken` — sign the short-lived JWT issued to players on
 *    match:found. The game server verifies it with the same
 *    MATCH_TOKEN_SECRET.
 */

import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface AuthResult {
  success: boolean;
  userId?: string;
  error?: string;
}

const MATCH_TOKEN_SECRET = process.env.MATCH_TOKEN_SECRET;
const SUPABASE_JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET?.trim() || undefined;
const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || undefined;

if (!MATCH_TOKEN_SECRET) {
  console.warn(
    '⚠️ MATCH_TOKEN_SECRET not set — token signing disabled (dev only)'
  );
}
if (!SUPABASE_JWT_SECRET && !SUPABASE_URL) {
  console.warn(
    '⚠️ Neither SUPABASE_JWT_SECRET nor SUPABASE_URL is set — queue auth ' +
      'cannot verify any token (dev only; queue:join fails when auth is required)'
  );
}

/**
 * Sign a short-lived JWT for a matched player.
 * Returns null when MATCH_TOKEN_SECRET is not configured (local dev).
 */
export function signMatchToken(
  playerId: string,
  roomId: string
): string | null {
  if (!MATCH_TOKEN_SECRET) return null;
  // Must outlive a full race: the client presents this token again for the
  // post-race stats fetch (ready-up + countdown + race can exceed several
  // minutes). 60s was long enough to join but expired before results loaded.
  return jwt.sign({ playerId, roomId }, MATCH_TOKEN_SECRET, {
    algorithm: 'HS256',
    expiresIn: '15m',
  });
}

/** Lazily-built remote key set for Supabase's asymmetric signing keys. */
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
    );
  }
  return jwks;
}

/**
 * Supabase tokens must be issued by our own project (`iss` is
 * `{SUPABASE_URL}/auth/v1`). With SUPABASE_URL configured a missing issuer
 * fails closed; without it, pinning is off and the signing key is the sole
 * trust anchor (warned about at startup).
 */
function hasMatchingIssuer(iss: string | undefined): boolean {
  if (!SUPABASE_URL) return true;
  if (!iss) return false;
  return iss.startsWith(SUPABASE_URL);
}

function toResult(claims: { sub?: string; iss?: string }): AuthResult {
  if (!claims.sub) {
    return { success: false, error: 'Token missing user ID' };
  }
  if (!hasMatchingIssuer(claims.iss)) {
    return { success: false, error: 'Token issuer mismatch' };
  }
  return { success: true, userId: claims.sub };
}

/** Legacy path: projects still using the shared HS256 JWT secret. */
function verifyWithSharedSecret(token: string): AuthResult {
  if (!SUPABASE_JWT_SECRET) {
    return { success: false, error: 'SUPABASE_JWT_SECRET not configured' };
  }
  try {
    const claims = jwt.verify(token, SUPABASE_JWT_SECRET, {
      algorithms: ['HS256'],
    }) as { sub?: string; iss?: string };
    return toResult(claims);
  } catch {
    return { success: false, error: 'Invalid or expired token' };
  }
}

/** Current path: asymmetric signing keys published as a JWKS. */
async function verifyWithPublishedKey(token: string): Promise<AuthResult> {
  if (!SUPABASE_URL) {
    return { success: false, error: 'SUPABASE_URL not configured' };
  }
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      algorithms: ['ES256', 'RS256'],
    });
    return toResult(payload as { sub?: string; iss?: string });
  } catch {
    return { success: false, error: 'Invalid or expired token' };
  }
}

async function verifySupabaseToken(token: string): Promise<AuthResult> {
  const header = jwt.decode(token, { complete: true })?.header;
  if (!header) {
    return { success: false, error: 'Invalid or expired token' };
  }
  return header.alg === 'HS256'
    ? verifyWithSharedSecret(token)
    : verifyWithPublishedKey(token);
}

/**
 * Authenticate a queue:join request.
 *
 * A provided token is always verified as a Supabase access token — even in
 * dev, a bad token is rejected rather than trusted. Only the complete
 * absence of a token falls back to an anonymous identity, and only when
 * auth is not required (local development).
 */
export async function verifyQueueAuth(
  token: string | undefined,
  requireAuth: boolean = true
): Promise<AuthResult> {
  if (!token) {
    if (requireAuth) {
      return { success: false, error: 'Authentication token required' };
    }
    return {
      success: true,
      userId: `anon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };
  }
  return verifySupabaseToken(token);
}
