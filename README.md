# TikTok Live Game Engine

A modular, real-time game engine for livestreams. Viewers become players through chat commands and gift events, and the game is shown on stream as a vertical (9:16) broadcast view that any streaming tool can capture from a browser window. The first game is **Mahalle Halayı**, a playful Turkish wedding-courtyard dance competition between the Gelin and Damat teams.

**Where this is going:** the purpose of the project is to run these games on real livestreams, starting with **TikTok LIVE**. Everything built so far is the foundation for that: a provider-independent event pipeline, a server-authoritative game, and a local simulator that stands in for the audience until the real connection exists. TikTok integration is a planned next milestone that starts with feasibility research; it is not built yet and is not guaranteed to be possible.

> **Free to play, gifts for spectacle.** Every viewer can join and contribute for free. Gifts trigger celebrations; they never add winner points.

## Roadmap

| | Milestone | Status |
|---|---|---|
| **Product Phase 1** | **Standalone MVP**: engine + Mahalle Halayı, driven by the Local Simulator | In progress (implementation Steps 1.0–1.4 done; art, performance, and capture readiness remaining) |
| **Product Phase 2** | **TikTok LIVE integration**: feasibility research first, then a TikTok event provider. Success means a public TikTok LIVE stream where real viewers can join and play through the game mechanics | Planned (starts after Product Phase 1 is accepted) |

"Phase" means a product milestone; "Step" means an implementation step. Each phase has its own steps in [`PLAN.md`](PLAN.md): `Step 1.x` for Product Phase 1 and `Step 2.x` for Product Phase 2.

## What works today

- A complete game loop on the server: join a team (`gelin` / `damat`), score with `halay` (cooldown-limited), animate with `zıpla` / `oyna`, simulated gifts that only trigger celebrations, timed rounds with winner or draw, automatic next round.
- A **local event simulator** with synthetic viewers, bursts, steady and "chaos" scenarios, duplicate and malformed event injection, and simulated provider outages.
- An **operator panel** for starting, pausing and ending rounds, resetting scores, triggering celebrations, managing players, and driving the simulator.
- A **broadcast view** (2D HUD for now) with the phase, timer, team scores, join ticker, and result and status banners.

Not built yet: final 3D art (the scene uses placeholder shapes today), performance tuning, and everything TikTok-related.

## Getting started

Requirements: Node.js 22.13 or newer, [pnpm](https://pnpm.io) 12.21.0 (`npm i -g pnpm@12.21.0`), and Google Chrome (used by the browser tests).

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts the game server on `http://127.0.0.1:3001` and the web app on `http://127.0.0.1:5173`.

| View | URL |
|---|---|
| Broadcast (9:16, for window capture) | `http://127.0.0.1:5173/broadcast/` |
| Operator | `http://127.0.0.1:5173/operator/#token=<token>` |

The server prints a one-time operator token and a ready-to-open operator URL when it starts. Without the token the operator page asks you to paste it. To use a fixed token, set `OPERATOR_TOKEN` (at least 8 characters). The token travels in the URL fragment, so it is never sent to a server in a request.

A first run: open both views, click **Start game**, add simulated viewers in the **Simulator** panel, click **Start round now**, then send a **burst** of `halay`. The broadcast view shows the scores update; **End round** shows the result.

### Configuration

Copy `.env.example` to `.env` to override defaults. Secrets are never committed.

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `127.0.0.1` | Server bind address. Keep it on loopback: the operator interface must not be exposed publicly. |
| `PORT` | `3001` | Server port. |
| `OPERATOR_TOKEN` | random each run | Operator access token. |

## Commands

```bash
pnpm dev          # server + web app
pnpm typecheck    # TypeScript, all packages
pnpm lint         # ESLint, including architecture boundary rules
pnpm test         # Vitest unit and integration tests
pnpm test:e2e     # Playwright browser tests (starts the dev servers itself)
pnpm build        # production build of the web app
```

## How it works

```text
Event provider (Local Simulator now; TikTok LIVE planned)
        │  normalized events
        ▼
validate → dedupe → rate limit → bounded queue → game mode rules → authoritative state
                                                                         │
                                                              Socket.IO (snapshots, HUD, roster, effects)
                                                                    ┌────┴─────┐
                                                             Broadcast view   Operator view
```

- **The server is authoritative.** Scores, teams, rounds, and winners are computed on the server; the browser only renders what it is told.
- **Providers are replaceable.** The engine sees normalized events only. The simulator is one provider; a TikTok provider will be another, added without changing game rules or views. One provider is active per run, and the simulator is never mixed into a real stream.
- **Game modes are static modules.** Each mode has server rules and a client presentation module. There is no plugin framework.
- **Operator and broadcast are separate.** The broadcast namespace is read-only; the operator namespace requires the token, and the operator interface is not part of the broadcast bundle.
- **Everything is in memory.** No database, accounts, or persistent viewer profiles.

## Repository layout

```text
apps/server/          Node server: engine, game modes, simulator, realtime, operator API
apps/web/             React web app: /broadcast/ and /operator/ pages
packages/contracts/   Shared Zod schemas and types (events, state, network messages)
e2e/                  Playwright browser tests
PLAN.md               Implementation steps and progress for each product phase
REQUIREMENTS.md       Product requirements and roadmap
ARCHITECTURE.md       Technical architecture and decisions
CLAUDE.md             Working instructions for Claude Code sessions
```

## Documentation

- [`REQUIREMENTS.md`](REQUIREMENTS.md): what the product is, MVP scope, Mahalle Halayı rules, and the Product Phase 2 plan for TikTok LIVE.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): modules, event pipeline, provider abstraction, security, and testing strategy.
- [`PLAN.md`](PLAN.md): step-by-step implementation plan, decisions log, and progress tracker.
