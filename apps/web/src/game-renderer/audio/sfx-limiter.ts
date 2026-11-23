import type { SfxName } from './types';

/** How a sound effect shares the speakers: how soon it may repeat, how long it sounds, and whether it ducks the music. */
export const SFX_PROFILE: Readonly<Record<SfxName, { gap: number; duration: number; duck: boolean }>> = {
  pop: { gap: 0.12, duration: 0.12, duck: false },
  clap: { gap: 0.15, duration: 0.18, duck: false },
  whoosh: { gap: 0.2, duration: 0.4, duck: false },
  sparkle: { gap: 0.2, duration: 0.4, duck: false },
  chime: { gap: 0.3, duration: 1.6, duck: false },
  tick: { gap: 0.4, duration: 0.12, duck: false },
  go: { gap: 0.6, duration: 0.5, duck: true },
  fanfare: { gap: 1.5, duration: 1.4, duck: true },
  roll: { gap: 1.5, duration: 0.8, duck: true },
  cheer: { gap: 1, duration: 1.4, duck: true },
};

export const MAX_SFX_VOICES = 10;

/**
 * Keeps a crowd from turning into noise: with 200 viewers acting at once every effect could fire hundreds of times a
 * second. Each effect has a minimum gap between plays, and only so many effects may sound at once. Times are in audio
 * seconds. Pure, so it is unit-tested.
 */
export class SfxLimiter {
  private readonly lastStart = new Map<SfxName, number>();
  private readonly ends: number[] = [];

  constructor(private readonly maxVoices = MAX_SFX_VOICES) {}

  /** Asks to play `name` at time `when`. Returns false if it should be dropped. */
  tryPlay(name: SfxName, when: number): boolean {
    const profile = SFX_PROFILE[name];
    const last = this.lastStart.get(name);
    if (last !== undefined && when - last < profile.gap) return false;
    for (let i = this.ends.length - 1; i >= 0; i--) if (this.ends[i]! <= when) this.ends.splice(i, 1);
    if (this.ends.length >= this.maxVoices) return false;
    this.lastStart.set(name, when);
    this.ends.push(when + profile.duration);
    return true;
  }

  /** Voices still sounding at `when`. */
  active(when: number): number {
    return this.ends.filter((end) => end > when).length;
  }
}
