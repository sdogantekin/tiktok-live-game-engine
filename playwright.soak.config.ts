import { defineConfig } from '@playwright/test';

/**
 * 30-minute soak: the production start (`pnpm start`: build, then the server serves the built web app on one port)
 * with a real, visible Chrome window, steady simulated traffic, and memory sampled throughout.
 * Run with `pnpm perf:soak` (SOAK_MINUTES=30 by default). Keep the Chrome window visible; close heavy apps first.
 */
export default defineConfig({
  testDir: './e2e/perf',
  testMatch: 'soak.spec.ts',
  workers: 1,
  timeout: 90 * 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    channel: 'chrome',
    headless: false,
    launchOptions: {
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
    },
  },
  webServer: {
    command: 'pnpm start',
    url: 'http://127.0.0.1:3001/health',
    reuseExistingServer: false,
    timeout: 180_000,
    env: { OPERATOR_TOKEN: 'e2e-operator-token' },
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
