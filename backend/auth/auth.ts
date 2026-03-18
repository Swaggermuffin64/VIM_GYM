/**
 * Match Token Authentication
 *
 * Verifies short-lived JWTs issued by the matchmaking service for
 * quick-match connections. Private room connections (direct) are
 * allowed without a token — rate and connection limiters handle abuse.
 */

import jwt from 'jsonwebtoken';
import { MATCH_TOKEN_SECRET } from '../config.js';

export interface MatchTokenPayload {
  playerId: string;
  roomId: string;
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  success: boolean;
  userId?: string;
  /** The roomId encoded in the match token (undefined for tokenless connections) */
  matchedRoomId?: string;
  error?: string;
}

if (!MATCH_TOKEN_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ MATCH_TOKEN_SECRET is required in production');
    process.exit(1);
  }
  console.warn('⚠️ MATCH_TOKEN_SECRET not set — match token verification disabled (dev only)');
}

/**
 * Verify a match token signed by the matchmaking service.
 * When no token is provided (private room / local dev), generates a
 * local user ID and allows the connection.
 */
export function verifyMatchToken(token: string | undefined): AuthResult {
  if (!token) {
    return {
      success: true,
      userId: `local_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };
  }

  if (!MATCH_TOKEN_SECRET) {
    // Dev mode: accept token without verification, extract payload
    try {
      const decoded = jwt.decode(token);
      if (decoded && typeof decoded === 'object' && 'playerId' in decoded) {
        const payload = decoded as MatchTokenPayload;
        return { success: true, userId: payload.playerId, matchedRoomId: payload.roomId };
      }
    } catch { /* fall through */ }
    return {
      success: true,
      userId: `local_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };
  }

  try {
    const payload = jwt.verify(token, MATCH_TOKEN_SECRET, { algorithms: ['HS256'] }) as MatchTokenPayload;
    if (!payload.playerId) {
      return { success: false, error: 'Token missing player ID' };
    }
    return { success: true, userId: payload.playerId, matchedRoomId: payload.roomId };
  } catch {
    return { success: false, error: 'Invalid or expired match token' };
  }
}

/**
 * Extract auth token from Socket.IO handshake
 */
export function extractTokenFromHandshake(handshake: { auth?: { token?: string } }): string | undefined {
  return handshake?.auth?.token;
}

/**
 * Extract bearer token from HTTP Authorization header.
 */
export function extractTokenFromAuthHeader(
  headers: { authorization?: string | string[] | undefined }
): string | undefined {
  const rawAuth = headers.authorization;
  const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  if (!authHeader) return undefined;

  const [scheme, token] = authHeader.trim().split(/\s+/, 2);
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== 'bearer') return undefined;
  return token;
}
