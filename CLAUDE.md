# CLAUDE.md — TikTok Live Game Engine

Persistent working instructions for Claude Code. Keep detailed product and technical specifications in `REQUIREMENTS.md` and `ARCHITECTURE.md`.

## 1. Project context and source of truth

- The current working directory is the repository root. Never create another nested `tiktok-live-game-engine/` directory.
- Read `REQUIREMENTS.md` for product scope and `ARCHITECTURE.md` for technical boundaries before substantial work.
- `REQUIREMENTS.md` is authoritative for product behavior and MVP scope; `ARCHITECTURE.md` for technical decisions; this file for working practices.
- If these documents conflict or omit a material decision, explain the issue and recommend a resolution. Do not silently choose or rewrite an agreed decision.
- The product is a modular livestream game engine. **Mahalle Halayı** is the only MVP game. **Osmanlı Kuşatması** is a future example, not MVP scope.

## 2. Think before coding

**Don't assume. Don't hide confusion. Surface material trade-offs.**

- Inspect relevant files and existing code before proposing changes; don't assume the repository is still empty.
- State material assumptions. When multiple interpretations would materially change the result, present the options and recommend one.
- Ask a focused question only when necessary information is missing from the documents and code. Do not ask again for decisions already recorded.
- Point out a simpler approach or meaningful downside when relevant. Do not make consequential trade-offs silently.

## 3. Simplicity first

**Use the minimum complexity that satisfies the documented requirements.**

- No unrequested features, speculative infrastructure, or abstractions for hypothetical future needs.
- Do not add microservices, a database, payment processing, cloud deployment, or runtime plugin loading to the MVP without explicit approval.
- The documented boundaries between core services, game-mode rules, event providers, and rendering are intentional. Preserve them, but do not build a generic framework beyond current needs.
- Prefer static game-mode registration and replaceable provider adapters over a premature plugin platform.
- Use judgment for trivial tasks. Avoid defensive code for impossible scenarios, but validate and handle failures at real external boundaries.

## 4. Make surgical changes

**Touch only what the task requires. Clean up only what your changes make necessary.**

- Match existing style and conventions. Do not refactor, reformat, or improve unrelated adjacent code.
- Do not delete pre-existing code merely because it appears unused; mention it instead.
- Remove imports, variables, functions, or files made obsolete by your own changes when appropriate.
- Every changed line should be traceable to the approved task. If a solution seems disproportionate, simplify it.

## 5. Goal-driven execution

**Define verifiable success criteria and verify the result.**

For substantial or multi-step tasks:
1. State a brief plan and intended outcome.
2. Identify acceptance criteria and relevant tests before implementation.
3. Implement in small, reviewable increments.
4. Run relevant tests, type checks, lint checks, and builds where available.
5. Report what passed, failed, was not run, and any remaining limitations.

Never claim something works unless it has been verified. State clearly when verification is blocked.

## 6. Required workflow and approvals

For substantial work, follow **Explore → Plan → Approval → Implement → Verify**.

- Use Plan Mode for new features, multi-file changes, dependency changes, and architectural decisions.
- For planning-only tasks, inspect read-only and present the proposed plan. Do not edit files, install dependencies, scaffold the app, or run mutating commands before approval.
- Wait for explicit approval before implementing a proposed plan or making a material architectural change.
- Update `REQUIREMENTS.md` only for approved product-scope changes; update `ARCHITECTURE.md` for approved technical-decision changes.

## 7. Engineering conventions

- Use TypeScript for application code and shared contracts. Prefer explicit types and runtime validation at external boundaries; avoid `any` where practical.
- Keep game rules, core services, provider adapters, rendering, broadcast UI, and operator controls separate.
- Normalize provider-specific events before they enter the core engine. The backend is authoritative for participants, teams, scores, rounds, and game state.
- Make event handling idempotent when stable IDs are available; use appropriate cooldowns and rate limits.
- Treat comments, usernames, provider payloads, and browser commands as untrusted. Validate, length-limit, and safely render user-controlled text.
- Keep secrets out of source control. Verify current official documentation and compatibility before choosing dependency versions; prefer stable releases and seek approval before using alpha/beta versions.
- Test important behavior, especially command parsing, team assignment, scoring, cooldowns, round transitions, event normalization, and duplicate-event handling.

## 8. Product and visual guardrails

- Every viewer must have meaningful free participation. In the MVP, gifts trigger visual celebrations; they do not add winner points or guarantee victory.
- Start with the local event simulator. Do not implement real TikTok integration unless explicitly approved as a later task.
- Target 100–200 participant records, not 100–200 individually rendered high-detail characters. Follow the performance approach in the project documents.
- Initial art direction: **stylized low-poly, toy-like 3D diorama** — colorful, playful, and readable in a vertical livestream. This is replaceable art direction, not a dependency of game rules or core services.
- Use Blender `.blend` files as editable source assets and optimized `.glb` files at runtime. Treat AI-generated assets as drafts until quality, consistency, rigging, animation, and usage rights are checked.
- Propose material changes to the agreed visual style or asset pipeline before making them.

## 9. Definition of done

Report the files changed, behavior delivered, checks run and their results, known limitations, and any decisions or user input still needed. Code being written is not, by itself, proof of completion.
