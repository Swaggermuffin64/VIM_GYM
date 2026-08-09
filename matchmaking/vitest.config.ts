import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      exclude: ['scripts/**', 'dist/**', '**/*.config.ts'],
      thresholds: {
        lines: 40,
        branches: 79,
      },
    },
  },
});
