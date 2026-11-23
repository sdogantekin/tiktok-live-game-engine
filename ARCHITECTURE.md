# TikTok Live Game Engine — Technical Architecture

**Document status:** Baseline architecture for MVP planning; designed so a real platform provider (TikTok LIVE, Product Phase 2) can be added without changing the engine  
**Architecture style:** Modular monolith in a pnpm workspace  
**Runtime model:** Local-first, server-authoritative game state

> **Terminology.** "Product Phase 1/2" are product milestones defined in `REQUIREMENTS.md` (Standalone MVP; TikTok LIVE integration). Each has its own implementation steps in `PLAN.md`, numbered `Step 1.x` and `Step 2.x`.

## 1. Architectural goals

1. Build the first game quickly without creating a throwaway codebase.
2. Keep game modes modular while avoiding a premature dynamic plugin platform.
3. Keep the engine independent from platform-specific payloads and connectivity, so TikTok LIVE can be added as a second event provider (Product Phase 2) without touching game rules, core services, or the views.
4. Keep server-side game rules authoritative and rendering client-side.
5. Support 100–200 simulated participant records without rendering a full-detail avatar for every participant.
6. Keep 3D art direction and assets replaceable without changing game rules.
7. Make the local simulator a permanent development and testing tool that stays usable on its own, with no dependency on any platform integration.

## 2. Key decisions

### ADR-001: Modular monolith, not microservices

Use one repository and one backend application for the MVP. Separate responsibilities by module and package boundary. Do not add distributed services, message brokers, or orchestration infrastructure unless a measured requirement later justifies them.

### ADR-002: TypeScript across application boundaries

Use TypeScript for frontend, backend, and shared contracts. Validate untrusted data at runtime at provider, operator, and network boundaries.

### ADR-003: React + Vite + React Three Fiber

Use React and Vite for the web application. Use React Three Fiber as the React renderer for Three.js. Avoid maintaining a separate React UI renderer and a competing imperative Three.js scene architecture unless profiling demonstrates a specific need.

Use a stable, mutually compatible version set. At the time this baseline was prepared, the React Three Fiber documentation identifies v9 as the stable line paired with React 19 and v10 as alpha; verify the current state when dependencies are selected. Do not adopt alpha releases for the MVP without explicit approval.

### ADR-004: Node.js backend + Socket.IO

Use a Node.js TypeScript server and Socket.IO for real-time updates between the server and browser clients. The backend owns game state. The browser renders snapshots and state changes; it does not calculate authoritative scores or winners.

Socket.IO preserves message ordering, but its default delivery guarantee is at-most-once. Therefore, the application must send a fresh authoritative state snapshot when a client connects or reconnects. Do not rely on transient animation messages being replayed after a disconnect.

### ADR-005: Static game-mode registry for the MVP

Game modes are code modules registered at build time. Do not implement runtime module loading, third-party plugins, or a game marketplace. Each mode has a server-side rules module and a client-side presentation module that share a typed contract.

This is enough modularity for Mahalle Halayı and a future Osmanlı Kuşatması while keeping the MVP understandable.

### ADR-006: Provider-independent event pipeline; Local Simulator now, TikTok LIVE planned

The engine consumes **normalized events only**. An *event provider* is any module that produces normalized events and hands them to the engine's single `ingest()` entry point, and that reports whether it is connected.

| Provider | Product phase | Status |
|---|---|---|
| Local Simulator | Product Phase 1 (MVP) | Built. Permanent development, test, and demo tool. |
| TikTok LIVE | Product Phase 2 | Planned. Starts with feasibility research; not built in the MVP. |

Rules that hold now and in Product Phase 2:
- The core engine, game modes, and views never import provider code, SDKs, or connector types. Providers depend on `packages/contracts` and on the `ingest()` function they are given, not on core internals.
- A TikTok provider translates platform payloads into the existing normalized event model. The event model, pipeline, and game rules are not reshaped around TikTok.
- Events and players are namespaced by provider id, so events from different providers can never collide.
- Exactly one provider is active per run, selected by configuration at startup. The simulator and a live provider are deliberately not mixed in one session (decided in `REQUIREMENTS.md` §9): simulated players must never appear on a real stream. Provider namespacing still keeps ids collision-free, but mixing is not a supported mode.
- The simulator has no dependency on the TikTok provider: it must build, run, and pass its tests with the TikTok provider absent.

