# TikTok Live Game Engine

A modular, real-time game engine for livestreams. Viewers become players through chat comments and gifts, and the game is shown on stream as a vertical (9:16) broadcast view that any streaming tool can capture from a browser window. You run it on your own machine; a separate operator page controls the show.

Three games ship with it, all on the same engine:

| Game | What it is |
|---|---|
| **Mahalle Halayı** | A Turkish wedding-courtyard dance competition. Gelin and Damat sides form halay lines, score by commenting `halay`, and cheer each other on. Gifts are celebrations only. |
| **Takı Takma Töreni** | The jewellery-pinning ceremony of a Turkish wedding. Guests of both sides queue up, walk to the couple and pin a takı (`tak`); the more generous side wins. Gifts bring a bigger takı and **bonus points** (a per-game decision). |
| **At Yarışı** | A horse race. Viewers type `1` to join; ten race and the rest wait their turn. Likes (free) and gifts speed up your own horse, the server runs a six-lap race, and the results rank people, not teams. |

Building your own game on the engine is documented in [`docs/building-a-game.md`](docs/building-a-game.md); going live is in [`docs/running-a-stream.md`](docs/running-a-stream.md).

> **Free to play, gifts for spectacle.** Every viewer can join and contribute for free. By default gifts only trigger celebrations; a game can opt in to letting gifts add bonus points (Takı Takma Töreni does, Mahalle Halayı does not).

## Status

| | Milestone | Status |
|---|---|---|
| **Product Phase 1** | Standalone MVP: engine + first game, driven by the Local Simulator | **Accepted** |
| **Second game** (Steps 3.1–3.5) | Takı Takma Töreni, game selection, per-game gift scoring, viewers' comments on screen | **Done** |
| **Third game** (Steps 4.1–4.5) | At Yarışı, and the engine capabilities it needed: likes, a live server-side simulation, individual results | **Done** |
| **Product Phase 2** | TikTok LIVE integration | **Built, not yet verified on a real stream.** A TikTok provider reads comments and gifts through an unofficial connector (a deliberate, accepted Terms-of-Service risk, see [`docs/tiktok-live-feasibility.md`](docs/tiktok-live-feasibility.md)). It is off by default and has only been tested against a fake connection. |

"Phase" means a product milestone; "Step" means an implementation step. Steps and decisions are in [`PLAN.md`](PLAN.md).

## What works today

- **A complete game loop on the server:** join a side, game actions with cooldowns, timed rounds with a winner or draw, automatic next round. The server is the only authority on scores and rounds.
- **Three games and a game picker.** The operator switches games while the game is stopped.
- **Viewers' comments on screen:** short, moderated comments from joined players appear as speech bubbles (links, mentions, phone numbers and blocked words are refused; operator on/off switch and per-player Ignore).
- **A 3D broadcast view** (React Three Fiber, low-poly toy style from Blender scripts) with HUD, name tags, effects and **sound** (original synthesised music and effects, or a music file the game producer supplies).
- **An operator panel:** game picker, per-game settings (the number of laps in the horse race), start/pause/end rounds, celebrations, players, sound, comments, the TikTok connection, and the simulator.
- **A local event simulator** with synthetic viewers, bursts, steady and chaos scenarios and simulated outages. It speaks each game's own words. It is permanent: it works with no TikTok code, credentials or network.
- **A TikTok LIVE provider** (off by default, one provider at a time, never mixed with the simulator).

Performance has been measured for the dance and ceremony games at 200 participants (about 60 FPS, 112-118 draw calls) and for the race (60 FPS, 43-63 draw calls), see `docs/perf-results.md`.

## Getting started

