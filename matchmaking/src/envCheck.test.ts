import { describe, expect, it } from 'vitest';
import { findEnvProblems } from './envCheck.js';

const PROD_ENV = {
  NODE_ENV: 'production',
  MATCH_TOKEN_SECRET: 'secret',
  GAME_SERVER_URL: 'http://localhost:3001',
  SUPABASE_URL: 'https://x.supabase.co',
};

describe('findEnvProblems', () => {
  it('passes a fully configured production env without a .env file', () => {
    expect(findEnvProblems(PROD_ENV, false)).toEqual([]);
  });

  it('reports each missing production variable', () => {
    expect(
      findEnvProblems(
        { ...PROD_ENV, MATCH_TOKEN_SECRET: undefined, GAME_SERVER_URL: '  ' },
        true
      )
    ).toEqual(['missing MATCH_TOKEN_SECRET', 'missing GAME_SERVER_URL']);
  });

  it('accepts either Supabase variable in production', () => {
    const withoutUrl = { ...PROD_ENV, SUPABASE_URL: undefined };
    expect(
      findEnvProblems({ ...withoutUrl, SUPABASE_JWT_SECRET: 's' }, false)
    ).toEqual([]);
    expect(findEnvProblems(withoutUrl, false)).toEqual([
      'missing SUPABASE_URL or SUPABASE_JWT_SECRET',
    ]);
  });

  it('requires a .env file in dev but no specific variables', () => {
    expect(findEnvProblems({}, true)).toEqual([]);
    expect(findEnvProblems({}, false)).toEqual([
      'no .env file found (run: cp .env.example .env)',
    ]);
  });

  it('skips the .env file check in CI', () => {
    expect(findEnvProblems({ CI: 'true' }, false)).toEqual([]);
  });
});
