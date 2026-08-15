import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

// Set env before importing module under test
process.env.SUPABASE_JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://test.supabase.co';

const { verifySupabaseToken, isSupabaseToken, resetJwksCacheForTests } =
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

describe('verifySupabaseToken with a legacy HS256 shared secret', () => {
  it('returns user id for a valid token', async () => {
    const token = makeToken();
    const result = await verifySupabaseToken(token);
    expect(result.success).toBe(true);
    expect(result.user?.id).toBe('user-uuid-123');
    expect(result.user?.email).toBe('test@example.com');
  });

  it('fails for an expired token', async () => {
    const token = jwt.sign(
      { sub: 'user-uuid-123', iss: `${SUPABASE_URL}/auth/v1` },
      SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' }
    );
    const result = await verifySupabaseToken(token);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid|expired/i);
  });

  it('fails for a token signed with a wrong secret', async () => {
    const token = jwt.sign(
      { sub: 'user-uuid-123', iss: `${SUPABASE_URL}/auth/v1` },
      'wrong-secret',
      { algorithm: 'HS256' }
    );
    const result = await verifySupabaseToken(token);
    expect(result.success).toBe(false);
  });

  it('fails when iss does not match SUPABASE_URL', async () => {
    const token = makeToken({ iss: 'https://other.supabase.co/auth/v1' });
    const result = await verifySupabaseToken(token);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/issuer/i);
  });

  it('fails for a token with no iss claim when SUPABASE_URL is configured', async () => {
    const token = jwt.sign({ sub: 'user-uuid-123' }, SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });
    const result = await verifySupabaseToken(token);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/issuer/i);
  });

  it('fails for a token with no sub', async () => {
    const token = jwt.sign({ iss: `${SUPABASE_URL}/auth/v1` }, SECRET, {
      algorithm: 'HS256',
    });
    const result = await verifySupabaseToken(token);
    expect(result.success).toBe(false);
  });
});

/**
 * Supabase projects on asymmetric signing keys sign with ES256 and publish the
 * public half at {SUPABASE_URL}/auth/v1/.well-known/jwks.json. These tests
 * stand up a real ES256 key pair and serve its public JWK from a stubbed fetch.
 */
describe('verifySupabaseToken with asymmetric ES256 signing keys', () => {
  type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

  const KEY_ID = 'f69a3d25-7109-428a-bafa-acd249f3380f';
  const originalFetch = globalThis.fetch;
  let privateKey: SigningKey;
  let jwks: { keys: unknown[] };
  let jwksFetchCount = 0;

  async function makeEs256Token(
    key: SigningKey,
    claims: Record<string, unknown> = {},
    kid = KEY_ID
  ) {
    return new SignJWT({
      iss: `${SUPABASE_URL}/auth/v1`,
      email: 'test@example.com',
      ...claims,
    })
      .setProtectedHeader({ alg: 'ES256', kid })
      .setSubject((claims.sub as string) ?? 'user-uuid-123')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
  }

  beforeEach(async () => {
    resetJwksCacheForTests();
    const pair = await generateKeyPair('ES256', { extractable: true });
    privateKey = pair.privateKey;
    const publicJwk = await exportJWK(pair.publicKey);
    jwks = { keys: [{ ...publicJwk, kid: KEY_ID, alg: 'ES256', use: 'sig' }] };

    jwksFetchCount = 0;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (!url.includes('/.well-known/jwks.json')) {
        throw new Error(`unexpected fetch: ${url}`);
      }
      jwksFetchCount++;
      return new Response(JSON.stringify(jwks), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetJwksCacheForTests();
  });

  it('returns user id for a token signed by the published key', async () => {
    const token = await makeEs256Token(privateKey);
    const result = await verifySupabaseToken(token);
    expect(result.success).toBe(true);
    expect(result.user?.id).toBe('user-uuid-123');
    expect(result.user?.email).toBe('test@example.com');
  });

  it('fails for a token signed by a key that is not published', async () => {
    const attacker = await generateKeyPair('ES256', { extractable: true });
    const token = await makeEs256Token(attacker.privateKey);
    const result = await verifySupabaseToken(token);
    expect(result.success).toBe(false);
  });

  it('fails for an expired token', async () => {
    const token = await new SignJWT({ iss: `${SUPABASE_URL}/auth/v1` })
      .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
      .setSubject('user-uuid-123')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);
    const result = await verifySupabaseToken(token);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid|expired/i);
  });

  it('fails when iss does not match SUPABASE_URL', async () => {
    const token = await makeEs256Token(privateKey, {
      iss: 'https://other.supabase.co/auth/v1',
    });
    const result = await verifySupabaseToken(token);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/issuer/i);
  });

  it('caches the JWKS across verifications instead of refetching per request', async () => {
    const token = await makeEs256Token(privateKey);
    await verifySupabaseToken(token);
    await verifySupabaseToken(token);
    await verifySupabaseToken(token);
    expect(jwksFetchCount).toBe(1);
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

  it('returns false for a lookalike issuer that merely contains "supabase"', () => {
    // With SUPABASE_URL configured, routing must pin to our project rather
    // than accept any iss containing the substring "supabase".
    const token = makeToken({ iss: 'https://evil.com/supabase-lookalike' });
    expect(isSupabaseToken(token)).toBe(false);
  });
});
