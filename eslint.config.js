import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** Architecture boundary: files matching `files` must not import anything matching `groups`. */
const boundary = (files, groups, message) => ({
  files,
  rules: {
    'no-restricted-imports': ['error', { patterns: [{ group: groups, message }] }],
  },
});

export default defineConfig(
  { ignores: ['**/dist/**', '**/node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },

  // Boundaries from ARCHITECTURE.md / PLAN.md §4
  boundary(
    ['packages/contracts/src/**'],
    ['@live-game/*', '**/apps/**'],
    'contracts may depend on zod only.',
  ),
  boundary(
    ['apps/server/src/core/**'],
    ['**/game-modes/**', '**/providers/**', '**/realtime/**', '**/operator/**'],
    'core must not know about game modes, providers, transport, or operator code.',
  ),
  boundary(
    ['apps/server/src/game-modes/**'],
    ['**/providers/**', '**/realtime/**', '**/operator/**'],
    'game-mode rules must not depend on providers or transport.',
  ),
  boundary(
    ['apps/server/src/providers/**'],
    ['**/core/**', '**/game-modes/**', '**/realtime/**', '**/operator/**'],
    'providers emit normalized events through an injected ingest function only.',
  ),
  boundary(
    ['apps/web/src/game-renderer/**'],
    ['**/game-modes/**', '**/realtime/**', '**/broadcast/**', '**/operator/**', 'socket.io-client'],
    'the renderer is mode-agnostic and transport-agnostic.',
  ),
  boundary(
    ['apps/web/src/game-modes/**'],
    ['**/realtime/**', '**/broadcast/**', '**/operator/**', '@live-game/server'],
    'mode presentation depends on contracts and the renderer API only.',
  ),
  boundary(
    ['apps/web/src/broadcast/**'],
    ['**/operator/**'],
    'broadcast must not import operator code.',
  ),
  boundary(
    ['apps/web/src/operator/**'],
    ['**/broadcast/**', '**/game-renderer/**', 'three', '@react-three/*'],
    'operator must not import broadcast or 3D code.',
  ),
);
