import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
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
    env: { OPERATOR_TOKEN: 'e2e-operator-token' },
  },
});
