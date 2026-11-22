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
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
