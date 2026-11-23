# Building your own game

This engine runs livestream games. A game is two small modules that plug into it: **rules** on the server and a **presentation** in the web app. Everything else (viewers, comments, gifts, rate limits, rounds, scores, the operator panel, the simulator, sound, effects, name tags, TikTok) is the engine's job.

The two shipped games are complete worked examples. Read them next to this guide:

| | Mahalle Halayı | Takı Takma Töreni |
|---|---|---|
| Server rules | `apps/server/src/game-modes/mahalle-halayi/` | `apps/server/src/game-modes/taki-takma/` |
| Web presentation | `apps/web/src/game-modes/mahalle-halayi/` | `apps/web/src/game-modes/taki-takma/` |
| Assets (Blender) | `assets/game-modes/mahalle-halayi/` | `assets/game-modes/taki-takma/` |

Takı Takma Töreni is the better template: it was built after the engine learned about several games, so it shows the full path, including per-game gift scoring, a queue instead of dance lines, guests who walk around, and its own sound.

## What the engine gives you, and what you provide

```text
viewer comment / gift
   → provider (simulator or TikTok) normalizes it
   → engine: validate → dedupe → rate limit → queue
   → YOUR rules: what does this command or gift do?
   → engine applies it: team joins, score, round flow, presentation events
   → Socket.IO → broadcast view → YOUR scene draws it, YOUR sound design plays it
```

- **You never touch providers, sockets, scoring storage or round timing.** You answer two questions in plain functions: what does this word do, and what does this gift do.
- **Rules are server-side and authoritative.** The browser only draws. Nothing a scene does can change a score.
- **The core and the renderer know no game.** A lint rule and a test (`engine-boundary.test.ts`) fail the build if shared code mentions a game's words. Games depend on the engine, never the other way round.

## Step 1: Pick an id and add it to the contracts

`packages/contracts/src/game/game.ts`:

```ts
export const MODE_IDS = ['mahalle-halayi', 'taki-takma', 'my-game'] as const;
```

`MODE_IDS` is what `GAME=<id>`, the operator's game picker and the network schema accept.

## Step 2: Write the server rules

Create `apps/server/src/game-modes/my-game/config.ts` and `rules.ts`. A mode is a `GameMode` (`apps/server/src/core/mode.ts`):

```ts
interface GameMode {
  id: ModeId;
  config: GameModeConfig;
  handleCommand(ctx: ModeContext, action: CommandAction): ModeEffect[];
  handleGift(ctx: ModeContext, action: GiftAction): GiftEffect[];
}
```

**Config** is plain data:

| Field | Meaning |
|---|---|
| `teams` | The sides: `{ id, name }`. |
| `timings` | `countdownMs`, `roundMs`, `resultsMs`, `autoNext`. |
| `commands` | The viewer words, each with `droppable` (purely visual commands may be shed when the queue overflows; joins and scoring never are). The engine normalizes words Turkish-aware and matches whole comments only. |
| `cooldowns` | Named durations in ms, used through `ctx.tryCooldown(key)` (per player) and `ctx.tryGlobalCooldown(key)` (session-wide). |
| `celebrations` | Effects the operator may trigger by hand. |
| `giftsMayScore` | Capability, default **off**. Turn it on only if gifts should add team points in this game. |
| `chat` | Capability, default **off**. Turn it on to show moderated conversational comments as speech bubbles (`maxLength`, `cooldownMs`, extra `blocklist`, `defaultEnabled`). |

