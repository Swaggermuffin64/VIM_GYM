import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { SUPABASE_JWT_SECRET, SUPABASE_URL } from '../config.js';

export interface SupabaseUser {
  id: string;
  email?: string;
}

export interface SupabaseAuthResult {
  success: boolean;
  user?: SupabaseUser;
  error?: string;
}

interface SupabaseTokenClaims {
  sub?: string;
  iss?: string;
  email?: string;
}

/**
 * Lazily-built remote key set for Supabase's asymmetric signing keys.
 * `jose` caches the fetched JWKS internally and refetches only when it sees an
 * unknown key id, so this is built once per process rather than per request.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
    );
  }
  return jwks;
}

/** Drops the cached key set so tests can stub `fetch` per case. */
export function resetJwksCacheForTests(): void {
  jwks = undefined;
}

/**
 * Supabase tokens must be issued by our own project. `iss` is
 * `{SUPABASE_URL}/auth/v1`, so a prefix match pins the project. When
 * SUPABASE_URL is configured a missing `iss` fails closed; when it is not
 * configured, pinning is off and the signing secret is the sole trust anchor
 * (config.ts warns loudly about that at startup).
 */
function hasMatchingIssuer(iss: string | undefined): boolean {
  if (!SUPABASE_URL) return true;
  if (!iss) return false;
  return iss.startsWith(SUPABASE_URL);
}

function toResult(claims: SupabaseTokenClaims): SupabaseAuthResult {
  if (!claims.sub) {
    return { success: false, error: 'Token missing user ID' };
  }
  if (!hasMatchingIssuer(claims.iss)) {
    return { success: false, error: 'Token issuer mismatch' };
  }
  return {
    success: true,
    user: {
      id: claims.sub,
      ...(claims.email !== undefined && { email: claims.email }),
    },
  };
}

/** Legacy path: projects still using the shared HS256 JWT secret. */
function verifyWithSharedSecret(token: string): SupabaseAuthResult {
  if (!SUPABASE_JWT_SECRET) {
    return { success: false, error: 'SUPABASE_JWT_SECRET not configured' };
  }
  try {
    const claims = jwt.verify(token, SUPABASE_JWT_SECRET, {
      algorithms: ['HS256'],
    }) as SupabaseTokenClaims;
    return toResult(claims);
  } catch {
    return { success: false, error: 'Invalid or expired token' };
  }
}

/**
 * Current path: projects using asymmetric signing keys (ES256/RS256). The
 * public half is published as a JWKS, so no secret needs to live in our env.
 */
async function verifyWithPublishedKey(
  token: string
): Promise<SupabaseAuthResult> {
  if (!SUPABASE_URL) {
    return { success: false, error: 'SUPABASE_URL not configured' };
  }
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      algorithms: ['ES256', 'RS256'],
    });
    return toResult(payload as SupabaseTokenClaims);
  } catch {
    return { success: false, error: 'Invalid or expired token' };
  }
}

/**
 * Verify a JWT issued by Supabase Auth and return the user's UUID.
 *
 * Supabase signs tokens either with a legacy shared HS256 secret or with an
 * asymmetric key whose public half it publishes as a JWKS. The token's own
 * `alg` header selects which verifier applies, so a project can be migrated
 * between the two schemes without a code change.
 */
export async function verifySupabaseToken(
  token: string
): Promise<SupabaseAuthResult> {
  const header = jwt.decode(token, { complete: true })?.header;
  if (!header) {
    return { success: false, error: 'Invalid or expired token' };
  }
  return header.alg === 'HS256'
    ? verifyWithSharedSecret(token)
    : verifyWithPublishedKey(token);
}

/**
 * Peek at the token's `iss` claim (without verifying) to determine
 * whether it was issued by Supabase. Used to route to the correct verifier.
 * With SUPABASE_URL configured, only our own project's issuer qualifies;
 * without it, any issuer mentioning supabase routes here and verification
 * decides.
 */
export function isSupabaseToken(token: string): boolean {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded !== 'object') return false;
    const iss = (decoded as { iss?: string }).iss;
    if (typeof iss !== 'string') return false;
    return SUPABASE_URL
      ? iss.startsWith(SUPABASE_URL)
      : iss.includes('supabase');
  } catch {
    return false;
  }
}
