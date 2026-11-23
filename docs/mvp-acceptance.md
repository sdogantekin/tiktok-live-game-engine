# MVP acceptance (Product Phase 1)

> **Status (2026-11-23):** reopened. After the first playtest, Steps 1.9 (living halay, bride and groom, traditional musicians) and 1.10 (sound) were added to Product Phase 1; this checklist is re-signed when both are done. Both steps are built and verified (unit and end-to-end tests, a 30-minute soak and a browser performance run, see `docs/perf-results.md`), and are waiting for your acceptance; the table below still shows the earlier evidence.

Checklist for `REQUIREMENTS.md` §11, with the evidence behind each line. "Met" means the evidence exists and was run; anything not verified is said so.

Evidence key: **unit** = Vitest unit/integration tests (`pnpm test`); **e2e** = Playwright browser tests (`pnpm test:e2e`); **perf** = `docs/perf-results.md`; **soak** = the 30-minute run below.

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Starts locally using documented commands | Met | `README.md` (`pnpm install`, `pnpm start`, `pnpm dev`); the production start was smoke-tested and the soak ran on it; e2e runs on `pnpm dev` |
| 2 | A viewer can join either team through the simulator | Met | unit `engine.test.ts` › joining; `simulation.integration.test.ts`; e2e `round.spec.ts` (operator adds viewers, both teams fill) |
| 3 | Supported comments cause the expected in-game action | Met | unit `rules.test.ts`, `engine.test.ts` (join, `halay` scoring, `zıpla`/`oyna` visual-only, Turkish spellings); e2e `scene.spec.ts` (clips start for `halay`) |
| 4 | Repeated commands are rate-limited and cannot cause runaway score | Met | unit `engine.test.ts` (cooldowns, per-user and global limits), `simulation.integration.test.ts` (200 simultaneous `halay` ≤ 200 points); perf S2 (bursts) and S3 (hostile traffic): no errors |
| 5 | Simulated gifts trigger effects without changing the winner score | Met | unit `engine.test.ts` (gifts, 500-gift random mix leaves scores unchanged; the mode's gift handler can only return presentation effects); e2e `scene.spec.ts` (effects fire, scores identical); perf S4 |
| 6 | Team energy and the round result are calculated on the server | Met | unit `game-state.test.ts`, `engine.test.ts` (results); the browser only renders snapshots (no scoring code in `apps/web`); e2e `round.spec.ts` (banner shows the server's winner) |
| 7 | Automatic round flow from lobby through results | Met | unit `round-service.test.ts`, `engine.test.ts` (automatic round flow, late ticks, pause); integration `realtime.integration.test.ts` (timer-driven phases); soak (phases cycled for 30 minutes) |
| 8 | Operator can pause, resume, start, end, and trigger predefined events | Met | unit `engine.test.ts` (operator commands), `realtime.integration.test.ts` (acked commands, auth); e2e `round.spec.ts` (pause/resume, end round, confirmed reset, celebration, remove player) |
| 9 | Backend handles 100–200 simulated participants | Met | unit `simulation.integration.test.ts` (steady 200, burst, chaos); perf S1–S5 (200 participants, ~25 events/s, zero errors); soak |
| 10 | Broadcast view works in a vertical 9:16 layout and can be captured (revised: browser window capture; OBS not required) | **Partly met** | e2e `legibility.spec.ts` (1080×1920 and 540×960: text sizes, no clipping or overflow), screenshots, `docs/capture-notes.md`. **Not verified:** capture by an actual streaming tool (none installed or required by the project so far) |
| 11 | Automated tests for rules, scoring, cooldowns, round transitions, deduplication | Met | See the test counts below; dedupe in `pipeline-primitives.test.ts` and `engine.test.ts` |
| 12 | Performance results and known limitations are documented | Met | `docs/perf-results.md`, the limitations below |

## Automated test totals at acceptance

- **Unit and integration (Vitest): 263 tests in 24 files**, all passing (game rules, scoring, cooldowns, round transitions, event normalization and deduplication, simulator, realtime server and operator API, production file serving, web store, renderer logic, asset budgets).
- **Browser (Playwright): 16 tests**, all passing (full rounds, outage handling, refresh recovery, legibility at 1080×1920 and 540×960, 3D scene, name tags, model loading, WebGL context recovery).
- Typecheck and lint clean; production build succeeds.

## 30-minute soak

Run on 2026-11-23 with `pnpm perf:soak`: the **production start** (`pnpm start`, one server on port 3001 serving the built web app), 200 simulated participants, a visible Chrome window at 1080×1920 showing the broadcast view, the operator panel open in a second window, and steady chat traffic (~25 events/s) for **30 minutes**. Every 2 minutes all 200 participants sent `halay` within 1.5 s; every minute a `gg` and every 3 minutes a `big_celebration` was sent. Rounds looped automatically (countdown → active → results → next round, about 8 rounds); phases seen: active, countdown, results. 60 samples, one every 30 s (`docs/perf/soak.json`).

| Measure | Result | Reading |
|---|---|---|
| Server memory (RSS), after the first 5 minutes | slope **-0.255 MB/min**; median 32.2 MB (first half) → 33.1 MB (second half); peak 59.5 MB (early, at start-up) | No growth |
| Browser JS heap (broadcast page) | slope **-0.045 MB/min**; median 30.9 → 29 MB | No growth |
| Operator page JS heap | median 8.6 → 9.0 MB | No growth |
| three.js geometries / textures | constant at 35 / 31 for the whole run | No GPU resource leak |
| DOM nodes (broadcast) | 67–70 | Stable |
| Frame rate (30 s averages) | minimum **58.6**, median 60 FPS | Held at the 60 Hz display rate |
| Slowest 30 s window, frames slower than 33 ms | 0.4% | Negligible |
| Event→drawn latency p95 | at most 86 ms in any window | Unchanged from the short runs |

The test also enforces bounds (server growth under 1 MB/min, browser heap growth under 20 MB, constant graphics resources, no 30 s window under 50 FPS) and passed. Caveat: the server figure is the whole process's resident memory sampled from the OS; it fell during the run after the start-up peak, which is normal allocator and garbage-collection behaviour, not a trend. One machine, one session; a longer run (hours) is the natural next check if the game ever streams for that long.

## Known limitations

**Scope**
- The event source is the local simulator only. Real TikTok LIVE integration is Product Phase 2 and has not been started beyond desk research (`docs/tiktok-live-research-notes.md`).
- One game mode (Mahalle Halayı). Gift names are simulator keys, not TikTok's.

**State and operations**
- Everything is in memory: restarting the server loses players, scores and round history.
- The operator interface is for the same machine only: the server binds to `127.0.0.1`, access needs a token, and the token is regenerated on every start unless `OPERATOR_TOKEN` is set. There is no rate limit on operator-token attempts, and remote operation is not supported.
- Round timings, cooldowns, and the avatar cap are code configuration, not operator settings.
- Teams persist across rounds and are not balanced; the winner is the raw energy sum, which favours the larger team (decision recorded in `PLAN.md` §10).

**Presentation**
- All art is original, procedurally authored low-poly work built to the style guide; it is a first pass, not a designer's finished art. Animation smoothness (loops and blends back to idle) has been checked in stills and by the clips starting, not judged on a recording.
- Only 24 players at a time have a character and a name tag; everyone else is part of the crowd and anonymous. The always-on name tags are small (2.2% of the stage width, a documented exception to the 3.5% text rule).
- No sound or music.
- Broadcast text is Turkish and fixed in the mode's presentation module; the operator panel is English; no language switch. Accessibility was not addressed.
- Only Chrome (157) was tested; other browsers are untested.

**Capture and performance**
- No streaming tool was tested; see `docs/capture-notes.md`.
- Performance was measured on one machine (Apple M3). Results are capped at the display's 60 Hz, GPU time was not measured directly, and the effect of a capture tool encoding video at the same time is unknown (`docs/perf-results.md`, "Limitations").
