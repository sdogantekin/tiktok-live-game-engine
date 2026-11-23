import { SoundEngine } from './engine';

let shared: SoundEngine | null | undefined;

/**
 * The page's one sound engine, created on first use (one audio context per page: browsers limit them). Null where the
 * browser has no Web Audio, in which case the game simply runs silent.
 */
export function getSoundEngine(): SoundEngine | null {
  if (shared === undefined) {
    try {
      shared = typeof AudioContext === 'undefined' ? null : new SoundEngine(new AudioContext({ latencyHint: 'interactive' }));
    } catch {
      shared = null;
    }
  }
  return shared;
}