**Rules** return effects (`ModeEffect`): `join_team`, `score` (points for the sender's team) and `present` (a presentation event for the screen). Look at `taki-takma/rules.ts`; the whole file is about 60 lines. Habits worth copying:

- Index lookups with a `Map`, never a plain object: words and gift keys come from strangers (`constructor`, `__proto__`).
- Normalize your own command words with `normalizeComment` when you build the table.
- Use cooldowns to keep spam from dominating. In a scoring round tie the animation and the point to the same cooldown.
- `ctx.isScoring` is true only in an unpaused active round. Animations can play at other times; points should not.
- Return `present` events for what the viewer should see: `player_action` (with your own animation word), `celebration` (with your own effect word), `hint`.

**Gifts and scoring.** By default the engine drops any `score` a gift handler returns. A game that sets `giftsMayScore: true` can score from gifts, and even then the engine applies the points only for a registered player on a team during an actively scoring round. This is a product decision, so make it per game and write it down (`REQUIREMENTS.md`). Real platform gift values never become winner points on their own; map them in your game's gift table.

Register the mode in `apps/server/src/game-modes/registry.ts`:

```ts
const MODES: Record<ModeId, () => GameMode> = {
  'mahalle-halayi': createMahalleHalayiMode,
  'taki-takma': createTakiTakmaMode,
  'my-game': createMyGameMode,
};
```

### Server tests

Test the rules with a fake `ModeContext` (see `taki-takma/rules.test.ts`) and the whole path with `createTestEngine({ mode })` from `apps/server/test/helpers.ts`: join, scoring, cooldowns, gift bonus only for joined players in an active round, hostile words. The existing suites also run your mode through the pipeline's duplicate, rate-limit and queue behaviour.

## Step 3: Teach the simulator your words

The Local Simulator plays synthetic viewers so you can run a full game with no audience. Give it your game's words in `apps/server/src/providers/simulator/scenarios.ts`:

```ts
export const MY_VOCABULARY: Vocabulary = {
  joinWords: ['red', 'blue'],
  actions: [{ value: 'cheer', weight: 70 }, { value: 'wave', weight: 30 }],
  chatter: ['hello', 'good luck'],
  gifts: ['rose', 'gg', 'big_celebration'],
};
```

and return it from `vocabularyFor(modeId)`. The simulator is a provider, so this wiring lives next to it, not in your game.

## Step 4: Write the web presentation

Create `apps/web/src/game-modes/my-game/` with at least `presentation.ts` and `Scene.tsx`, and register it in `apps/web/src/game-modes/registry.ts`. A presentation is a `ModePresentation` (`apps/web/src/game-modes/types.ts`):

| Field | Meaning |
|---|---|
| `id`, `title` | Must match the server's id; the title is shown in the operator's picker. |
| `camera` | A fixed camera: position, look-at, field of view. The stream is 9:16, so frame for portrait and leave room under the score boxes at the top and the command chips at the bottom. |
| `Scene` | Your 3D scene (below). |
| `tagAnchors` | Where each avatar's name tag goes: `computeTagAnchors(camera, formation, slotCapacities(teamIds, cap))`. |
| `simulatorDefaultWord` | The word the operator's simulator panel preselects. |
| `soundDesign` | Your music and effects (Step 6). |
| `teamColors` | Accent colour per team id. |
| `text` | Every word the HUD shows: phases, round, winner, draw, command chips, joined line, status messages. Your language, your wording. |

### The scene

`Scene` receives `SceneProps`: the `roster`, team standings (`teams`, with `score`), a `cues` bus, the name-tag board `tags`, the sound engine, the phase, and the seconds left. Use the shared building blocks; the two shipped scenes use the same set:

- **`SlotsStore`** decides which players get an individually animated avatar (a cap such as 24) and keeps who-is-where. Everyone else is drawn by the instanced **`Crowd`** (two draw calls per team). The server still counts everyone. Pass `arrangement: 'line'` (both ends first, two leaders) or `'queue'` (fill from the front).
- **`Formation`** is your geometry: where slot *i* of a team stands and faces, and where the crowd stands.
- **`AnimationRules`** maps your `player_action` words to the renderer's animation kinds (`flourish`, `jump`, `spin`, `wiggle`, `hop`, `special`) and their durations. `AvatarModels` maps each kind to a clip name in your model.
- **`EffectDirector` + `EffectRecipe`** turn `celebration` cues into confetti, rings and avatar reactions, with limits on how many may play at once. A recipe is data.
- **`useClipPlayer`** plays a rigged GLB's clips on an avatar (beat-locked loops, one-shot accents, cross-fades).
- **`BeatClock`**, **`EnergyMeter`** give the shared tempo and crowd energy; **`SoundDirector`** plays your sound design.
- **Name tags and chat bubbles** are drawn for you from `tags`; call `tags.setOccupants(...)` when slots change, `tags.emphasize(id)` on activity and `tags.say(id, text)` for a `chat` cue (see either `Scene.tsx`).
- Wrap model loading in `Boundary` + `Suspense` with a primitive fallback (`Avatars`), so a missing file never blanks the stream.

If your game needs movement the shared pieces do not offer, put it in your own folder. Takı's guests walk to the couple in `Guests.tsx`, driven by pure, tested functions in `trips.ts`.

### Web tests

Unit-test your pure logic (movement, formations, thresholds), the sound design (`sound-design.test.ts`) and, if you ship models, that they meet the contract (`assets.test.ts`).

## Step 5: Assets

The art style is a replaceable choice, not a dependency of the rules. The shipped games use low-poly, flat-shaded, vertex-coloured toy models: one skinned mesh per character on a shared 12-bone rig, no textures, built by Blender scripts so they are reproducible.

- Put scripts in `assets/game-modes/my-game/scripts/`; they can reuse `assets/game-modes/mahalle-halayi/scripts/assetlib.py` and `build_character.py` (see `taki-takma/scripts/build_taki_characters.py`: it adds new looks and clips and writes to its own folder).
- Output GLBs to `apps/web/public/game-modes/my-game/models/`.
- List the files, the exact clip names and the budgets in an `assets.manifest.ts`, and validate them in `assets.test.ts` (triangle budget, bone count, clips). `pnpm assets:build` rebuilds everything; add your script to `scripts/build-assets.mjs`.
- Rebuilding exports different bytes even from unchanged scripts. Commit only the assets you really changed.
- **Rights.** AI-generated meshes or images are drafts until quality, rigging, animation and usage rights are checked. Record third-party material in `THIRD_PARTY_NOTICES.md`.

You do not need Blender to start: the primitive fallback (`Avatars`, `Crowd`) draws a complete game from coloured shapes, which is a good way to prove your rules first.

## Step 6: Sound

A `SoundDesign` (`apps/web/src/game-renderer/audio/types.ts`) is data plus three small functions:

- `score`: optional built-in music as pattern strings (drums, claps, shaker, bass, lead phrases, a scale). Nothing is sampled, so there is nothing to license.
- `track`: optional music file (`url`, optional `bpm` so dancers lock to it). **The game producer owns the rights to a file.** Mark it in `.gitignore` if it is not yours to publish.
- `music`: what plays in each phase (`off`, `calm`, `build`, `full`).
- `cue(cue)`: which of the engine's effect sounds (`pop`, `clap`, `whoosh`, `sparkle`, `chime`, `tick`, `go`, `fanfare`, `roll`, `cheer`) a cue triggers; `phaseEntered`, `countdownTick`.

Validate the score with `validateScore` in a test.

## Step 7: Run it and check

```bash
GAME=my-game pnpm dev      # or start the default game and switch in the operator's Game panel
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e              # add a spec like e2e/games.spec.ts that plays your game
```

- Add your game's words to `GAME_WORDS` in `apps/web/src/game-renderer/engine-boundary.test.ts`, so shared code can never start depending on it.
- Measure the real scene: `pnpm perf:browser` (see `e2e/perf/taki-perf.spec.ts` for a game-specific run). The target is 100-200 participants at about 60 FPS with under 150 draw calls on the stream machine.
- Look at it at 540x960 and 1080x1920. Text and tags must stay readable on a phone.

## Rules of the road

1. **Free to play.** Every viewer must be able to take part without gifts. Gifts add spectacle; any gift scoring is an explicit, documented decision per game.
2. **Untrusted input.** Comments, usernames and gift keys are strangers' data: length-limit, validate, look up with maps, and draw only as text.
3. **Keep the boundaries.** Rules never import providers; the core and renderer never import games. The lint rules enforce it.
4. **No new infrastructure for a game.** No database, accounts or runtime plugin loading; modes are registered statically.
5. **Do not scaffold platform code in a game.** A game talks to the engine's normalized events only.

## Checklist for a new game

- [ ] Id in `MODE_IDS`, mode in the server registry, presentation in the web registry
- [ ] Config and rules, with `giftsMayScore` and `chat` decided on purpose
- [ ] Rules tests (fake context) and engine tests (join, score, cooldowns, hostile input)
- [ ] Simulator vocabulary
- [ ] Scene, formation, animation rules, effect recipes, tag anchors, team colours, text
- [ ] Sound design and its test
- [ ] Assets with a manifest and a validation test (or the primitive fallback only)
- [ ] An e2e test that plays a round
- [ ] Game words added to the engine-boundary test
- [ ] A performance run and a look at both stream sizes
- [ ] `REQUIREMENTS.md` (game rules and decisions), `PLAN.md`, and an asset README
