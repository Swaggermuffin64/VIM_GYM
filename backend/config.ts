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

/** Read a positive integer from the environment, falling back when unset or invalid. */
function positiveIntFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Maximum concurrent Socket.IO connections from a single IP.
 *
 * Deliberately far above what one player needs: shared NATs (offices,
 * universities, coworking spaces, VPNs) put many legitimate players behind one
 * address, and a player turned away here has no way to understand why. Its only
 * job is to stop a single host from monopolising the server — a distributed
 * flood is bounded by MAX_TOTAL_SOCKET_CONNECTIONS instead.
 */
export const MAX_CONNECTIONS_PER_IP = positiveIntFromEnv(
  process.env.MAX_CONNECTIONS_PER_IP,
  30
);

/**
 * Maximum concurrent Socket.IO connections the process will admit.
 *
 * Without this ceiling the only backstop is RSS crossing the `/health` memory
 * limit, which makes Fly restart the machine — and every in-progress race lives
 * in this process's memory, so a restart wipes them all. Shedding new
 * connections instead lets players already racing finish.
 *
 * Tune with data, not guesswork: watch `memMB`, `eventLoopLagMs` and
 * `socketConnections` together on `/health` under load, and set this below the
 * connection count where either memory headroom or event-loop lag runs out.
 * `capacityRejections` on `/health` shows whether the ceiling is ever reached.
 */
export const MAX_TOTAL_SOCKET_CONNECTIONS = positiveIntFromEnv(
  process.env.MAX_TOTAL_SOCKET_CONNECTIONS,
  2000
);

/** Supabase / Postgres connection string; optional until leaderboard persistence is used. */
export const DATABASE_URL = process.env.DATABASE_URL?.trim() || undefined;

/** Supabase project URL, e.g. https://xxx.supabase.co */
export const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || undefined;

/** JWT secret from Supabase → Project Settings → API → JWT Secret */
export const SUPABASE_JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET?.trim() || undefined;

// Issuer pinning requires SUPABASE_URL: without it, any HS256 token signed
// with the same shared secret is accepted regardless of which Supabase
// project issued it. Warn loudly so a misconfigured deployment is visible.
if (SUPABASE_JWT_SECRET && !SUPABASE_URL) {
  console.warn(
    '[config] SUPABASE_JWT_SECRET is set but SUPABASE_URL is not: ' +
      'token issuer pinning is DISABLED. Set SUPABASE_URL in production.'
  );
}

/**
 * Shared token that unlocks the detailed `/health` metrics payload. When unset,
 * `/health` returns only a minimal status and never exposes operational
 * internals (fail closed).
 */
export const HEALTH_METRICS_TOKEN =
  process.env.HEALTH_METRICS_TOKEN?.trim() || undefined;

/**
 * When 'true', the backend eagerly creates today's daily race at startup.
 * Set only in the production fly.toml: local dev shares the production
 * database, and a dev restart must never pick the day's task set.
 */
export const DAILY_EAGER_CREATE = process.env.DAILY_EAGER_CREATE === 'true';

/**
 * Public origin that share URLs are minted under. The Vercel frontend rewrites
 * `/s/*` from this origin to the backend's share endpoint, so the links look
 * like they belong to the main app domain.
 */
export const SHARE_LINK_BASE_URL = originFromEnv(
  process.env.SHARE_LINK_BASE_URL,
  'https://vimgym.app'
);

/**
 * Origin that serves share pages and card images with no redirect hop.
 * The apex `vimgym.app` 307s to `www`, and link-unfurl crawlers (Slack in
 * particular) fall back to a small thumbnail when the og:image URL does not
 * answer directly. og:url and og:image are minted under this origin; the
 * short links people copy stay on SHARE_LINK_BASE_URL.
 */
export const SHARE_CANONICAL_ORIGIN = originFromEnv(
  process.env.SHARE_CANONICAL_ORIGIN,
  'https://www.vimgym.app'
);

/**
 * Read an origin from an env var, falling back to `fallback` when unset or
 * blank. Trailing slashes are stripped so callers can append `/s/<slug>`
 * without producing `//s/...`, which the Vercel `/s/*` rewrite would miss.
 */
export function originFromEnv(
  value: string | undefined,
  fallback: string
): string {
  return (value?.trim() || fallback).replace(/\/+$/, '');
}
