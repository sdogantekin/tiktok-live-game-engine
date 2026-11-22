# TikTok Live Game Engine — Product Requirements

**Document status:** Baseline for MVP planning  
**Product type:** Personal side project  
**First game mode:** Mahalle Halayı  
**Future example mode:** Osmanlı Kuşatması

## 1. Product vision

Build a modular, real-time 3D game experience for livestreams. Viewers become participants through chat commands and livestream gift events. A single reusable engine should support multiple themed game modes without rebuilding player management, team management, event handling, scoring, round control, operator controls, or the livestream presentation layer for each game.

The first release is a local, simulator-driven prototype of **Mahalle Halayı**. Real TikTok connectivity is a later integration milestone, not a prerequisite for proving the gameplay.

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
- Test the game without a live TikTok connection.

## 3. Product principles

1. **Free-first participation:** joining, basic actions, and meaningful team contribution are free.
2. **Gifts add spectacle:** gifts primarily trigger visual celebrations and special animations. They do not directly determine the winner in the MVP.
3. **Fast comprehension:** a viewer should understand the current teams, available commands, and score quickly.
4. **Short rounds:** rounds are short enough for viewers to join, participate, and see a result during a livestream.
5. **Modular game modes:** each mode owns its theme, rules, commands, scoring configuration, and presentation assets; shared capabilities stay in the core engine.
6. **Operator safety net:** automatic play is the default, but the operator can intervene.
7. **Replaceable integrations:** the game engine consumes normalized events, not TikTok-specific payloads.
8. **Playful and inclusive themes:** historical or cultural settings should remain fictionalized/arcade-like and avoid targeting real-world national, ethnic, or religious groups.

## 4. MVP scope

### In scope
- One playable game mode: Mahalle Halayı.
- One stylized 3D wedding courtyard environment.
- Two teams: Gelin Takımı and Damat Takımı.
- Player registration from simulated viewer events.
- Comment-command simulation.
- Gift-event simulation.
- Basic player and team state.
- Team score/energy and round results.
- Configurable short rounds (initial default: 3 minutes).
- Hybrid game control: automatic flow plus operator overrides.
- A simple operator panel with a local event simulator.
- A dedicated vertical broadcast view suitable for capture by OBS.
- A repeatable test that simulates 100–200 participant records.

### Explicitly out of scope for the first MVP
- Real TikTok LIVE integration.
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
- `gelin` → Gelin Takımı
- `damat` → Damat Takımı

A player can select a team during the lobby. During an active round, team switching is disabled by default to discourage score manipulation. A late viewer may join an available team during a round, but their participation starts from the moment they join. The operator may correct a team assignment.

### Initial comment commands

Commands are matched as complete comments after trimming whitespace and applying consistent Turkish-aware normalization. The parser must not trigger when a command word merely appears inside a longer sentence.

| Comment | Behavior | Score impact |
|---|---|---|
| `gelin` | Join Gelin Takımı | No direct points |
| `damat` | Join Damat Takımı | No direct points |
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
- Dedicated, clean 9:16 layout for OBS browser capture.
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

### MVP provider: Local Simulator

The simulator must be able to:
- Create synthetic viewers.
- Join viewers to either team.
- Send supported comments.
- Send simulated gifts.
- Generate a configurable number of participants and event bursts.
- Reproduce edge cases such as duplicate events, malformed comments, rapid repeated commands, and provider disconnects.

### Future provider: TikTok LIVE

A future provider may connect to TikTok LIVE and translate supported live events into the engine's normalized event contract. This is deliberately excluded from the MVP.

Before implementing it, verify the current official TikTok integration/partner options, platform terms, technical access, and any required approvals. An unofficial connector must be treated as experimental and replaceable, not as a guaranteed or officially supported API.

## 10. Privacy, safety, and moderation

- Keep participant data in memory for the active local session in the MVP.
- Store only the minimum identifiers needed to deduplicate events and maintain a live player record.
- Do not create persistent viewer profiles.
- Sanitize and length-limit usernames and comments before display.
- Provide operator ability to remove or ignore disruptive simulated participants; design the same capability for a future provider.
- Apply per-user and global event rate limits.
- Do not pressure viewers to send gifts or make misleading promises about rewards.
- Keep any future historical battle mode playful and non-graphic; avoid targeting real-world protected groups.

## 11. Success criteria / MVP acceptance

The MVP is ready for a first OBS test when:

1. It starts locally using documented commands.
2. A viewer can join either team through the simulator.
3. Supported comments cause the expected in-game action.
4. Repeated commands are rate-limited and do not create runaway score changes.
5. Simulated gifts trigger their configured visual effects without changing the winner score.
6. Team energy and the round result are calculated on the server.
7. Automatic round flow works from lobby through results.
8. The operator can pause, resume, start, end, and trigger predefined events.
9. The backend handles a test with 100–200 simulated participants.
10. The broadcast view can be captured by OBS in a vertical 9:16 layout.
11. There are automated tests for game rules, scoring, cooldowns, round transitions, and event deduplication.
12. Performance results and known limitations are documented.

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
