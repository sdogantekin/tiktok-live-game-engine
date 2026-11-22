import type { PresentationBatch, PresentationEvent, RosterDelta } from '@live-game/contracts';
import { SOCKET_EVENTS } from '@live-game/contracts';
import type { GameEngine } from '../core/engine';

export const DEFAULT_MAX_ACTIONS_PER_BATCH = 100;

export interface PublisherOptions {
  engine: GameEngine;
  /** Delivers one message to every connected client. */
  send: (event: string, payload: unknown) => void;
  /** Individual `player_action` events kept per batch; the rest are folded into per-team crowd counts. */
  maxActionsPerBatch?: number;
}

/**
 * Turns engine state into outbound messages: coalesced HUD updates, roster deltas, and batched
 * presentation events. Pure logic over an injected `send`, so it is testable without sockets.
 */
export class Publisher {
  private buffer: PresentationEvent[] = [];
  private oldestIngestedAt: number | undefined;
  private lastHudKey: string | null = null;
  private readonly roster = new Map<string, { teamId: string | null; name: string }>();
  private readonly maxActions: number;

  constructor(private readonly options: PublisherOptions) {
    this.maxActions = options.maxActionsPerBatch ?? DEFAULT_MAX_ACTIONS_PER_BATCH;
  }

  /** Queues a transient cue for the next batch. */
  onPresentation(event: PresentationEvent, ingestedAt?: number): void {
    this.buffer.push(event);
    if (ingestedAt !== undefined && (this.oldestIngestedAt === undefined || ingestedAt < this.oldestIngestedAt)) {
      this.oldestIngestedAt = ingestedAt;
    }
  }

  /** Sends buffered cues as one batch. Cues other than `player_action` are always kept. */
  flushPresentation(): void {
    if (this.buffer.length === 0) return;
    const pending = this.buffer;
    const oldestIngestedAt = this.oldestIngestedAt;
    this.buffer = [];
    this.oldestIngestedAt = undefined;

    const events: PresentationEvent[] = [];
    const crowd = new Map<string, number>();
    let actions = 0;

    for (const event of pending) {
      if (event.type !== 'player_action') {
        events.push(event);
      } else if (actions < this.maxActions) {
        events.push(event);
        actions++;
      } else {
        const teamId = this.options.engine.state.players.get(event.playerId)?.teamId;
        if (teamId) crowd.set(teamId, (crowd.get(teamId) ?? 0) + 1);
      }
    }

    const batch: PresentationBatch = {
      events,
      crowd: [...crowd].map(([teamId, count]) => ({ teamId, actions: count })),
      ...(oldestIngestedAt === undefined ? {} : { oldestIngestedAt }),
    };
    this.options.send(SOCKET_EVENTS.presentation, batch);
  }

  /** Sends the roster delta, then the HUD, each only if it changed (roster first so counts never lead the players). */
  publishState(): void {
    const { engine, send } = this.options;

    const delta = this.diffRoster();
    if (delta.upsert.length > 0 || delta.remove.length > 0) send(SOCKET_EVENTS.roster, delta);

    const hud = engine.state.hud();
    const key = JSON.stringify({ ...hud, serverNow: 0 });
    if (key !== this.lastHudKey) {
      this.lastHudKey = key;
      send(SOCKET_EVENTS.hud, hud);
    }
  }

  private diffRoster(): RosterDelta {
    const upsert: RosterDelta['upsert'] = [];
    const seen = new Set<string>();

    for (const player of this.options.engine.state.players.list()) {
      seen.add(player.id);
      const previous = this.roster.get(player.id);
      if (!previous || previous.teamId !== player.teamId || previous.name !== player.name) {
        this.roster.set(player.id, { teamId: player.teamId, name: player.name });
        upsert.push({
          id: player.id,
          name: player.name,
          teamId: player.teamId,
          joinedAt: player.joinedAt,
          lastActiveAt: player.lastActiveAt,
        });
      }
    }

    const remove: string[] = [];
    for (const id of this.roster.keys()) {
      if (!seen.has(id)) {
        remove.push(id);
        this.roster.delete(id);
      }
    }
    return { upsert, remove };
  }
}
