# TikTok Live Game Engine — Product Requirements

**Document status:** Baseline for MVP planning, including the planned post-MVP TikTok LIVE milestone  
**Product type:** Personal side project  
**First game mode:** Mahalle Halayı  
**Future example mode:** Osmanlı Kuşatması  
**Roadmap:** Product Phase 1 — Standalone MVP (Local Simulator) → Product Phase 2 — TikTok LIVE integration (feasibility first)

> **Terminology.** "Product Phase 1/2" are product milestones. Each has its own implementation steps in `PLAN.md`, numbered `Step 1.x` (Product Phase 1) and `Step 2.x` (Product Phase 2).

## 1. Product vision

Build a modular, real-time 3D game experience for livestreams. Viewers become participants through chat commands and livestream gift events. A single reusable engine should support multiple themed game modes without rebuilding player management, team management, event handling, scoring, round control, operator controls, or the livestream presentation layer for each game.

**The purpose of this project is to run these games on real livestream platforms, starting with TikTok LIVE.** Connecting to TikTok LIVE is the product's starting point and goal; everything in Product Phase 1 exists to build a solid, testable foundation for it. The Local Simulator is the MVP event source for development, testing, and demonstrations. It is a permanent and independently useful tool, but it is not the final event source.

TikTok LIVE integration is a **planned product goal**, delivered right after the standalone MVP is complete. It is deliberately not part of the MVP, and it is not guaranteed to be technically, legally, or commercially possible: it starts with feasibility research (see Product Phase 2 below).

### Product roadmap

**Product Phase 1 — Standalone MVP (current).**
- Build the reusable engine and the first game mode (Mahalle Halayı).
- Use the Local Simulator as the only event source.
- Establish the provider-independent event pipeline: normalized events, validation, deduplication, rate limits, action mapping, server-authoritative state.
- Keep the architecture simple; add no abstraction that Product Phase 1 does not need.
- Deliver a fully functional standalone experience: simulator, operator panel, and a capture-ready broadcast view.

**Product Phase 2 — TikTok LIVE integration (planned, begins only after Product Phase 1 is accepted and approved).**
- Prerequisite: the product owner creates a dedicated TikTok account for this project and checks what it takes for that account to go LIVE (eligibility rules can limit or delay this, so it is worth doing early).
- Start with feasibility research: official and unofficial integration approaches, platform policies and terms, access and approval requirements, reliability, and technical limitations.
- Decide whether and how to proceed based on the findings (see §9). A "not feasible" or "not acceptable" outcome is a valid result and must be reported honestly.
- If approved: select an approach, ingest comments and supported gift events, normalize them into the existing event pipeline, handle reconnects, duplicate events, errors, and connection status, and validate against a real TikTok LIVE session, subject to access and platform limitations.

Product Phase 2 must not require rewriting the game rules, scoring, round flow, operator panel, or broadcast view built in Product Phase 1.

### Product promise

**One engine, multiple game worlds. Every viewer can play; gifts add spectacle, not guaranteed victory.**

## 2. Target users

### Livestream viewer / player
A person watching the livestream who wants to join quickly, understand what is happening, and influence the game through simple actions.

Needs:
- Join a team with a short, understandable comment.
- See that their participation has an effect.
- Understand team progress and the round result.
- Enjoy the game without sending a gift.

### Stream operator
The person running the broadcast and supervising the game.

Needs:
- Start, pause, resume, and end a game or round.
- Trigger predefined events when useful.
- See player counts, team scores, and recent events.
- Override automatic behavior when something goes wrong.
- Test the game without a live TikTok connection (always), and later run it against a real TikTok LIVE session (Product Phase 2).
- See at a glance whether the event source is connected.

## 3. Product principles

1. **Free-first participation:** joining, basic actions, and meaningful team contribution are free.
2. **Gifts add spectacle:** gifts primarily trigger visual celebrations and special animations. They do not directly determine the winner in the MVP.
3. **Fast comprehension:** a viewer should understand the current teams, available commands, and score quickly.
4. **Short rounds:** rounds are short enough for viewers to join, participate, and see a result during a livestream.
5. **Modular game modes:** each mode owns its theme, rules, commands, scoring configuration, and presentation assets; shared capabilities stay in the core engine.
6. **Operator safety net:** automatic play is the default, but the operator can intervene.
7. **Replaceable integrations:** the game engine consumes normalized events, not platform-specific payloads. The Local Simulator (Product Phase 1) and the planned TikTok LIVE provider (Product Phase 2) feed the same pipeline, and the simulator stays fully usable without any platform connection.
8. **Playful and inclusive themes:** historical or cultural settings should remain fictionalized/arcade-like and avoid targeting real-world national, ethnic, or religious groups.

