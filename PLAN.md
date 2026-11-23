# PLAN.md — Implementation Plan

**Status:** Product Phase 1 plan approved 2026-11-22. Implementation of each step requires a separate explicit approval. The Product Phase 2 section (§12) is an outline only.
**Source of truth:** `REQUIREMENTS.md` (product), `ARCHITECTURE.md` (technical), `CLAUDE.md` (working practices). This plan only sequences the work; it does not change scope.
**Scope and naming:** "Phase" always means a *product* phase (see `REQUIREMENTS.md`) and "Step" always means an *implementation step* in this plan. **Product Phase 1** (Standalone MVP, Local Simulator) has Steps 1.0–1.8 (§§1–11). **Product Phase 2** (TikTok LIVE integration, the project's ultimate purpose) has its own Steps 2.0–2.5, outlined in §12 and detailed only after the feasibility research and your go decision.
**Environment when written:** Apple M3, 16 GB, macOS, Node 22.14.0, npm 10.9.2, pnpm not installed, Google Chrome installed, Blender 5.2.2 installed, OBS not installed, not a git repo.

## 1. Summary and approach

Build the smallest end-to-end playable slice first: a headless, fully tested game core (Steps 1.1–1.2), the Socket.IO server (Step 1.3), a 2D operator panel + HUD broadcast that plays a whole round with the simulator (Step 1.4), the 3D blockout with primitives (Step 1.5), Blender assets (Step 1.6), load/performance measurement (Step 1.7), and capture readiness (Step 1.8).

Why this order: rules, scoring and cooldowns are the highest-value, lowest-risk code and are testable without UI; the loop is playable in 2D before any 3D cost is paid; the biggest unknown (skinned-animation cost per visible avatar) is measured with real assets, not primitives.

Key choices:
- Three workspaces only: `apps/server`, `apps/web`, `packages/contracts`.
- Vite multi-page web app (`/broadcast/`, `/operator/`) so operator code is absent from the broadcast bundle.
- Contracts are Zod schemas + inferred types consumed as TS source (no build step). Server runs with `tsx`; no server bundling for the MVP.
- TypeScript 6.0.3 (not 7.0.2: typescript-eslint 8.73 requires TS < 6.1).
- Node 24 LTS recommended (installed 22.14.0 satisfies every tool's engine range).

## 2. Repository tree

```text
./                                   # repo root = current directory
├── apps/
│   ├── server/
│   │   ├── package.json  tsconfig.json
│   │   ├── scripts/load-test.ts     # headless scenario runner + metrics report
│   │   └── src/
│   │       ├── main.ts              # compose + start, binds 127.0.0.1
│   │       ├── config.ts            # env parsing (Zod)
│   │       ├── core/
│   │       │   ├── engine.ts        # GameEngine: single serialized dispatch loop
│   │       │   ├── mode.ts          # GameMode interface (data-driven config + hooks)
│   │       │   ├── events/          # comment-normalizer, dedupe (LRU), rate-limit, bounded queue, ingest
│   │       │   └── players/ teams/ rounds/ scoring/ state/
│   │       ├── game-modes/
│   │       │   ├── registry.ts      # static map: modeId -> GameMode
│   │       │   └── mahalle-halayi/  # config.ts, rules.ts (+ tests)
│   │       ├── providers/simulator/ # simulator.ts, viewers.ts, scenarios.ts, rng.ts (seeded)
│   │       ├── operator/            # commands.ts (validate/authorize), auth.ts
│   │       └── realtime/            # socket-server.ts (namespaces), snapshot/batch publisher
│   └── web/
│       ├── package.json  vite.config.ts  tsconfig.json
│       ├── index.html               # landing page linking the two routes
│       ├── broadcast/index.html     # 9:16 broadcast entry
│       ├── operator/index.html      # operator entry (no three.js)
│       ├── public/game-modes/mahalle-halayi/models/   # exported .glb (runtime)
│       └── src/
│           ├── broadcast/  operator/  realtime/
│           ├── game-renderer/       # Stage, AvatarSlots, Crowd (instanced), EffectsLayer, perf-probe
│           └── game-modes/mahalle-halayi/  # presentation.ts, Scene.tsx, theme.ts, assets.manifest.ts
├── packages/contracts/src/          # events/ game/ network/ index.ts
├── e2e/                             # Playwright specs
├── assets/game-modes/mahalle-halayi/ # source-blend/, references/
├── docs/                            # perf-results.md, capture-notes.md (created when produced)
├── package.json  pnpm-workspace.yaml  tsconfig.base.json
├── vitest.config.ts  playwright.config.ts  eslint.config.js
├── .nvmrc  .gitignore  .env.example  README.md  PLAN.md
└── CLAUDE.md  REQUIREMENTS.md  ARCHITECTURE.md
```

Deviations from ARCHITECTURE.md §4 (simplifications): no `assets/shared/*` or empty `docs/` placeholders until needed; runtime `.glb` in `apps/web/public/…` while `.blend` sources stay in `assets/`; two Vite HTML entries instead of one routed SPA; no `app/` folders.

## 3. Dependencies (checked against the npm registry on 2026-11-22)

| Package | Version | Compatibility note |
|---|---|---|
| Node.js | 24.22.3 LTS (alt: 26.13.1 LTS, or keep 22.14.0) | Vite 8 `^20.19 \|\| >=22.12`; Vitest 5.1 `^22.12 \|\| ^24 \|\| >=26`; ESLint 10 `^20.19 \|\| ^22.13 \|\| >=24` |
| pnpm | 12.21.0 | Pin via `packageManager`; may block dependency build scripts by default → explicit allow-list |
| TypeScript | 6.0.3 | typescript-eslint 8.73 peers `typescript <6.1` |
| React / react-dom | 19.3.1 | R3F 9.8.2 peers `react >=19 <19.4` |
| three / @types/three | 0.187.0 | Pin exact; upgrade deliberately |
| @react-three/fiber | 9.8.2 (stable) | v10 is alpha — do not use |
| @react-three/drei | 10.7.9 (only when needed) | peers react ^19, fiber ^9 |
| vite / @vitejs/plugin-react | 8.3.8 / 6.3.0 | plugin-react 6 peers vite ^8 |
| socket.io / socket.io-client | 4.8.4 | At-most-once delivery → snapshot on (re)connect |
| zod | 4.6.7 | |
| vitest | 5.1.1 | Root `test.projects` |
| @playwright/test | 1.65.1 | `channel: 'chrome'` (installed Chrome, no browser download) |
| tsx, @types/node, concurrently | 4.23.15, 24.x, 10.0.7 | |
| eslint, typescript-eslint, eslint-plugin-react-hooks | 10.15.0, 8.73.0, latest | Flat config; no Prettier |
| zustand | 5.x (transitive R3F dep) | Client store; verify at install |

Not added: react-router, any DB, queue lib, ORM, ECS lib, physics.
References: nodejs.org/en/about/previous-releases · pnpm.io · vite.dev/guide · r3f.docs.pmnd.rs · socket.io/docs/v4/delivery-guarantees · zod.dev · vitest.dev · playwright.dev · docs.blender.org/manual/en/dev/addons/scene_gltf2.html.
Caveat: compatibility verified from registry `engines`/`peerDependencies`, the Node release schedule, and the R3F docs banner (v9.8.2 stable / v10 alpha); not every tool's prose docs were read. Re-verify versions at Step 1.0 install time.

## 4. Boundaries and mode contract (no plugin framework)

Dependency rules, enforced by ESLint `no-restricted-imports`:

| Module | May import | Must not import |
|---|---|---|
| `packages/contracts` | zod only | anything else |
| `server/core` | contracts | game-modes, providers, realtime, operator, provider SDKs |
| `server/game-modes/<mode>` | contracts, core types | providers, realtime |
| `server/providers/*` | contracts | core internals (emit via one `ingest()`) |
| `server/realtime`, `operator` | contracts, core public API | game-mode internals |
| `web/game-renderer` | contracts, three/R3F | mode-specific code, socket client |
| `web/game-modes/<mode>` | contracts, game-renderer API | server code |
| `web/broadcast`, `web/operator` | realtime store, contracts | each other |

```ts
interface GameMode {
  id: ModeId;
  config: { teams; commands; cooldowns; scoring; gifts; timings };   // plain data
  createModeState(): ModeState;
  handleAction(ctx: ModeContext, action: GameAction): ModeEffect[];
  computeResult(ctx): RoundResult;
}
// ModeEffect = { score: team,+n } | { present: PresentationEvent } | { reject: reason }
```

- Core owns players, teams, round machine, cooldown/rate mechanics, snapshots; it never learns what `halay` means.
- Client: `getPresentation(modeId)` (static map) returns scene, camera, palette, asset manifest, effect→animation map.
- Provider boundary: provider → Zod `NormalizedEvent` (`comment.received | gift.received`) → one `ingest()`. Operator commands arrive on an authenticated namespace, are validated as `OperatorCommand`, share the same serialized engine queue, and bypass viewer dedupe/rate-limit.
- Replaceability: palette, lighting, camera, models, clips, UI tokens live only in `web/game-modes/<mode>/` and `assets/`.

## 5. Product Phase 1 implementation steps

Cross-cutting: every phase ends with `pnpm typecheck && pnpm lint && pnpm test` green. Numeric defaults are provisional configuration.

### Step 1.0 — Toolchain and workspace skeleton
- **Goal:** wired empty workspace; one command runs everything.
- **Tasks:** (needs approval: pnpm install, possibly Node 24, `git init`) root `package.json` scripts (`dev`, `test`, `typecheck`, `lint`, `build`), `pnpm-workspace.yaml`, `tsconfig.base.json`, ESLint flat config with boundary rules, Vitest `projects`, Playwright config, `.nvmrc`, `.gitignore` (incl. `*.blend1`, `node_modules`, `.env`), `.env.example`, minimal README. Hello-world server (health + Socket.IO) and Vite pages `/broadcast/`, `/operator/` with `/socket.io` WS proxy.
- **Acceptance:** clean `pnpm install`; `pnpm dev` starts server (127.0.0.1:3001) + Vite (5173); both pages load and show socket "connected"; typecheck/lint/test pass.
- **Checks:** above + one Playwright smoke.
- **Risks:** pnpm 12 build-script allow-list; Node version choice.

### Step 1.1 — Contracts and core domain (pure logic)
- **Goal:** authoritative model, fully unit-tested.
- **Tasks:** Zod contracts (`NormalizedEvent`, `GameAction`, `OperatorCommand`, `PublicSnapshot`, `PresentationEvent`, socket event names). Comment normalizer (NFC, strip control/zero-width/bidi, trim, collapse whitespace, `toLocaleLowerCase('tr')`, ASCII-fold ı/ş/ğ/ö/ü/ç; exact whole-comment match; 100-char cap). Display-name sanitizer (grapheme-aware, 24 max). Players, Teams, Scoring (no gift input path), Rounds (injected clock), State (`snapshot()`).
- **Round machine:** `stopped → lobby → countdown → active → results → lobby…`; `paused` is a flag freezing the timer and rejecting score actions. Defaults: countdown 15 s, round 180 s, results 15 s, auto-next on.
- **Acceptance:** transitions, illegal transitions, pause/resume timing, team-switch rules, cooldown math, tie → draw, round score reset all tested.
- **Checks:** Vitest with injected clock; table-driven Turkish normalization tests (`İ/I/ı/i`, `ZIPLA`, `halay!`, `halay halay`, empty, 5 000 chars, RTL/zero-width injection); assert ICU `tr` locale.

### Step 1.2 — Mahalle Halayı rules and ingestion pipeline (headless playable)
- **Goal:** full simulated round in a test, no network/UI.
- **Tasks:** mode config + rules; pipeline `validate → dedupe (LRU 5 000 provider:eventId) → per-user + global token bucket → bounded queue (1 000; overflow drops oldest visual-only, counted; never drops operator commands) → action map → mode.handleAction → state → effects`. Seeded simulator core emitting into `ingest()`. Static `registry.ts`.
- **Acceptance:** scripted round (join, halay spam capped by cooldown, zıpla/oyna add 0, gifts add 0 and emit presentation events, winner/draw, return to lobby, duplicates ignored, malformed events don't throw, 200 players processed).
- **Checks:** Vitest unit + gift-never-scores property test; integration test with `steady-200`.
- **Risks:** over-generalizing the mode contract — keep exactly §4.

### Step 1.3 — Realtime server and operator API
- **Goal:** browsers can observe and control the authoritative game.
- **Tasks:** namespaces `/broadcast` (read-only, public snapshot) and `/operator` (token auth; `OPERATOR_TOKEN` or random at boot; bind 127.0.0.1). Full snapshot on every (re)connect (with `serverNow`, `phaseEndsAt`, roster). HUD state ≤10 Hz coalesced; presentation events batched every 50 ms (cap 100; excess aggregated per-team). Operator commands: start/stop game, pause/resume, start/end round, reset score, trigger celebration, remove/ignore player, reassign team, simulator control (add N viewers, comment/gift as viewer, burst, scenario, duplicate/malformed/disconnect). `provider.status` in snapshot.
- **Acceptance:** connect → snapshot; updates flow; reconnect → fresh snapshot; broadcast rejects commands; operator without token rejected; invalid payloads rejected without crash.
- **Checks:** Vitest integration with real `socket.io-client` on an ephemeral port.

### Step 1.4 — Operator panel + 2D broadcast HUD (first end-to-end playable)
- **Goal:** play a whole round by clicking, no 3D.
- **Tasks:** zustand store; operator page (status, controls with reset confirm, simulator panel, scores, player list with remove/reassign, event feed); broadcast page (9:16, team names/scores/timer/phase, recent joiners, result banner, provider-status banner). React text nodes only.
- **Acceptance:** full round from the operator page reflected on broadcast; refresh/disconnect recovers; operator UI absent from broadcast bundle.
- **Checks:** Playwright (1080×1920 and 540×960 legibility screenshots); store unit tests.

### Step 1.5 — 3D blockout with primitives
- **Goal:** diorama reacts to game events with placeholder geometry.
- **Tasks:** R3F `Stage` (fixed ¾ camera, 9:16, DPR clamp), mode `Scene.tsx`, `AvatarSlots` (cap 24, per-team split, sticky, replace longest-idle), instanced `Crowd`, `EffectsLayer` (rose/GG/big-celebration), procedural bob/jump, HUD overlay, dev perf overlay (`?perf=1`).
- **Acceptance:** at 200 players only ≤ cap avatars animated while counters show all; gifts trigger effects, scores untouched; context loss/reload recovers via snapshot.
- **Checks:** Playwright headed-Chrome smoke (non-blank canvas, `window.__perf`); slot-allocator unit tests.
- **No OBS checkpoint (decided 2026-11-23):** OBS is not used in Product Phase 1 or 2 unless TikTok's route requires it. The broadcast view is verified in a normal Chrome window, which any streaming tool can capture by window capture.

### Step 1.6 — Blender art pass (may start in parallel with Step 1.4)
- **Goal:** replace primitives with cohesive low-poly GLBs.
- **Tasks:** concept sheet; modular courtyard kit; one shared character (~12-bone rig; clips `idle`, `halay`, `jump`, `dance_a`, `dance_b`, `rose_special`; team look via material/vertex colour); props; GLB export; `assets.manifest.ts`; `useGLTF` + `SkeletonUtils.clone`; per-asset validation.
- **Acceptance:** assets load from manifest; clips play; initial budgets (to validate): character ≤ 1.5 k tris, scene ≤ 30 k tris, total GLB ≤ 5 MB, textures ≤ 1024².
- **Checks:** Playwright asset-load (no 404/console errors); Blender-side scale/origin/triangle checks; phone-size visual review.
- **Risks:** rig/clip consistency; AI-generated meshes are drafts only.

### Step 1.7 — Load and performance measurement
- **Goal:** evidence for performance targets and the avatar cap.
- **Tasks:** `scripts/load-test.ts`, browser `perf-probe`, report → `docs/perf-results.md`; tune cap, batch interval, crowd count.
- **Acceptance:** documented numbers vs targets (≥ 30 FPS, p95 event→visible < 500 ms at 200 participants) or a documented gap with options; limitations written down.
- **Risks:** headless Chromium uses software GL — FPS only valid from headed Chrome on a production build (with a capture tool running if one is used later).

### Step 1.8 — Capture readiness, docs, MVP acceptance
- **Goal:** all 12 criteria in REQUIREMENTS §11.
- **Tasks:** `pnpm build && pnpm start` (server serves built web), `docs/capture-notes.md` (how to show the broadcast view full-screen at 9:16 for window capture), README run instructions, final e2e, acceptance checklist, known limitations.
- **Acceptance:** 30-minute soak with the simulator while the broadcast page is displayed (window capture only if a tool is available); no memory growth trend; checklist signed off.

## 6. Mahalle Halayı gameplay (smallest coherent version)

- **Teams:** `gelin`, `damat`. `gelin`/`damat` assigns an unassigned viewer in any phase (contributes from that moment). Switching only in lobby/countdown; otherwise rejected with a hint. Teams persist across rounds in the session. Operator can reassign anytime.
- **Commands (data-driven):** `halay` → +1 team energy, per-player cooldown 5 s; `zıpla` / `oyna` → visual only, 2 s visual cooldown (`oyna` clip chosen by presentation layer). Unassigned viewers get no effect plus a "type gelin or damat" hint.
- **Rate limits:** per-user 3 events/s, global 100 events/s (token buckets); excess dropped and counted.
- **Gifts (simulator keys):** `rose` → special dance on sender's avatar (crowd flourish if sender isn't a player); `gg` → group celebration (global cooldown 5 s); `big_celebration` → davul-zurna effect (global cooldown 10 s, queue ≤ 3). No code path from gift to score (types + property test).
- **Round flow:** lobby → countdown 15 s → active 180 s → results 15 s (winner/draw) → lobby; auto-next on; operator may start/end/pause/reset. Winner = higher team energy; equal → draw. Scores reset each round.

## 7. First 3D scene and asset checklist

**Primitives first (Step 1.5):** courtyard ground with 2-tone tile pattern, 3 low façades, lamp posts, bunting, dance-floor circle, stage with davul/zurna musicians, team-colour banners/arches, hemisphere + one shadowed directional light, fixed camera, avatars = capsule + sphere head in team colour, crowd = instanced capsules.

| Asset | Step 1.5 | Step 1.6 (Blender) |
|---|---|---|
| Courtyard modular kit | primitives | hand-modelled, flat colours, shared material/atlas |
| Bunting, lamps, tables, davul, zurna | primitives | simple models; musicians with idle loop |
| Character (shared mesh, 2 colourways) | capsule | ~1.5 k tris, ~12-bone rig, 6 clips |
| Crowd dummy | instanced capsule | instanced low-poly, no skeleton |
| Effects | primitive particles | small meshes/quads, no large textures |
| Team banners / UI frames | DOM/CSS | DOM/CSS |

AI image tools → concept sheet and palette only. AI 3D generation → optional drafts for static props. Characters are authored in Blender. Validate every asset: scale/origin, topology, UV/material count, texture size, rig, clip names, GLB size, in-browser look at phone size.

## 8. Performance and load-test approach

**Scenarios (seeded):** S1 steady (200 viewers, ~25 events/s, 5 min); S2 burst (200 `halay` in 2 s ×5); S3 chaos (duplicates, malformed, 5 000-char comments, rapid repeats, provider disconnect); S4 gift storm (20 gifts in 5 s incl. 3 `big_celebration`); S5 socket reconnect mid-round (3 clients); S6 30-minute soak.
**Server metrics:** ingest→processed latency (p50/p95/p99), queue depth/overflow, rate-limited/deduped counts, tick duration, event-loop lag, RSS/heap, bytes/s per client.
**Browser metrics (headed Chrome, production build, 1080×1920 and 720×1280):** FPS avg and 1 % low, frame-time p95, `renderer.info`, JS heap, long tasks, mixer cost, event→visible latency (event id → first draw, same-machine clock).
**Sweeps:** visible cap 12/24/36/48 × crowd 0/60/120; batch interval 50/100 ms; with/without a capture tool (if one is in use).
**Pass criteria:** ≥ 30 FPS and p95 event→visible < 500 ms at 200 participants (REQUIREMENTS §8). Proposed server guard-rails (assumptions): p95 ingest→processed < 50 ms; no unbounded queue/heap growth over 30 min.

## 9. Testing matrix

| Step | Unit | Integration | Browser | Load |
|---|---|---|---|---|
| 1.0 | trivial | – | pages load | – |
| 1.1 | normalizer, sanitizer, round machine, players/teams/scoring | – | – | – |
| 1.2 | rules, cooldowns, dedupe, queue, gift-never-scores | engine + simulator | – | 200-player scenario |
| 1.3 | operator validation, auth | socket snapshot/update/reconnect | – | – |
| 1.4 | store reducers | – | operator drives round; legibility shots | – |
| 1.5 | slot allocator, effect queue | – | canvas non-blank, effects, context loss | – |
| 1.6 | manifest schema | – | assets load, clips play | – |
| 1.7 | report math | – | perf probe | S1–S6 + sweeps |
| 1.8 | – | – | full e2e + manual capture check | 30-min soak |

## 10. Decisions log

Plan approved as written; the recommended defaults below stand unless changed. Items marked *confirm* need an explicit answer before the phase that depends on them.

| # | Decision | Default | Status |
|---|---|---|---|
| 1 | Node version | 24.22.3 LTS (fallback: keep 22.14.0) | *confirm in Step 1.0* |
| 2 | pnpm install method | corepack + `packageManager: pnpm@12.21.0` (fallback `npm i -g`) | *confirm in Step 1.0* |
| 3 | TypeScript | 6.0.3 | default |
| 4 | `git init` (local, no remote, no commits unless asked) | yes | *confirm in Step 1.0* |
| 5 | Vite multi-page instead of router | yes | default |
| 6 | Unassigned viewer sends `halay` | ignore + hint | default |
| 7 | Turkish normalization folds diacritics | yes | default |
| 8 | Team-size fairness | raw sum; log team sizes; revisit after playtests | default |
| 9 | Operator protection | 127.0.0.1 bind + token | default |
| 10 | Runtime GLB location | `apps/web/public/game-modes/mahalle-halayi/models/` | default |
| 11 | Provisional numbers (timings, cooldowns, cap 24, rate limits) | as in §5/§6 | tune in playtests |
| 12 | Target machine | this M3/16 GB running the browser (and a capture tool, if used) | *confirm* |
| 13 | OBS | not used; skipped by your decision on 2026-11-23 unless TikTok's route requires it | decided |
| 14 | TikTok account for Product Phase 2 | dedicated account created and owned by the user; check LIVE eligibility early | *user action, before Step 2.0* |
| 15 | Simulator during a live session | not mixed: one provider per run; simulator is for offline dev/test/demo | decided |

**Document inconsistencies and proposed resolutions**
- `operator.command` listed as a normalized event kind vs operator events kept separate → distinct validated type sharing only the serialized engine queue.
- "Late viewer may join" vs "switching disabled" → join = first assignment, always allowed; switch = lobby/countdown only.
- `rose` for a non-player sender → crowd flourish fallback.
- `stopped`/`paused` as round states → `stopped` = no game; `paused` = flag over the current phase.

**Risks:** skinned-animation cost for ~24 mixers on an M3 shared with a capture tool (measure in Step 1.7; mitigate with cap/instancing/shared skeleton); capture-tool compatibility (OBS skipped by decision; revisit only if TikTok's route needs a tool with an embedded browser); Blender/AI rig consistency (one rig, reused); TikTok LIVE integration (Product Phase 2) is out of scope for this plan and its feasibility is still unresearched; `three` and pnpm 12 move fast (exact-pin, upgrade deliberately).

## 11. Progress tracker

| Step | Status | Approved on | Notes |
|---|---|---|---|
| 1.0 Toolchain & skeleton | Done (2026-11-22) | 2026-11-22 | Node stays 22.14.0 (`engines >=22.13`, `.nvmrc` 22); pnpm 12.21.0 via `npm i -g --prefix ~/.npm-global` (corepack 0.31 can't fetch pnpm 12); `@types/node@22`; `git init` done, no commits |
| 1.1 Contracts + core domain | Done (2026-11-22) | 2026-11-22 | Lobby is transient when `autoNext` is on (stopped → countdown); manual `startRound` skips the countdown; `GameState` composes the services; `decideWinner` lives in scoring; `maxPlayers` cap 1000 added |
| 1.2 Rules + ingestion pipeline | Done (2026-11-22) | 2026-11-22 | `GameMode` has `handleCommand`/`handleGift` (gift handler can only return presentation effects); `createModeState`/`computeResult` from PLAN §4 omitted until a mode needs them; non-command chatter is dropped before dedupe/rate-limit; queue sheds oldest droppable (visual) items first; gift `queue ≤ 3` is left to the Step 1.5 client effects layer; integration tests live in `apps/server/test/` (outside core/mode lint boundaries) |
| 1.3 Realtime server + operator API | Done (2026-11-22) | 2026-11-22 | `state:hud` (no roster) + `state:roster` deltas replace repeated full snapshots; roster is sent before HUD; simulator commands are a separate contract (`SimulatorCommandSchema`) routed to the provider, not the engine; operator token travels in `auth` (web: URL fragment `#token=`) and the e2e run pins `OPERATOR_TOKEN=e2e-operator-token`; broadcast clients that send anything are disconnected; messages over 64 KB are refused; `src/server.ts` moved to `src/realtime/socket-server.ts` |
| 1.4 Operator panel + 2D HUD | Done (2026-11-22) | 2026-11-22 | zustand 5.1.0 vanilla store + `createRealtimeClient` (validates every incoming message with the contract schemas); operator token via `#token=` with a paste prompt when missing; broadcast sizes everything in `--u` (1% of stage width, no container queries, for old OBS Chromium builds) and takes wording/colours from `game-modes/mahalle-halayi/presentation.ts`; the operator UI is only in the operator bundle, but the shared contracts chunk still carries operator command *names* (schemas); simulator burst rotates through the pool; Playwright now runs 1 worker and shuts the dev servers down (`gracefulShutdown`) |
| 1.5 3D blockout | Done (2026-11-23); OBS checkpoint dropped by decision | 2026-11-23 | three 0.187.0 + R3F 9.8.2 (exact pins). Renderer (`game-renderer/`) is mode-agnostic: `AvatarSlots` (cap 24, per-team split, sticky, hysteresis), `EffectDirector` + `EffectQueue` (per-effect concurrency/queue limits), instanced `Crowd`, pooled confetti/rings, `CueBus` (cues bypass React state), `?perf=1` overlay and `?probe=1` test hooks (`window.__perf`). Mahalle Halayı scene, formation, looks and effect recipes are data in `game-modes/mahalle-halayi/`. Avatars are one merged vertex-coloured mesh each; background props do not cast shadows (draw calls were 220, now under the provisional 150 budget). HUD compacted so the scene shows between the scores and the chips. Broadcast bundle is ~950 kB (253 kB gzip); the operator bundle has no three.js. Headless Chrome (software GL) is used for functional tests only; FPS is measured in Step 1.7. |
| 1.6 Blender art pass | Done (2026-11-23) | 2026-11-23 | Assets are authored by deterministic Blender scripts (`assets/game-modes/mahalle-halayi/scripts/`, `pnpm assets:build`), no AI-generated meshes. One 12-bone toy character (~500 tris, one skinned mesh, vertex colours, no textures) in 3 looks (gelin, damat, band) with 6 clips; instanced crowd figure (~120 tris); courtyard kit of 13 named pieces (~3.1 k tris); total ~560 KB. Loaded with `useLoader(GLTFLoader)` + `SkeletonUtils.clone` (no drei); each avatar has its own `AnimationMixer`; the primitive scene is kept as an automatic fallback while loading or if a model fails. Vertex colours must be written as sRGB (Blender converts on export), otherwise everything is too dark. Budgets are enforced by the Blender scripts and `assets.test.ts`; e2e checks the models load with no errors or 404s and that the `halay`, `jump` clips really start. Manual checklist item still open: loop/blend smoothness on a live recording. **Follow-up (2026-11-23): name tags** (see below) |
| 1.7 Load & performance | Done (2026-11-23) | 2026-11-23 | Results and method in `docs/perf-results.md`. Headed Chrome 157, production build, M3: 60 FPS (display-capped) at 1080×1920 and 720×1280 with 200 participants, live traffic, gift storms and 200-participant bursts; stress to 200 avatars + 400 crowd figures still 60 FPS; event→drawn latency p95 ≈ 82–86 ms (target 500 ms); server idle (~2–5% of a core, ingest→processed p99 ≤ 56 ms, no errors in S1–S5 incl. hostile traffic and reconnects). No tuning needed; AVATAR_CAP 24 / crowd 30 / 50 ms batches kept (the avatar cap is limited by composition, not performance). Added: engine latency histogram, `oldestIngestedAt` on presentation batches, `?perf=1` windowed stats and `cap`/`crowd` overrides, `pnpm perf:load` and `pnpm perf:browser`. Not measured: GPU time, a running capture tool, other hardware, 30-minute soak (Step 1.8) |
| 1.8 Capture readiness & acceptance | Done (2026-11-23) | 2026-11-23 | `pnpm start` builds and serves the web app from the server on one port (`WEB_DIR`, read-only static handler: no traversal, NUL bytes, malformed escapes or symlink escapes; tested), `docs/capture-notes.md`, README run instructions, `docs/mvp-acceptance.md` (12 criteria with evidence + known limitations). 30-minute soak on the production start passed: server memory slope −0.26 MB/min, browser heap flat, graphics resources constant, ≥ 58.6 FPS in every window, latency p95 ≤ 86 ms. Criterion 10 is **partly met**: displays correctly at 9:16 in Chrome and is capturable by window capture, but no streaming tool was tested. Product Phase 1 is complete pending your acceptance |
| 1.9 Living halay | Complete, awaiting your review | 2026-11-23 | Beat clock, two travelling step lines, bride and groom, traditional musicians; 17 e2e tests and the browser performance run pass (60 FPS up to 200 avatars + 200 crowd). Sound is Step 1.10 |
| 1.9a Engine separation clean-up | Done (2026-11-23) | 2026-11-23 | Game words and animation names moved out of the shared renderer/operator code into the game folder (`AnimationRules`, per-mode simulator words); a boundary test (`engine-boundary.test.ts`) keeps game words out of shared folders |
| 1.9b Halaybaşı | Complete, awaiting your review | 2026-11-23 | The first and last slots of each line are its two halaybaşı, one at each end (the two most recently active players; 10 s minimum term, 4 s margin, instant successor if they leave); leader models with a mendil, leader step and mendil flourish clips, ★ on the name tag; no scoring bonus. 17 e2e and 292 unit tests pass |
| 1.10 Sound | Complete, awaiting your review (by ear) | 2026-11-23 | Games can supply a music file (the producer owns the rights): streamed, faded by phase, dancers lock to it if it states a tempo; the built-in synthesised halay (tuned against measurements of the reference track) is the fallback; `halay.mp3` is the Halay game's default and is kept out of git. Game-neutral Web Audio engine (`game-renderer/audio/`): synthesised davul/zurna halay music on the beat clock with energy layers, effects with voice limits and ducking, master compressor and soft clip; operator mute/volume held by the server; tap-to-unlock hint; offline loudness/clipping check in the browser tests. Capture of the sound into a stream is a Phase 2 question |
| Product Phase 1 acceptance | Accepted (2026-11-23) | 2026-11-23 | Steps 1.0–1.10 done; `docs/mvp-acceptance.md` |
| 2.0 Feasibility research | Report delivered (2026-11-23), awaiting your decision | 2026-11-23 | `docs/tiktok-live-feasibility.md`: no official LIVE events route; unofficial connector works but conflicts with TikTok's Terms; hard music rule for public LIVE; getting our page into LIVE Studio is unproven. Recommendation: conditional go, in stages. Research and documentation only, no connector code |
| 2.1 Decision gate | Decided (2026-11-23) | 2026-11-23 | You chose option A of `docs/tiktok-live-feasibility.md`: read LIVE events through the unofficial connector as a swappable provider, **accepting the Terms-of-Service risk** (read-only, no session cookies, no credentials committed, kill switch). A similar open-source project was read for understanding only; **none of its code is used** |
| 2.2 TikTok provider | Built and tested (2026-11-23) | 2026-11-23 | Our own code in `apps/server/src/providers/tiktok/` behind `ingest()` (parsers for untrusted messages, gift streak counted once, failure classes with per-reason retry, kill switch); connector pinned at 2.5.0 (AGPL-3.0 with the section 18 permission for TikTok LIVE games, `THIRD_PARTY_NOTICES.md`); `TIKTOK_LIVE=on` required; one provider per run; verified with a fake connection only |
| 2.3 Operator controls | Built and tested (2026-11-23) | 2026-11-23 | TikTok LIVE panel (username, Connect, Disconnect = kill switch, live status and counters via `providerInfo` on the HUD) |
| 2.4–2.5 | Not started | – | Stream path (your LIVE Studio test), private then public LIVE; the real connection is first exercised here |
| 3.1 Game capabilities and game selection | Built and tested (2026-11-23) | 2026-11-23 | Approved plan: `~/.claude/plans/eager-mixing-fern-of-5d5c40d6-4477-4dfd-817b-3764fee1ca01.md`. Gift scoring is a per-game capability (`giftsMayScore`, default off; the engine enforces it); operator `select_game` (only while stopped), `GameEngine.setMode`, `GAME=` at startup, operator Game panel, scene remount per game |
| 3.2 Viewers' comments on screen | Done, awaiting review | – | Joined players only, on by default, operator off-switch, filters, speech bubbles (Mahalle Halayı opts in) |
| 3.3 Takı Takma Töreni: rules | Done, awaiting review | – | Server mode `taki-takma` (`tak` +1 per 8 s, `alkış`; gifts add bonus points: rose 3, gg 10, big_celebration 30, placeholders), simulator vocabulary per game, playable from the dashboard with a placeholder scene borrowed from Mahalle Halayı. The "every 25 points" takı shower is a visual the Step 3.4 scene derives from the scores, not a rule |
| 3.4 Takı Takma Töreni: scene, characters, sound | Done, awaiting review | – | Eight new Blender characters on the shared rig (guest per side, bride, groom, four parents; clips walk, pin, clap, receive, thank, wipe_tears, cheer), wedding hall, two guest queues whose members walk up and pin takı, gold meters, takı shower every 25 points, hicaz-flavoured synthesised music |
| 3.5 Second game: performance, e2e, docs | Done, awaiting review | 2026-11-23 | Browser performance of Takı at 200 participants: about 60 FPS, 112-118 draw calls (budget 150), see `docs/perf-results.md`. e2e plays a Takı round from the dashboard. Engine-boundary test covers Takı words. Open before a public stream: TikTok monetization policy read, gift tiers mapping, tuning of point values |
| 4.1 At Yarışı: engine capabilities | Done, awaiting review | 2026-11-23 | Likes as a viewer action (summed per viewer, leaky-bucket limited, own dedupe; `GameModeConfig.likes`, `GameMode.handleLike`), a game-owned live simulation stepped at 10 Hz (`GameMode.live`, `engine.step()`), a broadcast-only `state:live` message (race view schema in contracts), individual `RoundResult.ranking`, TikTok like parsing, simulator `sim_like`, web `LiveFeed`, optional `ModePresentation.Overlay` / `showTeamScores`, floating name tags. Mahalle Halayı and Takı untouched |
| 4.2 At Yarışı: race rules | Done, awaiting review | 2026-11-23 | Server mode `at-yarisi`: viewers join with `1` (aliases at, yarış, katıl), 10 race and the rest wait in a first-come queue (last race's horses go to the back, so everyone gets a turn); a pure, seedable `RaceSim` (6 laps of 400 m); likes boost the sender's horse (saturating, fading, max +30%), gifts are self-only surges/jockey capped at +10% (rose +6% for 4 s, GG +9% for 6 s, jockey +2%), mild luck and catch-up, hard speed ceiling. Placeholder flat top-down scene, standings overlay and ranking result. **Balance (from 1,500-race simulations):** an equal tapper beats a gifter about a third of the time, a heavy tapper holds their own, someone who only joined almost never wins, so likes are what matter and they are free |
| 4.3 At Yarışı: scene, horses, camera | Done, awaiting review | 2026-11-23 | A new quadruped Blender rig (14 bones, ~900 triangles: horse and jockey as three skinned meshes so the coat and silks can be tinted per racer) with clips idle/gallop/gallop_boost/victory; code-built course (dirt track, rails, start/finish line, pond, instanced stands with spectators, skyline and an original tower, trees); a chase camera that follows the leaders (arc round the grid before the start, wide view on the winner); the server's 10 Hz views eased into smooth motion (`RaceSmoother`); floating name tags and speech bubbles that follow the horses; gallop speed follows the horse's speed (`followTempo` in the clip player) |
| 4.4 At Yarışı: sound | Done, awaiting review | 2026-11-23 | Original synthesised score (galloping triplet beat, bright major tune around E5) that builds with the race's excitement (a baseline while racing plus what viewers just did); effects for joins, like bursts (whoosh), rose/GG surges, jockey, crowd cheers, the countdown, the start and the results; the scene also announces race moments as cues (last lap, first horse home). Offline loudness/clipping check in `e2e/sound.spec.ts`. No music file, so no rights question |
| 4.5 At Yarışı: performance, e2e, docs | Done, awaiting review | 2026-11-23 | Browser performance at 200 participants (10 racing, 190 waiting): 60 FPS, 43-63 draw calls, `docs/perf-results.md`; e2e plays a race from the dashboard and checks the results ranking and that the queue's viewer is on the next grid; docs updated (README, building-a-game, running-a-stream). Open before a public stream: TikTok policy read (gifts influence a race), real like events measured on a private LIVE, balance numbers and the gallop tuned by playtest |

## 12. Product Phase 2 — TikTok LIVE integration (outline only)

Product Phase 2 is the project's ultimate purpose: running the games on real TikTok LIVE sessions. It is **not planned in detail yet**, on purpose: the right design depends on what the feasibility research finds. This outline only fixes the order of work and the gates, mirroring `REQUIREMENTS.md` §9. Nothing in this section is approved for implementation. Preliminary desk research is in [`docs/tiktok-live-research-notes.md`](docs/tiktok-live-research-notes.md); it is input for Step 2.0, not a substitute for it.

| Step | Goal | Output | Gate |
|---|---|---|---|
| 2.0 Prerequisites and feasibility research | You create the dedicated TikTok account and check what it takes to go LIVE; we research official and unofficial routes, platform terms and policies, access and approvals, event types and identifiers, gift semantics (streaks/combos), latency, rate limits, reconnection behavior, stability | Written feasibility report with a recommendation, including "do not proceed" as an option. **No connector code.** | Report delivered |
| 2.1 Decision gate | You choose an approach or stop Product Phase 2 | Recorded decision and policy review; refined Product Phase 2 acceptance criteria | **Your explicit go / no-go** |
| 2.2 Provider foundations | Capture sanitized sample payloads as fixtures; decide which existing contracts need small extensions (for example extra provider status states, stable-ID handling, gift key mapping) and extract a shared provider interface only if the real provider needs it | Detailed Step 2.3–2.5 plan, fixtures, contract changes with tests | Your approval of the detailed plan |
| 2.3 TikTok provider | Connect, reconnect with backoff, normalize comments and supported gifts into the existing pipeline, report connection status, keep secrets in environment config | Provider module under `providers/tiktok/`, fixture-replay tests, simulator tests still green | Tests green |
| 2.4 Startup wiring and operator experience | Select exactly one provider at startup by configuration; show provider status in operator and broadcast views; document how to run live vs. simulated | Configuration, docs, e2e coverage for both provider modes | Both modes verified |
| 2.5 Real-session validation | Run a **public TikTok LIVE stream** on the dedicated account in which real viewers join and play through the normal game mechanics (the Product Phase 2 definition of success), subject to access and platform limits; a private test session comes first as a stepping stone; record what could not be verified | Validation report and known limitations | Product Phase 2 acceptance (`REQUIREMENTS.md` §11) |

Invariants for every Product Phase 2 step: the game rules, scoring, rounds, operator panel, and broadcast view stay provider-independent; gifts stay cosmetic unless you explicitly approve otherwise; the simulator keeps working on its own; no credentials are committed.

### Steps 1.9 and 1.10: added to Product Phase 1 after the first playtest (2026-11-23)

Product Phase 1 acceptance is reopened until both steps are done. Decisions (yours, 2026-11-23): keep the two facing Gelin/Damat lines; make the halay move (lines travel up and down the screen in a sideways step, on a shared beat); bride and groom dance their own halay in the centre; musicians stay on the stage but become traditional (davul and zurna, instruments part of the models); sound is part of Product Phase 1, with original synthesised music and effects (my recommendation, accepted).

- **Step 1.9 — Living halay.** Shared beat clock with energy-driven tempo; both lines dance sideways step loops synchronised to it and travel up and down the courtyard together (8 beats each way, ±1.3 m, constant speed so the step reads as walking); accents (`halay` kick, `zıpla`, `oyna`, rose) layer on top; name tags follow the moving characters; bride and groom in the centre with their own clips; traditional davul and zurna musicians with their instruments modelled in; crowd bobs on the beat. Raise the visible-avatar cap only if composition allows (performance has ~8x headroom).
- **Step 1.10 — Sound.** Web Audio engine: music bus and effects bus, original synthesised halay loop (davul and zurna voices) that follows the beat clock and energy, effects for join/jump/gifts/countdown/round start/results, voice limits and ducking, mute/volume in the operator panel (state kept by the server so it survives refresh), browser-autoplay handling, tests for scheduling logic and a measured loudness/clipping check; whether it *sounds* good is for you to judge by ear.

- **Step 1.9a — Engine separation clean-up.** Before a second game is built, the shared web code (renderer, operator, broadcast, realtime) and server core must not know any one game. Done: the renderer has its own animation vocabulary (`flourish`, `jump`, `spin`, `wiggle`, `hop`, `special`); each game supplies `AnimationRules` mapping its viewer words onto it; the operator simulator panel shows the active game's words; a unit test fails if a game word appears in shared code. No plugin system is added.
- **Step 1.9b — Halaybaşı.** A halay has two ends, so the first and last slot of each line are its two halaybaşı slots, filled by the team's two most recently active players; lines fill from both ends inwards (the existing activity ranking, with hysteresis). The halaybaşı uses a leader look with a team-coloured mendil, stands at its end of the line and steps out in front; the tail-end leader holds the mendil in the other hand, and has its own clips (leader step, mendil flourish). `halay` and `oyna` comments and cosmetic gifts trigger the mendil flourish. No effect on scoring.

### Name tags (follow-up to Step 1.6, 2026-11-23)

Each of the (at most 24) individually shown characters has a name tag, drawn as DOM text over the 3D canvas, positioned from the fixed camera in stage fractions (`game-renderer/name-tags.ts`, `NameTags.tsx`).
- **Always-on tag:** small (2.2% of the stage width), placed inside each halay line on the side facing the dance floor so it never covers the characters or the crowd. This is a deliberate, documented exception to the 3.5% minimum text size: rows are only ~3.4 stage units apart where the lines recede, so a bigger tag would overlap its neighbours. Names are truncated with an ellipsis at 12 units so facing tags never meet.
- **Action tag:** when a player joins, dances, or sends a gift, their tag grows into a readable chip (4% of the width, team colour) above the character for 2.5 s, then settles back.
- **Safety:** names are React text nodes only (never HTML); tested with `<img src=x onerror=…>`.
- **Crowd members have no tag.** A crowd member who acts is given an avatar slot if one can be taken (this also fixed a bug where a cue that arrived before the roster update never won a slot).
- Tested by unit tests (projection, anchors, `TagBoard` timing) and a browser test (24 tags for 100+ players, no overlaps, hostile name inert, emphasis returns to quiet). The legibility test now checks quiet tags ≥ 2.2% and action tags ≥ 3.5%.
