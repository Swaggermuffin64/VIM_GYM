/**
 * Tests for queue authentication. The matchmaker is the gatekeeper to the
 * game server (it signs match tokens the game server trusts), so queue:join
 * must verify a real Supabase identity — a match token, a forged token, or
 * no token at all must never mint a signed match token in production.
 */
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';

// Set env before importing the module under test (read at import time).
process.env.SUPABASE_JWT_SECRET = 'test-supabase-secret';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.MATCH_TOKEN_SECRET = 'test-match-secret';

const { verifyQueueAuth, signMatchToken } = await import('./auth.js');

const SUPABASE_SECRET = 'test-supabase-secret';
const MATCH_SECRET = 'test-match-secret';
const ISS = 'https://test.supabase.co/auth/v1';

function makeSupabaseToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    { sub: 'user-uuid-123', iss: ISS, ...overrides },
    SUPABASE_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

describe('verifyQueueAuth with auth required', () => {
  it('accepts a valid Supabase access token and returns its user id', async () => {
    const result = await verifyQueueAuth(makeSupabaseToken(), true);
    expect(result.success).toBe(true);
    expect(result.userId).toBe('user-uuid-123');
  });

  it('rejects a missing token', async () => {
    const result = await verifyQueueAuth(undefined, true);
    expect(result.success).toBe(false);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = jwt.sign({ sub: 'u', iss: ISS }, 'wrong-secret', {
      algorithm: 'HS256',
    });
    const result = await verifyQueueAuth(token, true);
    expect(result.success).toBe(false);
  });

  it('rejects an expired token', async () => {
    const token = jwt.sign({ sub: 'u', iss: ISS }, SUPABASE_SECRET, {
      algorithm: 'HS256',
      expiresIn: '-1s',
    });
    const result = await verifyQueueAuth(token, true);
    expect(result.success).toBe(false);
  });

  it('rejects a token from a different Supabase project (issuer mismatch)', async () => {
    const token = makeSupabaseToken({
      iss: 'https://other.supabase.co/auth/v1',
    });
    const result = await verifyQueueAuth(token, true);
    expect(result.success).toBe(false);
  });

  it('rejects a match token — matched players must not requeue with it', async () => {
    // A match token is signed with MATCH_TOKEN_SECRET, not the Supabase
    // secret. Accepting it would let anyone with one old match token mint
    // fresh ones forever.
    const matchToken = signMatchToken('player-1', 'room-1');
    expect(matchToken).not.toBeNull();
    const result = await verifyQueueAuth(matchToken!, true);
    expect(result.success).toBe(false);
  });

  it('rejects an unsigned (alg "none") token', async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' })
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'user-uuid-123', iss: ISS })
    ).toString('base64url');
    const result = await verifyQueueAuth(`${header}.${payload}.`, true);
    expect(result.success).toBe(false);
  });
});

describe('verifyQueueAuth with auth optional (local dev)', () => {
  it('generates an anonymous id when no token is provided', async () => {
    const result = await verifyQueueAuth(undefined, false);
    expect(result.success).toBe(true);
    expect(result.userId).toMatch(/^anon_/);
  });

  it('still verifies a provided token instead of trusting it blindly', async () => {
    const token = jwt.sign({ sub: 'u', iss: ISS }, 'wrong-secret', {
      algorithm: 'HS256',
    });
    const result = await verifyQueueAuth(token, false);
    expect(result.success).toBe(false);
  });
});

describe('signMatchToken', () => {
  it('signs an HS256 token carrying playerId and roomId', () => {
    const token = signMatchToken('player-1', 'room-1');
    const payload = jwt.verify(token!, MATCH_SECRET, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    expect(payload.playerId).toBe('player-1');
    expect(payload.roomId).toBe('room-1');
  });
});
