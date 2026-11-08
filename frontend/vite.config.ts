import { existsSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Production builds bake these in; without them the app silently points at
// localhost. Vercel sets them as project env vars, not via a .env file.
const PRODUCTION_REQUIRED_ENV = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_BACKEND_URL',
  'VITE_MATCHMAKING_URL',
];

/** Fail fast on missing config: all vars for builds, a .env file for dev. */
function checkEnv(command: 'build' | 'serve', mode: string): void {
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const missing = PRODUCTION_REQUIRED_ENV.filter(
      (name) => !env[name]?.trim()
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing required env for build: ${missing.join(', ')} (see .env.example)`
      );
    }
    return;
  }
  // Dev runs without Supabase (sign-in disabled; see src/lib/supabase.ts).
  const envFiles = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`];
  if (!process.env.CI && !envFiles.some((file) => existsSync(file))) {
    throw new Error('No .env file found (run: cp .env.example .env)');
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  checkEnv(command, mode);
  return {
    plugins: [react()],
    server: {
      port: 3000,
      open: true,
    },
    build: {
      outDir: 'build',
    },
  };
});
