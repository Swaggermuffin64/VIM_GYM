/**
 * Startup environment requirements.
 *
 * Production (NODE_ENV=production) refuses to boot without the configuration
 * it cannot run safely without. Local dev only requires that a .env file
 * exists, so a fresh clone is pointed at .env.example instead of silently
 * running on fallbacks. CI is exempt from the file check: it spawns servers
 * with explicit env and has no .env.
 */

/** Each entry is satisfied when any one of its variables is set. */
export type EnvRequirement = readonly [string, ...string[]];

export const PRODUCTION_REQUIRED_ENV: readonly EnvRequirement[] = [
  ['MATCH_TOKEN_SECRET'],
  ['GAME_SERVER_URL'],
  // Supabase access tokens verify via JWKS (SUPABASE_URL) or HS256 (secret).
  ['SUPABASE_URL', 'SUPABASE_JWT_SECRET'],
];

/** Returns a human-readable problem per unmet requirement; empty when OK. */
export function findEnvProblems(
  env: NodeJS.ProcessEnv,
  envFileExists: boolean,
  required: readonly EnvRequirement[] = PRODUCTION_REQUIRED_ENV
): string[] {
  if (env.NODE_ENV === 'production') {
    return required
      .filter((names) => !names.some((name) => env[name]?.trim()))
      .map((names) => `missing ${names.join(' or ')}`);
  }
  if (!envFileExists && !env.CI) {
    return ['no .env file found (run: cp .env.example .env)'];
  }
  return [];
}
