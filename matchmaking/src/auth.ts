/**
 * Match Token Utilities
 *
 * Signs short-lived JWTs that the matchmaker issues to players on
 * match:found.  The game server verifies these on Socket.IO connect
 * using the same MATCH_TOKEN_SECRET.
 */

import jwt from 'jsonwebtoken';

export interface AuthResult {
  success: boolean;
  userId?: string;
  error?: string;
}

const MATCH_TOKEN_SECRET = process.env.MATCH_TOKEN_SECRET;

if (!MATCH_TOKEN_SECRET) {
  console.warn(
    '⚠️ MATCH_TOKEN_SECRET not set — token signing disabled (dev only)'
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
    expiresIn: '15m',
  });
}

/**
 * Verify an incoming auth token.
 * When no token is provided and auth is not required, generates a
 * temporary anonymous user ID.
 */
export function verifyToken(
  token: string | undefined,
  requireAuth: boolean = true
): AuthResult {
  if (!token) {
    if (requireAuth) {
      return { success: false, error: 'Authentication token required' };
    }
    return {
      success: true,
      userId: `anon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };
  }

  if (!MATCH_TOKEN_SECRET) {
    // Dev mode: accept any token, extract payload if possible
    try {
      const decoded = jwt.decode(token);
      if (decoded && typeof decoded === 'object' && 'playerId' in decoded) {
        return {
          success: true,
          userId: (decoded as { playerId: string }).playerId,
        };
      }
    } catch {
      /* fall through */
    }
    return {
      success: true,
      userId: `anon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };
  }

  try {
    const payload = jwt.verify(token, MATCH_TOKEN_SECRET) as {
      playerId?: string;
    };
    return { success: true, userId: payload.playerId || 'unknown' };
  } catch {
    return { success: false, error: 'Invalid or expired token' };
  }
}