What this ADR deliberately does **not** introduce: a plugin framework, runtime provider loading, a provider marketplace, dependency injection containers, or a multi-provider fan-in/orchestration layer. A provider is an ordinary TypeScript module selected by configuration at startup. A shared `EventProvider` interface should be extracted only when the TikTok provider's real needs are known from the feasibility research; until then the contract is just "emit normalized events through `ingest()` and report connection status".

Any unofficial TikTok connector is experimental and replaceable. Product Phase 2 begins with feasibility research: current TikTok developer and partner options, permissions, platform policies, access requirements, and technical constraints. Do not assume a general public LIVE comments-and-gifts API is available to this project, and do not assume any approach is permitted until the research says so.

### ADR-007: In-memory state for MVP

Keep player records, game state, scores, and event deduplication data in memory for the active local session. Do not add a database, accounts, or persistence until there is a concrete product requirement.

### ADR-008: Blender source, GLB runtime assets

Use Blender for asset cleanup, material/rig validation, scene assembly, and export. Keep editable `.blend` source files and export `.glb` assets for the web renderer. Use AI tools for concept references and draft assets, not as a substitute for asset validation.

## 3. Technology choices

| Concern | Baseline choice | Notes |
|---|---|---|
| Language | TypeScript | Shared contracts between apps |
| Package manager | pnpm | Workspace support |
| Frontend | React + Vite | Broadcast and operator views |
| 3D rendering | React Three Fiber + Three.js | One rendering integration |
| Backend | Node.js | Modular monolith |
| Real-time transport | Socket.IO | Server-to-browser updates |
| Runtime validation | Zod | Validate external event and command payloads |
| Unit/integration tests | Vitest | Game rules and service tests |
| Browser tests | Playwright | Broadcast/operator smoke tests |
| 3D source | Blender `.blend` | Editable source assets |
| Runtime 3D format | GLB | Web delivery of models and animations |

During planning, verify the current Node.js LTS and compatibility requirements of Vite, React, React Three Fiber, Three.js, and the selected test tools. Do not pin versions based only on this document.

## 4. Repository layout

The folder the user creates, `tiktok-live-game-engine/`, is the repository root. Do not create another nested folder with the same name.

Proposed structure:

```text
tiktok-live-game-engine/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       ├── broadcast/
│   │       ├── operator/
│   │       ├── game-renderer/
│   │       ├── game-modes/
│   │       │   └── mahalle-halayi/
│   │       └── realtime/
│   └── server/
│       └── src/
│           ├── app/
│           ├── core/
│           │   ├── players/
│           │   ├── teams/
│           │   ├── events/
│           │   ├── rounds/
│           │   ├── scoring/
│           │   └── state/
│           ├── game-modes/
│           │   ├── registry/
│           │   └── mahalle-halayi/
│           ├── providers/
│           │   ├── simulator/       # Product Phase 1 (MVP)
│           │   └── tiktok/          # Product Phase 2: not created until the feasibility decision
│           ├── operator/
│           └── realtime/
├── packages/
│   └── contracts/
│       └── src/
│           ├── events/
│           ├── game/
│           └── network/
├── assets/
│   ├── shared/
│   │   ├── characters/
│   │   ├── animations/
│   │   └── props/
│   └── game-modes/
│       └── mahalle-halayi/
│           ├── source-blend/
│           ├── models/
│           ├── materials/
│           └── references/
├── docs/
│   └── (future decision records and operational notes)
├── CLAUDE.md
├── REQUIREMENTS.md
├── ARCHITECTURE.md
├── package.json
└── pnpm-workspace.yaml
```

The planning phase may simplify this structure if a smaller layout better serves the MVP, but it must preserve the responsibility boundaries described below.

## 5. Runtime architecture

