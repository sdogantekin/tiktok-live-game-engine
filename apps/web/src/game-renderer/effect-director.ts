import type { Cue } from './cue-bus';
import { EffectQueue } from './effect-queue';
import type { EffectRecipe } from './types';

export interface EffectStart {
  effect: string;
  playerId?: string;
  recipe: EffectRecipe;
  at: number;
}

export type EffectListener = (start: EffectStart) => void;

/**
 * Turns `celebration` cues into effect starts, applying each recipe's concurrency and queue limits,
 * so avatars, particles and scene props all react to the same accepted effect.
 */
export class EffectDirector {
  private readonly queue: EffectQueue<string | undefined>;
  private readonly listeners = new Set<EffectListener>();
  /** Effects accepted so far (started now or after queueing). Exposed for the perf probe. */
  started = 0;

  constructor(private readonly recipes: Readonly<Record<string, EffectRecipe>>) {
    this.queue = new EffectQueue(recipes);
  }

  subscribe(listener: EffectListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  handle(cue: Cue, now: number): void {
    if (cue.type !== 'celebration') return;
    if (this.queue.request(cue.effect, cue.playerId, now) === 'start') this.start(cue.effect, cue.playerId, now);
  }

  /** Releases queued effects whose turn has come. Call once per frame. */
  update(now: number): void {
    for (const { effect, payload } of this.queue.update(now)) this.start(effect, payload, now);
  }

  private start(effect: string, playerId: string | undefined, at: number): void {
    const recipe = this.recipes[effect];
    if (!recipe) return;
    this.started++;
    for (const listener of this.listeners) listener({ effect, playerId, recipe, at });
  }
}
