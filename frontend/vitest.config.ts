import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
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