## 4. MVP scope (Product Phase 1)

### In scope
- One playable game mode: Mahalle Halayı.
- One stylized 3D wedding courtyard environment.
- **Living halay (added after the first playtest):** the Gelin and Damat teams stay face to face in two lines, but the whole scene moves on a shared beat: both lines continuously dance a sideways halay step and travel up and down the screen together, and group energy speeds up and intensifies the dance. Individual comments add short flourishes on top of the shared dance, not the only movement.
- **Bride and groom:** a bride and a groom character in the centre of the dance floor dance their own two-person halay.
- **Halaybaşı (added 2026-11-23):** each team's line is led by two halaybaşı, one at each end (a halay has two ends), who are the team's two most recently active players (re-chosen with a delay so it does not flicker). They stand at the ends of the line, step slightly out in front, hold the neighbour's hand with one hand and wave a team-coloured napkin (mendil) with the other, and flourish with it when they comment `halay` or `oyna`. A gift may trigger a cosmetic mendil flourish. Being halaybaşı gives **no scoring bonus**; gifts never buy the role.
- **Traditional wedding musicians** on the stage (davul and zurna, in traditional dress) playing instruments that are part of their models.
- **Sound (added to Product Phase 1):** music and sound effects, with mute/volume control for the operator (held by the server). The engine ships original synthesised music (a brisk halay whose tempo and intensity follow the group energy) and effects for joins, jumps, gifts, the countdown, round start and results. **A game may instead supply its own music file** (decided 2026-11-23): the engine streams it, fades it with the game phase, and can lock the dancers' beat to it when the file states its tempo. **Rights to a supplied file are the responsibility of the game producer** (and the platform's own music rules apply once it is streamed publicly); while a file is in use the engine's built-in effects are silent (they would break the music) unless the game opts in; the engine's built-in music and effects remain the fallback when a file is absent or fails to load. Mahalle Halayı's default music is `halay.mp3`, supplied by the producer and kept out of the repository by default (see `.gitignore`).
- Two sides (the engine calls them teams): Gelin Tarafı and Damat Tarafı.
- **Gifts are cosmetic by default; a game may opt in to scoring (decided 2026-11-23).** The engine enforces a per-game capability (`giftsMayScore`, off unless the game declares it) and applies a gift score only for a registered player on a team in an actively scoring round. Mahalle Halayı stays cosmetic-only; Takı Takma Töreni opts in. Before a public TikTok LIVE with gift scoring, TikTok's LIVE Monetization Guidelines and Creator Code of Conduct must be read (still open).
- Player registration from simulated viewer events.
- **Viewers' comments on screen (added 2026-11-23, Mahalle Halayı opts in):** short conversational comments from players who have joined a side appear as speech bubbles above their character. They are moderated (links, @mentions, phone numbers and a blocked-word list are refused; shouting and repeated letters are calmed; long text is shortened), rate limited per player, on by default, with an operator on/off switch and per-player hiding through Ignore. Viewers who have not joined are not shown. Moderation is best effort, so the operator remains the safety net on a live stream.
- Comment-command simulation.
- Gift-event simulation.
- Basic player and team state.
- Team score/energy and round results.
- Configurable short rounds (initial default: 3 minutes).
- Hybrid game control: automatic flow plus operator overrides.
- A simple operator panel with a local event simulator.
- A dedicated vertical (9:16) broadcast view that works in a normal browser window and can be captured by any streaming tool through window capture. OBS is not required.
- A repeatable test that simulates 100–200 participant records.

### Explicitly out of scope for the first MVP
- Real TikTok LIVE integration. This is a **planned Product Phase 2 milestone**, not an abandoned or optional idea; it is excluded here only so that the standalone game is proven first (see §9).
- Multiple playable game modes.
- Public accounts, sign-in, or persistent player profiles.
- Database and cloud deployment.
- Payment processing or real-money transactions.
- A marketplace for game modes or assets.
- Complex physics, pathfinding, or open-world movement.
- A large inventory/economy system.
- Native mobile applications.

