export interface EffectLimits {
  /** How long a started effect occupies one of its concurrency slots. */
  durationMs: number;
  maxConcurrent: number;
  /** Requests beyond `maxConcurrent` wait here; beyond this they are dropped. */
  maxQueued: number;
}

export type EffectDecision = 'start' | 'queued' | 'dropped';

/**
 * Keeps big effects from stacking into a mess: each effect id has a concurrency limit and a short
 * FIFO queue. The caller starts an effect when `request` says `start`, and when `update` returns it.
 */
export class EffectQueue<Payload = undefined> {
  private readonly active = new Map<string, number[]>(); // effect id -> end times
  private readonly queued = new Map<string, Payload[]>();

  constructor(private readonly limits: Readonly<Record<string, EffectLimits>>) {}

  request(effect: string, payload: Payload, now: number): EffectDecision {
    const limit = this.limits[effect];
    if (!limit) return 'dropped';
    this.expire(effect, now);

    const active = this.active.get(effect) ?? [];
    if (active.length < limit.maxConcurrent) {
      active.push(now + limit.durationMs);
      this.active.set(effect, active);
      return 'start';
    }
    const waiting = this.queued.get(effect) ?? [];
    if (waiting.length >= limit.maxQueued) return 'dropped';
    waiting.push(payload);
    this.queued.set(effect, waiting);
    return 'queued';
  }

  /** Returns queued effects whose turn has come. Call once per frame. */
  update(now: number): { effect: string; payload: Payload }[] {
    const started: { effect: string; payload: Payload }[] = [];
    for (const [effect, waiting] of this.queued) {
      const limit = this.limits[effect];
      if (!limit || waiting.length === 0) continue;
      this.expire(effect, now);
      const active = this.active.get(effect) ?? [];
      while (waiting.length > 0 && active.length < limit.maxConcurrent) {
        const payload = waiting.shift()!;
        // A queued effect starts when a slot frees, not retroactively when it was requested.
        active.push(now + limit.durationMs);
        started.push({ effect, payload });
      }
      this.active.set(effect, active);
    }
    return started;
  }

  private expire(effect: string, now: number): void {
    const active = this.active.get(effect);
    if (active) this.active.set(effect, active.filter((end) => end > now));
  }
}