```text
Local Simulator (MVP)                 TikTok LIVE Provider (Product Phase 2)
          |                                      |
          +------------------+-------------------+
                             |
                    Provider Adapter
                             |
                  Normalized Live Events
                             |
               Validation / Deduplication
                             |
                  Rate Limit / Cooldown
                             |
                    Event-to-Action Map
                             |
                   Core Game Engine
           Players / Teams / Rounds / State
                             |
                  Active Game Mode Rules
                             |
                 Authoritative Game State
                             |
                    Socket.IO Server
                      /           \
                     /             \
             Broadcast View     Operator View
              React + R3F          React UI
```

The backend processes domain actions and owns the canonical state. The frontend receives state snapshots and updates, then renders animations and interface elements.

## 6. Event model and processing

### TikTok provider (Product Phase 2)
`apps/server/src/providers/tiktok/` is our own adapter: it turns untrusted TikTok chat and gift messages into normalized events, counts a gift streak once, classifies connection failures (offline, unknown username, signing service, rate limit, blocked, network) with a retry wait per reason, and can always be stopped. The unofficial `tiktok-live-connector` library sits behind a small port (`connection.ts`) and is loaded only when a connection is made, so the simulator and the tests never load it. A `ProviderHub` (`realtime/provider-hub.ts`) keeps exactly one provider in charge and feeds the HUD's `providerInfo`. Enabled only by `TIKTOK_LIVE=on`.

### Provider boundary

Provider adapters translate provider-specific payloads into normalized application events. The core engine must not import provider SDK or connector types.

**What a provider is responsible for** (the Local Simulator today, TikTok LIVE in Product Phase 2):
- Connecting to its source, and reconnecting with sensible backoff after a drop.
- Validating and normalizing every payload it receives; unrecognized or malformed payloads are dropped and counted, never forwarded as-is.
- Supplying a stable event ID where its source has one, otherwise a session-scoped ID, and a stable provider user ID.
- Sanitizing display names and limiting text length before handing events over (the core sanitizes again).
- Mapping the source's gift identifiers to semantic gift keys (see Gift normalization).
- Reporting connection status (connected / disconnected, and any additional states the feasibility research shows are needed). The engine publishes this status so the operator and the broadcast view can show it, and the game continues while the provider is down.
- Keeping credentials and session secrets in environment configuration, never in source control or logs.

**What stays in the engine regardless of provider:** deduplication, per-user and global rate limits, the bounded queue, command parsing, action mapping, game rules, scoring, rounds, and state. A provider must not implement game logic, and the engine must not contain provider-specific branches.

**Known provider-dependent unknowns to resolve during Product Phase 2 feasibility research, not now:** whether the source provides stable event IDs, how gift streaks and combos are reported, how late or out-of-order events appear, display-name constraints, and rate characteristics. The MVP pipeline already deduplicates by `provider:eventId` and tolerates malformed input, which is the base these questions build on.

A normalized event should contain, at minimum:
- A stable event ID when the provider supplies one; otherwise an adapter-generated session-scoped ID.
- Provider identifier.
- Event kind.
- Provider user ID and a sanitized display name.
- Received timestamp.
- A typed payload appropriate to the event.

Use a discriminated union rather than an unrestricted `Record<string, unknown>` for events after validation.

### Initial normalized event kinds
- `comment.received`
- `gift.received`
- `operator.command`

Like, follow, and share events are not required for the MVP. Add them only when a game mechanic needs them.

### Processing pipeline
1. Receive the provider event.
2. Validate and normalize the payload.
3. Deduplicate using the provider event ID where available.
4. Apply global and per-user rate limits.
5. Parse a supported comment into a domain action, or map a gift to a configured reward action.
6. Pass the action to the active game mode/core services.
7. Update authoritative state.
8. Publish the resulting state update and any transient presentation event.

Use a bounded in-memory queue if event bursts need smoothing. Define what happens when the queue is full; do not allow unbounded memory growth. Keep a bounded recent-ID cache for session-level deduplication.

### Gift normalization

