import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // src/lib/supabase.ts throws at import time without these; give tests
    // harmless placeholder values so they run without a local .env.
    env: {
      VITE_SUPABASE_URL: 'http://supabase.invalid',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      exclude: [
        'build/**',
        '**/*.config.ts',
        '**/*.d.ts',
        'src/main.tsx', // app bootstrap; not meaningfully unit-testable
      ],
      thresholds: {
        lines: 20,
        branches: 74,
      },
    },
  },
});
