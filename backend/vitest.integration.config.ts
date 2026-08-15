import { defineConfig } from 'vitest/config';

/**
 * Integration suite: real Postgres in Docker (and a real spawned server for
 * endpoint tests). Run with `npm run test:integration`; excluded from the
 * default fast unit run.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    // Suites boot their own containers/servers; keep them serial for sane
    // docker resource usage and readable output.
    fileParallelism: false,
  },
});
