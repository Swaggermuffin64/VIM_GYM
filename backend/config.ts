// Environment configuration

export const BACKEND_PORT = parseInt(
  process.env.PORT || process.env.BACKEND_PORT || '3001',
  10
);

// CORS origins - add your production frontend URL to FRONTEND_URL env var
// FRONTEND_URL can be comma-separated for multiple origins
export const CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
    : []),
];

// Shared secret for verifying match tokens issued by the matchmaker
export const MATCH_TOKEN_SECRET = process.env.MATCH_TOKEN_SECRET;

/** Supabase / Postgres connection string; optional until leaderboard persistence is used. */
export const DATABASE_URL = process.env.DATABASE_URL?.trim() || undefined;

/** Supabase project URL, e.g. https://xxx.supabase.co */
export const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || undefined;

/** JWT secret from Supabase → Project Settings → API → JWT Secret */
export const SUPABASE_JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET?.trim() || undefined;

/**
 * Shared token that unlocks the detailed `/health` metrics payload. When unset,
 * `/health` returns only a minimal status and never exposes operational
 * internals (fail closed).
 */
export const HEALTH_METRICS_TOKEN =
  process.env.HEALTH_METRICS_TOKEN?.trim() || undefined;