## 5. First game mode: Mahalle Halayı

### Concept

A playful Turkish wedding celebration. Viewers join either the bride's side or the groom's side. Their on-screen characters join the celebration and perform simple dance actions. Teams compete on a shared participation/energy score.

### Round flow

1. **Lobby:** the game announces that a new round is about to start. Viewers can join a team.
2. **Round start:** the game starts automatically after a short countdown, or the operator can start it manually.
3. **Participation:** viewers use supported commands to trigger character actions and contribute to their team's energy.
4. **Gift moments:** simulated gift events trigger special visual effects or group celebrations. They do not directly add winning points in the MVP.
5. **Round end:** the timer expires or the operator ends the round.
6. **Results:** the game announces the winning team (or a draw), shows the score, and returns to the lobby for the next round.

### Teams
- `gelin` → Gelin Tarafı
- `damat` → Damat Tarafı

A player can select a team during the lobby. During an active round, team switching is disabled by default to discourage score manipulation. A late viewer may join an available team during a round, but their participation starts from the moment they join. The operator may correct a team assignment.

### Initial comment commands

Commands are matched as complete comments after trimming whitespace and applying consistent Turkish-aware normalization. The parser must not trigger when a command word merely appears inside a longer sentence.

| Comment | Behavior | Score impact |
|---|---|---|
| `gelin` | Join Gelin Tarafı | No direct points |
| `damat` | Join Damat Tarafı | No direct points |
| `halay` | Trigger a halay action | Adds a small, cooldown-limited team energy contribution |
| `zıpla` | Trigger a jump/dance variation | Visual action only in MVP |
| `oyna` | Trigger a random approved dance animation | Visual action only in MVP |

The command list, cooldowns, and scoring values must be configurable per game mode. Use an initial per-player cooldown for score-bearing actions; the exact value should be tuned during playtesting. Invalid, repeated, or rate-limited comments must not crash or stall the game.

### Scoring and fairness
- Team energy is earned through valid free participation actions.
- Apply per-player cooldowns so comment spam does not dominate scoring.
- Gift events do not add team score in the MVP.
- The winner is determined by team energy at round end; equal scores produce a draw.
- Scoring values are game-mode configuration, not hard-coded into the shared event provider.

### Initial simulated gift actions

Use simulator-only gift identifiers/names. Do not assume TikTok gift names, prices, coin values, or IDs are permanent.

| Simulated gift | Visual response |
|---|---|
| Rose | A short special dance animation for the sender's character |
| GG | A short group celebration |
| Big Celebration | A davul-zurna / wedding-wide celebration effect |

Gift actions are cosmetic in the MVP. They must not provide exclusive access to basic gameplay, guarantee victory, or pressure viewers to spend. Do not create fake rewards or imply that a gift is required to participate.

## 6. Hybrid control and operator panel

The game supports:

### Automatic control
- Start a round after the configured lobby countdown.
- Run the round timer.
- End the round and calculate the result.
- Show the result and return to the lobby.
- Optionally start the next round after a configurable intermission.

### Operator overrides
- Start / stop the game.
- Pause / resume.
- Start / end the current round.
- Trigger a predefined game event or celebration.
- Reset the current round's score (with confirmation in the UI).
- Add simulated viewers and send simulated comments/gifts.
- View recent events, player count, team membership, and scores.

Operator actions are validated by the server. The operator view is separate from the broadcast view.

## 7. Livestream presentation

### Broadcast view
- Dedicated, clean 9:16 layout, designed to be shown in a plain browser window and captured by a streaming tool. It uses no tool-specific features.
- **Decided: OBS is not part of this project** in Product Phase 1 or 2 unless TikTok's access route turns out to require it. Which tool gets the video onto TikTok is a Product Phase 2 research question.
- The 3D wedding courtyard is the main visual area.
- Team names and scores are always legible.
- Round timer and phase are easy to understand.
- Recent joiners / notable actions may be shown without covering the play area.
- Do not rely on tiny text that would be unreadable on a phone.

### Operator view
- Separate route/view from the broadcast output.
- Contains game controls, simulator controls, status, and event feed.
- Operator-only controls must never appear in the broadcast capture.

### Character representation
All participants must be tracked by the game server. The renderer does not need to display every participant as a unique, independently animated high-detail character. Start with a configurable visible-character cap (initial design target: approximately 24 visible avatars) and represent additional participants through crowd density, team counters, or compact indicators. Validate and tune this after profiling. The cap must not remove a participant's ability to join or contribute to the game.

