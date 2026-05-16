import jwt from 'jsonwebtoken';
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

/**
 * Verify a JWT issued by Supabase Auth.
 * Returns the user's UUID on success.
 */
export function verifySupabaseToken(token: string): SupabaseAuthResult {
  if (!SUPABASE_JWT_SECRET) {
    return { success: false, error: 'SUPABASE_JWT_SECRET not configured' };
  }

  try {
    const payload = jwt.verify(token, SUPABASE_JWT_SECRET, {
      algorithms: ['HS256'],
    }) as { sub?: string; iss?: string; email?: string };

    if (!payload.sub) {
      return { success: false, error: 'Token missing user ID' };
    }

    if (SUPABASE_URL && payload.iss && !payload.iss.startsWith(SUPABASE_URL)) {
      return { success: false, error: 'Token issuer mismatch' };
    }

    return {
      success: true,
      user: { id: payload.sub, email: payload.email },
    };
  } catch {
    return { success: false, error: 'Invalid or expired token' };
  }
}

/**
 * Peek at the token's `iss` claim (without verifying) to determine
 * whether it was issued by Supabase. Used to route to the correct verifier.
 */
export function isSupabaseToken(token: string): boolean {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded !== 'object') return false;
    const iss = (decoded as { iss?: string }).iss;
    return typeof iss === 'string' && iss.includes('supabase');
  } catch {
    return false;
  }
}
