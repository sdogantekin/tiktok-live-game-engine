import { defineConfig } from '@playwright/test';

/**
 * Performance measurements: a real (headed) Chrome with the GPU, against the PRODUCTION build served by
 * `vite preview`, with the real server. Slow and machine-dependent on purpose; run with `pnpm perf:browser`.
 * Close other heavy apps first, and keep the Chrome window visible (hidden windows are throttled).
 */
export default defineConfig({
  testDir: './e2e/perf',
  testIgnore: '**/soak.spec.ts', // the soak has its own config and takes 30 minutes
  workers: 1,
  fullyParallel: false,
  timeout: 20 * 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chrome',
    headless: false,
    launchOptions: {
      // The autoplay flag lets the game's audio really play during the run (Chrome otherwise keeps it suspended).
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: [
    {
      command: 'pnpm --filter @live-game/server start',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { OPERATOR_TOKEN: 'e2e-operator-token' },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      command: 'pnpm --filter @live-game/web build && pnpm --filter @live-game/web exec vite preview',
      url: 'http://127.0.0.1:4173/broadcast/',
      reuseExistingServer: false,
      timeout: 180_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});