## 8. Player capacity and performance targets

- Support 100–200 simulated concurrent participant records in the backend.
- Test normal comment activity and artificial event bursts.
- Keep the game responsive while the simulator is generating events.
- Aim for a stable 30 FPS minimum on the agreed development/streaming machine at the target broadcast resolution; profile before making higher guarantees.
- Measure event-to-visible-feedback latency. Use a provisional local target of p95 below 500 ms under the 200-participant simulation, then adjust based on measured results and hardware.
- Do not solve scale by rendering one high-detail character per viewer.

These are acceptance targets to measure, not claims that performance is already achieved.

## 9. Event sources and integration approach

The engine receives events only through provider adapters that emit normalized events (see `ARCHITECTURE.md`). There are two planned providers:

| Provider | Product phase | Purpose |
|---|---|---|
| Local Simulator | Product Phase 1 (MVP) | Development, automated and load testing, demonstrations. Permanent; works with no network or platform account. |
| TikTok LIVE | Product Phase 2 (planned, feasibility first) | Real comments and supported gifts from a real livestream. |

### MVP provider: Local Simulator

The simulator is the only event source in Product Phase 1. It remains available after Product Phase 2 and must keep working independently of any TikTok integration, code, credentials, or network access.

The simulator must be able to:
- Create synthetic viewers.
- Join viewers to either team.
- Send supported comments.
- Send simulated gifts.
- Generate a configurable number of participants and event bursts.
- Reproduce edge cases such as duplicate events, malformed comments, rapid repeated commands, and provider disconnects.

### Planned provider (Product Phase 2): TikTok LIVE

Connecting to real TikTok LIVE sessions is a planned product goal. It is excluded from the MVP and **must begin with feasibility research, not implementation**. Nothing in this document assumes that a general public LIVE comments-and-gifts API exists, that any approach is permitted by platform terms, or that access can be obtained.

**Step 1 — Feasibility research (no connector code).** Produce a written findings document covering:
- Official options: TikTok developer and partner programs (for example the LIVE interactive-games partner registration), their eligibility, approval process, permitted event types, and terms.
- Unofficial options: third-party connectors, what they rely on, their maintenance and breakage risk, and whether using them is compatible with the platform's terms and policies.
- Platform policies and terms that apply to reading LIVE comments and gifts and to showing viewer data on stream.
- Access requirements (accounts, approvals, credentials) and who must obtain them.
- Technical characteristics: available event types, event identifiers, gift semantics (including streaks and combos), latency, rate limits, reconnection behavior, and stability.
- A recommendation with the trade-offs, including the option **not to proceed**.

**Step 2 — Decision gate.** The product owner approves the chosen approach (or stops Product Phase 2) before any connector is built. An unofficial connector, if chosen at all, is experimental and replaceable, never presented as a guaranteed or officially supported API.

**Step 3 — Implementation (only after approval).** The provider must:
- Ingest comment events and the gift events the chosen approach supports.
- Map provider gift identifiers to the semantic gift keys the game modes use, without hard-coding real prices or coin values into the engine.
- Normalize everything into the existing provider-independent event contract and pass it through the same pipeline (validation, deduplication, rate limits) as simulated events.
- Handle reconnection, duplicate and out-of-order events, malformed payloads, and errors without crashing or stalling the game.
- Report connection status to the engine so the operator and the broadcast view can show it (the broadcast view already degrades gracefully when the provider is down).
- Keep credentials and session secrets in environment configuration, never in source control.

**Step 4 — Validation.** Validate with a real TikTok LIVE session, subject to access and platform limitations. If a real session cannot be obtained, say so and document what was verified with recorded or simulated fixtures instead.

**Constraints that continue to apply in Product Phase 2:**
- Gifts remain cosmetic unless the product owner explicitly approves a change to gift scoring; real gift values must never silently become winner points.
- Free viewers keep meaningful participation.
- The engine, game modes, operator panel, and broadcast view stay provider-independent.
- The Local Simulator remains usable on its own.

