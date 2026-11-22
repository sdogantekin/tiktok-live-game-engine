import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      { test: { name: 'contracts', include: ['packages/contracts/src/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'server', include: ['apps/server/src/**/*.test.ts', 'apps/server/test/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'web', include: ['apps/web/src/**/*.test.{ts,tsx}'], environment: 'node' } },
    ],
  },
});
