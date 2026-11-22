import type { PresentationBatch } from '@live-game/contracts';

/** A transient visual cue. Cues are best-effort: missing one never affects game state. */
export type Cue =
  | { type: 'player_joined'; playerId: string; teamId: string }
  | { type: 'player_action'; playerId: string; animation: string }
  | { type: 'celebration'; effect: string; playerId?: string }
  /** `actions` player actions by team members who have no individual avatar, folded by the server. */
  | { type: 'crowd'; teamId: string; actions: number };

export type CueListener = (cue: Cue) => void;

/** Tiny synchronous fan-out. Cues bypass React state so a burst never causes a burst of re-renders. */
export class CueBus {
  private readonly listeners = new Set<CueListener>();

  subscribe(listener: CueListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(cue: Cue): void {
    for (const listener of this.listeners) listener(cue);
  }
}

/** Converts a server presentation batch into scene cues (hints are for the operator, not the scene). */
export function cuesFromBatch(batch: PresentationBatch): Cue[] {
  const cues: Cue[] = [];
  for (const event of batch.events) {
    if (event.type !== 'hint') cues.push(event);
  }
  for (const crowd of batch.crowd) cues.push({ type: 'crowd', teamId: crowd.teamId, actions: crowd.actions });
  return cues;
}
