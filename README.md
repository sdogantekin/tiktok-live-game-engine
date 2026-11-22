# TikTok Live Game Engine

Modular livestream game engine; first game mode is **Mahalle Halayı**. See `REQUIREMENTS.md`, `ARCHITECTURE.md`, `PLAN.md`, `CLAUDE.md`.

## Requirements

- Node.js >= 22.13 (see `.nvmrc`)
- pnpm 12.21.0 (`npm i -g pnpm@12.21.0`)
- Google Chrome (used by Playwright via `channel: 'chrome'`)

## Commands

```bash
pnpm install
pnpm dev          # server on http://127.0.0.1:3001 + web on http://127.0.0.1:5173
pnpm typecheck
pnpm lint
pnpm test         # Vitest
pnpm test:e2e     # Playwright (starts `pnpm dev` if not running)
pnpm build
```

Routes (dev): `http://127.0.0.1:5173/broadcast/` (OBS view) and `http://127.0.0.1:5173/operator/`.

Copy `.env.example` to `.env` to override `HOST`/`PORT`.
