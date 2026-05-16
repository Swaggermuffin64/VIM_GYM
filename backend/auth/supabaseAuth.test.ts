import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';

// Set env before importing module under test
process.env.SUPABASE_JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://test.supabase.co';

const { verifySupabaseToken, isSupabaseToken } =
  await import('./supabaseAuth.js');

const SECRET = 'test-secret';
const SUPABASE_URL = 'https://test.supabase.co';

function makeToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      sub: 'user-uuid-123',
      iss: `${SUPABASE_URL}/auth/v1`,
      role: 'authenticated',
      aud: 'authenticated',
      email: 'test@example.com',
      ...overrides,
    },
    SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

describe('verifySupabaseToken', () => {
  it('returns user id for a valid token', () => {
    const token = makeToken();
    const result = verifySupabaseToken(token);
    expect(result.success).toBe(true);
    expect(result.user?.id).toBe('user-uuid-123');
    expect(result.user?.email).toBe('test@example.com');
  });

  it('fails for an expired token', () => {
    const token = jwt.sign(
      { sub: 'user-uuid-123', iss: `${SUPABASE_URL}/auth/v1` },
      SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' }
    );
    const result = verifySupabaseToken(token);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid|expired/i);
  });

  it('fails for a token signed with a wrong secret', () => {
    const token = jwt.sign(
      { sub: 'user-uuid-123', iss: `${SUPABASE_URL}/auth/v1` },
      'wrong-secret',
      { algorithm: 'HS256' }
    );
    const result = verifySupabaseToken(token);
    expect(result.success).toBe(false);
  });

  it('fails when iss does not match SUPABASE_URL', () => {
    const token = makeToken({ iss: 'https://other.supabase.co/auth/v1' });
    const result = verifySupabaseToken(token);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/issuer/i);
  });

  it('fails for a token with no sub', () => {
    const token = jwt.sign({ iss: `${SUPABASE_URL}/auth/v1` }, SECRET, {
      algorithm: 'HS256',
    });
    const result = verifySupabaseToken(token);
    expect(result.success).toBe(false);
  });
});

describe('isSupabaseToken', () => {
  it('returns true for a token with a supabase iss', () => {
    const token = makeToken();
    expect(isSupabaseToken(token)).toBe(true);
  });

  it('returns false for a match token (no iss)', () => {
    const token = jwt.sign({ playerId: 'abc', roomId: 'room1' }, SECRET, {
      algorithm: 'HS256',
    });
    expect(isSupabaseToken(token)).toBe(false);
  });

  it('returns false for garbage input', () => {
    expect(isSupabaseToken('not-a-jwt')).toBe(false);
  });
});
