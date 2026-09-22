import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // src/config/env.ts validates process.env at import time, so the test
    // environment has to exist before any test module loads.
    setupFiles: ['tests/support/setup-env.ts'],
    // mongodb-memory-server needs room to start on a cold cache.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/types/**', 'src/server.ts'],
    },
  },
});