**Decisions already made for Product Phase 2:**
- The first real session uses a **dedicated TikTok account created by the product owner for this project**. The product owner owns the account and any approvals it needs. Whether and when that account is allowed to go LIVE is part of the feasibility research (platform eligibility rules may apply).
- **One event provider is active per run.** The simulator and TikTok LIVE are not mixed in the same session: a real stream shows only real viewers, so simulated players can never be mistaken for, or counted alongside, real participants. The simulator remains the provider for offline development, testing, and demonstrations. During a live session the operator can already trigger celebrations and manage real players with the operator panel, so injecting fake events is not needed.

**Definition of success for Product Phase 2 (decided):** a **public TikTok LIVE stream on which real viewers can join and take part in the game through its normal mechanics**: team-joining and action comments, and supported gifts triggering their cosmetic celebrations, with scores, rounds, and results computed by the server as in the MVP. A private test session is a stepping stone, not the goal. Success is always subject to what TikTok's access rules, eligibility requirements, and terms allow; if the research shows a public stream is not permitted or not achievable, that is reported as the outcome rather than worked around.

**Open product question for Product Phase 2** (to be answered during or right after feasibility research; not blocking the MVP):
- Is the target one specific access route, or "the best route the feasibility study finds"?

## 10. Privacy, safety, and moderation

- Keep participant data in memory for the active local session in the MVP.
- Store only the minimum identifiers needed to deduplicate events and maintain a live player record.
- Do not create persistent viewer profiles.
- Sanitize and length-limit usernames and comments before display.
- Provide operator ability to remove or ignore disruptive simulated participants; the same capability must work for real participants in Product Phase 2.
- Product Phase 2 handles real viewer identities and comments: keep them in memory for the active session, do not add persistent viewer profiles, avoid logging raw platform payloads beyond what debugging needs, and follow the platform's terms for how viewer data may be used and displayed.
- Apply per-user and global event rate limits.
- Do not pressure viewers to send gifts or make misleading promises about rewards.
- Keep any future historical battle mode playful and non-graphic; avoid targeting real-world protected groups.

## 11. Success criteria / MVP acceptance

MVP (Product Phase 1) acceptance does **not** require any TikTok connectivity.

The MVP is ready for a first capture test (a streaming tool capturing the broadcast view in a browser window) when:

1. It starts locally using documented commands.
2. A viewer can join either team through the simulator.
3. Supported comments cause the expected in-game action.
4. Repeated commands are rate-limited and do not create runaway score changes.
5. Simulated gifts trigger their configured visual effects without changing the winner score.
6. Team energy and the round result are calculated on the server.
7. Automatic round flow works from lobby through results.
8. The operator can pause, resume, start, end, and trigger predefined events.
9. The backend handles a test with 100–200 simulated participants.
10. The broadcast view displays correctly in a browser window in a vertical 9:16 layout and can be captured by window capture. OBS compatibility is not a requirement.
11. There are automated tests for game rules, scoring, cooldowns, round transitions, and event deduplication.
12. Performance results and known limitations are documented.

### Product Phase 2 acceptance (draft; refine after the feasibility findings)

1. A written feasibility report exists and the product owner has made an explicit go / no-go decision.
2. If "go": the chosen approach, its policy review, and its known risks are documented.
3. Real comments and the supported gift events are ingested and normalized into the existing event pipeline.
4. Reconnects, duplicate events, malformed payloads, and connection loss are handled and visible as connection status.
5. The integration is validated with a real TikTok LIVE session, and the success definition above is met: a public stream where real viewers can join and play through the game mechanics. If any part could not be validated (or a public stream is not permitted), the document states precisely what and why.
6. The Local Simulator, its tests, and all Product Phase 1 acceptance criteria still pass unchanged.

## 12. Future game modes

### Osmanlı Kuşatması (future example)

A stylized arcade castle-siege competition with two teams: attackers and defenders. It should reuse player management, team management, normalized events, round management, operator controls, and broadcast infrastructure. It will define its own commands, scoring, assets, and game rules.

The mode should be presented as playful historical fantasy rather than graphic combat or hostility toward present-day groups. It is not part of the MVP.

### Other possible modes
- Köy Pazarı
- Saray Entrikaları
- Other Turkish-themed social competitions

Future ideas do not expand MVP scope automatically.

## 13. Change policy

Product requirements can evolve. When a requirement changes:
1. Explain the user benefit and scope impact.
2. Identify affected game modes and core capabilities.
3. Update this document and the architecture document if needed.
4. Update the implementation plan and tests.
5. Obtain approval before implementing scope-expanding changes.