Requirements: Node.js 22.13 or newer, [pnpm](https://pnpm.io) 12.21.0 (`npm i -g pnpm@12.21.0`), and Google Chrome (used by the browser tests).

```bash
pnpm install
pnpm start        # production: builds the web app, then one server on http://127.0.0.1:3001 serves everything
# or, while developing:
pnpm dev          # game server on :3001 + Vite dev server on :5173 (hot reload)
```

| View | `pnpm start` | `pnpm dev` |
|---|---|---|
| Broadcast (9:16, for window capture) | `http://127.0.0.1:3001/broadcast/` | `http://127.0.0.1:5173/broadcast/` |
| Operator | `http://127.0.0.1:3001/operator/#token=<token>` | `http://127.0.0.1:5173/operator/#token=<token>` |

The server prints a one-time operator token and a ready-to-open operator URL when it starts. Without the token the operator page asks you to paste it. To use a fixed token, set `OPERATOR_TOKEN` (at least 8 characters). The token travels in the URL fragment, so it is never sent to a server in a request. How to show the broadcast view for capture is in `docs/capture-notes.md`.

A first run: open both views, click **Start game**, add simulated viewers in the **Simulator** panel, click **Start round now**, then send a **burst** of the game's action word (`halay` in Mahalle Halayı, `tak` in Takı Takma Töreni). The broadcast view shows the scores update; **End round** shows the result. To try the other game, stop the game and use the **Game** panel.

### Configuration

Copy `.env.example` to `.env` to override defaults. Secrets are never committed.

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `127.0.0.1` | Server bind address. Keep it on loopback: the operator interface must not be exposed publicly. |
| `PORT` | `3001` | Server port. |
| `OPERATOR_TOKEN` | random each run | Operator access token. |
| `WEB_DIR` | unset | Directory of the built web app to serve (`pnpm start` sets it to `apps/web/dist`). |
| `GAME` | `mahalle-halayi` | The game to start with: `mahalle-halayi`, `taki-takma` or `at-yarisi`. The operator can switch while the game is stopped. |
| `TIKTOK_LIVE` | `off` | `on` lets the operator read a real TikTok LIVE (see `docs/running-a-stream.md`). |
| `EULER_API_KEY` | unset | Optional key for the signing service the TikTok connector depends on. A secret: never commit it. |

## Commands

```bash
pnpm start        # production: build, then serve everything from the server on :3001
pnpm dev          # server + Vite dev server (development)
pnpm typecheck    # TypeScript, all packages
pnpm lint         # ESLint, including architecture boundary rules
pnpm test         # Vitest unit and integration tests
pnpm test:e2e     # Playwright browser tests (starts the dev servers itself)
pnpm build        # production build of the web app
pnpm assets:build # rebuild the 3D models from their Blender scripts (needs Blender)
pnpm perf:load    # headless server load scenarios (see docs/perf-results.md)
pnpm perf:browser # headed-Chrome performance run against the production build
pnpm perf:soak    # 30-minute soak (memory trends) in a visible Chrome window
```

## How it works

```text
Event provider (Local Simulator or TikTok LIVE, one at a time)
        │  normalized events
        ▼
validate → dedupe → rate limit → bounded queue → game mode rules → authoritative state
                                                                         │
                                                              Socket.IO (snapshots, HUD, roster, effects)
                                                                    ┌────┴─────┐
                                                             Broadcast view   Operator view
```

- **The server is authoritative.** Scores, teams, rounds, and winners are computed on the server; the browser only renders what it is told.
- **Providers are replaceable.** The engine sees normalized events only. The simulator and the TikTok LIVE reader are two providers, neither known to the game rules or views. One provider is active per run, and the simulator is never mixed into a real stream.
- **Game modes are static modules.** Each mode has server rules (`apps/server/src/game-modes/<id>/`) and a client presentation (`apps/web/src/game-modes/<id>/`). The core offers capabilities (gift scoring, comments on screen) that a game turns on in its own config. There is no plugin framework.
- **Operator and broadcast are separate.** The broadcast namespace is read-only; the operator namespace requires the token, and the operator interface is not part of the broadcast bundle.
- **Everything is in memory.** No database, accounts, or persistent viewer profiles.

## Repository layout

```text
apps/server/          Node server: engine, game modes, simulator, realtime, operator API
apps/web/             React web app: /broadcast/ and /operator/ pages
assets/               Blender build scripts and sources for each game's 3D models
docs/                Guides (building a game, running a stream), feasibility and performance reports
packages/contracts/   Shared Zod schemas and types (events, state, network messages)
e2e/                  Playwright browser tests
PLAN.md               Implementation steps and progress for each product phase
REQUIREMENTS.md       Product requirements and roadmap
ARCHITECTURE.md       Technical architecture and decisions
CLAUDE.md             Working instructions for Claude Code sessions
```

## License

MIT, see [`LICENSE`](LICENSE). The optional TikTok LIVE reader depends on `tiktok-live-connector`, which is AGPL-3.0 with an additional permission for TikTok LIVE games; its conditions are in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). The music file `halay.mp3` is not part of the repository and is not covered by this licence.

## Documentation

- [`docs/building-a-game.md`](docs/building-a-game.md): how to add your own game to the engine.
- [`docs/running-a-stream.md`](docs/running-a-stream.md): showing the broadcast view, the operator checklist, reading a TikTok LIVE, moderation, sound and music rights.
- [`docs/capture-notes.md`](docs/capture-notes.md): window setup for capture tools.
- [`docs/tiktok-live-feasibility.md`](docs/tiktok-live-feasibility.md): the TikTok research and the accepted risks.
- [`docs/perf-results.md`](docs/perf-results.md): measurements.

- [`REQUIREMENTS.md`](REQUIREMENTS.md): what the product is, MVP scope, Mahalle Halayı rules, and the Product Phase 2 plan for TikTok LIVE.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): modules, event pipeline, provider abstraction, security, and testing strategy.
- [`PLAN.md`](PLAN.md): step-by-step implementation plan, decisions log, and progress tracker.