Do not hard-code real-world gift prices or coin values into the game engine. A provider adapter should map a provider gift identifier to a configured semantic gift key. The game mode maps that semantic key to a presentation/reward action.

If a provider emits gift streak/combination updates, the adapter must define when those updates represent one completed gift action. Test this behavior with simulator fixtures before real integration.

## 7. Core engine responsibilities

### Player service
- Register and update session participants.
- Maintain provider ID, display name, team, join time, and limited session stats.
- Enforce team-switch rules and per-user cooldowns.
- Remove or ignore participants when requested by the operator.

### Team service
- Create teams from the active mode's configuration.
- Assign participants and track membership.
- Expose team totals to the game mode and broadcast view.

### Round service
- Own the lifecycle: lobby, countdown, active, results, paused, stopped.
- Track timing and automatic transitions.
- Allow validated operator overrides.

### Scoring service
- Provide generic score/energy primitives.
- Accept scoring decisions from the active game mode.
- Never infer score from a gift's monetary value.

### Game state service
- Own the canonical current state.
- Produce a complete snapshot for initial connection and reconnect.
- Publish minimal updates for normal operation.
- Keep transient animation messages separate from durable state changes.

## 8. Game-mode module contract

For the MVP, use a small, statically registered interface. Avoid a generic plugin framework.

Each game mode has:
- Metadata and mode configuration.
- Team definitions.
- Supported viewer commands and their validation rules.
- Gift-to-action mapping.
- Initial state creation.
- Game-action handling and scoring decisions.
- Round-end result calculation.
- Client-side scene/presentation component.
- Asset manifest and visual configuration.

Server-side mode logic and client-side rendering live in separate folders but use shared types from `packages/contracts`.

The core engine knows that a game mode can receive a normalized `GameAction`; it does not know what `halay`, `gelin`, or `mancınık` means.

