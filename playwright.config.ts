import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Every test drives the same running server, so files and tests must not overlap.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:5173/broadcast/',
    // A server already running without OPERATOR_TOKEN=e2e-operator-token will fail the operator tests.
    reuseExistingServer: true,
    timeout: 60_000,
    // Let `concurrently` stop both children; otherwise the API server outlives the run and the next run reuses it.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    env: { OPERATOR_TOKEN: 'e2e-operator-token' },
  },
});
