import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // Integration tests need Docker; they run via vitest.integration.config.ts
    exclude: ['**/node_modules/**', 'test/integration/**'],
    coverage: {
      provider: 'v8',
      exclude: [
        '**/*.config.ts',
        'scripts/**',
        'test/**',
        'dist/**',
        'taskWorker.ts', // piscina worker entry; exercised only in-worker
      ],
      thresholds: {
        lines: 58,
        branches: 79,
      },
    },
  },
});