On the web, the same rule holds: `game-renderer/`, `operator/`, `broadcast/` and `realtime/` contain no game words. A game supplies its scene, its wording, its viewer words and an `AnimationRules` object (which of the renderer's generic animations a viewer action plays) from `game-modes/<game>/`. `engine-boundary.test.ts` enforces this by scanning the shared folders for game words.

### Game music

Sound lives in `game-renderer/audio/` and is game-neutral: a Web Audio engine (master compressor and soft clip, music bus with ducking, effects bus with voice limits), a beat-locked step scheduler for synthesised music, and a `TrackPlayer` for music files. A game supplies a `SoundDesign` from its own folder: an optional synthesised `score`, an optional `track` (a file URL, with an optional `bpm` and `firstBeatSeconds` if it has one steady tempo), the music mode for each phase, and the mapping from cues to effects. The renderer never imports a game's sound data.

- A `track` is streamed through an audio element (long files are never decoded into memory), faded in and out with the phase, and, if it states a `bpm`, the scene's beat clock locks to it so the dancers dance to the file. Without a `bpm` the dancers keep their own energy-driven beat.
- **The built-in sound effects stay silent while a file is in use** (they would break the file's music); a game can opt back in with `effectsOverTrack`. Game-specific effects are the game producer's to put in the file.
- While the file is loading, if it fails to load, or if the game has no file, the synthesised `score` plays (and a game with neither is silent apart from effects).
- **The game producer owns the rights to a supplied file.** The engine ships only original synthesised music.
- Files are served from the game's `public/` folder (the production server supports byte ranges, which browsers need to loop and seek).

### Future mode example

`osmanli-kusatmasi` would add its own teams, actions, scoring, scene, and assets. It should reuse core player, team, event, round, state, and operator services. It is not implemented in the MVP.

## 9. Network and reconnect behavior

- Socket.IO is the browser transport for game-state snapshots, state updates, presentation events, and operator controls.
- Validate all client-to-server commands. The browser is not trusted to set scores or declare a winner.
- On initial connection and reconnect, send a fresh authoritative snapshot.
- Treat transient animation events as best-effort; if one is missed during a disconnect, the game state must still be correct.
- Do not introduce persistent event replay for the MVP. Add it only if measured reliability needs justify persistence.
- Keep operator events logically separate from viewer events and authorize operator actions.

## 10. Frontend views

### Broadcast view
- Dedicated route for capture by a streaming tool, designed to work in a plain browser window. An OBS Browser Source is not required, and nothing in the view depends on one.
- Designed for a vertical 9:16 composition.
- No operator controls or debug panels.
- Receives state from the backend and renders the current mode.
- Remains usable if the event provider disconnects; display a clear status rather than crashing.

### Operator view
- Separate route from the broadcast output.
- Displays connection status, active game mode, phase, timer, player count, team scores, and recent events.
- Provides automatic/manual controls and the local event simulator.
- Any public deployment must protect operator controls; local development should bind the operator interface to localhost where practical.

## 11. 3D renderer and performance

### Renderer responsibilities
- Load the active game mode's scene and GLB assets.
- Render camera, environment, lights, materials, characters, and effects.
- Map presentation events/state to animation states.
- Keep the broadcast composition legible at phone size.
- Never calculate authoritative game rules or scores.

### Participant rendering strategy
- Backend tracks all 100–200 participants in the test target.
- Start with a configurable cap of approximately 24 individually visible characters.
- Represent additional participants through crowd density, team counters, or other lightweight visual indicators.
- Use shared assets, reuse loaded models, and profile animation/rendering cost.
- Use instancing for suitable repeated geometry; do not force instancing where skinned animation makes it inappropriate.
- Avoid complex real-time physics and pathfinding in the MVP.

The visible-avatar cap is a presentation decision, not a limit on participation or scoring.

## 12. Visual direction and asset pipeline

### Initial art direction

**Stylized low-poly, toy-like 3D diorama.**
- Playful, colorful, warm, and slightly exaggerated.
- Strong silhouettes and readable poses.
- Simple geometry and clean materials.
- Fixed elevated three-quarter / isometric-style camera.
- The environment should feel like a miniature Turkish neighborhood wedding courtyard, not a photorealistic reconstruction.
- Characters should be expressive and visually distinct at small livestream sizes.
- Avoid tiny decorative detail, noisy textures, realistic violence, and inconsistent asset-pack styles.

### Reference concept prompt

Use this as an art-direction reference when creating concept art or asset briefs. It is not a requirement to use a specific image-generation product.

> Original stylized low-poly 3D game diorama of a joyful Turkish neighborhood wedding courtyard, viewed from a fixed elevated three-quarter isometric camera. Playful toy-like human characters with simple expressive faces and readable silhouettes, two festive groups preparing to dance, subtle davul-zurna musicians, colorful bunting and warm courtyard lighting. Clean geometry, cohesive materials, rich but controlled colors, soft shadows, polished indie-game art direction, composition designed for a vertical 9:16 livestream game screen. No text, no logos, no photorealism, no copyrighted characters.

### Asset workflow
1. Create a visual concept/reference for the environment and character family.
2. Generate or obtain draft assets where useful; check usage rights and provenance.
3. Refine topology, scale, origins, materials, rigs, and animation in Blender.
4. Keep editable `.blend` source files.
5. Export optimized `.glb` runtime assets.
6. Validate model loading, materials, rigging, animation, file size, and visual consistency in the browser.
7. Keep a simple asset manifest so a game mode can declare which assets it needs.

AI output is not automatically production-ready. Validate mesh quality, UVs, texture sizes, rig/skeleton consistency, animation compatibility, and file size in Blender and in the browser.

### Keep visual style replaceable

Do not embed the art direction in core game services. Keep the following in mode-level presentation configuration/assets:
- Color palette and material choices.
- Lighting and environment settings.
- Camera framing and composition.
- Character models, costumes, and animation clips.
- Props and environment models.
- UI theme tokens where practical.

Changing from this low-poly direction to a more detailed cartoon style should primarily require replacing/refining assets and presentation configuration, not rewriting the event model or game rules. If the rendering technology ever needs to change, keep it behind the frontend game-renderer boundary.

## 13. Security, abuse prevention, and privacy

- Treat comments, usernames, provider payloads, and browser commands as untrusted.
- Enforce comment length limits and safe text rendering.
- Apply per-user cooldowns and global rate limits.
- Deduplicate events where possible.
- Keep the event queue bounded.
- Validate operator actions and never expose them as viewer commands.
- Do not persist personal viewer data in the MVP.
- Store credentials in environment variables; do not commit secrets.
- No payment processing or external financial actions are part of this project.
- The TikTok LIVE integration (Product Phase 2) must be reviewed against current platform terms, policies, and access requirements before any connector is built or used.
- With a real provider, comments and usernames come from real people: the existing untrusted-input handling (validation, length limits, safe rendering, rate limits, operator remove/ignore) applies unchanged, and raw platform payloads are not persisted.

## 14. Testing strategy

### Unit tests
- Comment normalization and exact-command parsing.
- Team joining and team-switch rules.
- Cooldown and rate-limit behavior.
- Score/energy calculations.
- Round state machine and timer transitions.
- Gift mapping and the rule that gifts do not affect MVP winner scores.
- Duplicate-event handling.

### Integration tests
- Simulator → normalized event → action → authoritative state update.
- Operator command → validated state transition.
- Socket connection → initial snapshot → subsequent updates.
- Disconnect/reconnect → fresh snapshot.

### Provider tests
- Every provider's output must validate against the normalized event schema, and the engine must behave identically for the same normalized events no matter which provider produced them.
- The simulator's fault injection (duplicates, malformed payloads, rapid repeats, disconnects) is the reference for the failure cases a real provider must also survive.
- For Product Phase 2: a real provider is tested against recorded and sanitized payload fixtures replayed through its normalizer (no network, runs in CI), plus a manual validation session against real TikTok LIVE, which is not an automated test.
- The simulator's tests must keep passing with the TikTok provider absent.

### Browser / visual tests
- Broadcast view loads in 9:16 layout.
- Operator view remains separate from broadcast output.
- Main game information is legible.
- 3D assets load and expected animations can be triggered.

### Load/performance tests
- Simulate 100–200 participant records.
- Generate normal and burst comment traffic.
- Record queue behavior, memory use, processing latency, browser FPS, and dropped/aggregated visual updates.
- Tune the visible-avatar cap and update batching using measured results.

## 15. Build and runtime workflow

- Use a pnpm workspace with `apps/web`, `apps/server`, and `packages/contracts` unless planning identifies a simpler setup that preserves shared typing.
- Provide root scripts for development, tests, type checking, linting, and build.
- Provide a single documented command to run the local simulator, backend, and frontend during development.
- Keep environment configuration documented in `.env.example`; never include real secrets.
- Do not add deployment infrastructure for the MVP. First prove the local game and capture of the broadcast view in a browser window.

## 16. Official and technical references

Use these as starting points and verify current documentation when implementing:

- Claude Code `CLAUDE.md` guidance: https://support.claude.com/en/articles/14553240-give-claude-context-claude-md-and-better-prompts
- Claude Code Plan Mode / workflow reference: https://support.claude.com/en/articles/14553413-claude-code-cheatsheet
- Vite guide: https://vite.dev/guide/
- React Three Fiber introduction: https://r3f.docs.pmnd.rs/getting-started/introduction
- Socket.IO delivery guarantees: https://socket.io/docs/v4/delivery-guarantees/
- Blender glTF / GLB manual: https://docs.blender.org/manual/en/dev/addons/scene_gltf2.html
- TikTok LIVE Connector (unofficial; experimental only): https://ttlc.docs.isaackogan.com/
- TikTok LIVE Interactive Games partner registration: https://cp-game.tiktok.com/interactive-game-registration
- TikTok Developer Guidelines: https://developers.tiktok.com/docs/en/our-guidelines-developer-guidelines

## 17. Architecture change policy

If a dependency, renderer, runtime, event transport, or persistence decision needs to change:
1. Explain the concrete requirement or measured problem.
2. Compare at least one alternative.
3. Describe migration and impact on game modes/assets/tests.
4. Record the decision and update this document.
5. Obtain user approval before making a breaking change.
