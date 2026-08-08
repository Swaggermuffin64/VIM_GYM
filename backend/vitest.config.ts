import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // Integration tests need Docker; they run via vitest.integration.config.ts
    exclude: ['**/node_modules/**', 'test/integration/**'],
  },
});
