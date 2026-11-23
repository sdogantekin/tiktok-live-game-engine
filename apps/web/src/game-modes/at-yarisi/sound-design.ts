import type { SoundDesign } from '../../game-renderer/audio/types';

/** PLACEHOLDER until Step 4.4: silent. */
export const soundDesign: SoundDesign = {
  music: { stopped: 'off', lobby: 'off', countdown: 'off', active: 'off', results: 'off' },
  cue: () => [],
  phaseEntered: () => [],
  countdownTick: () => null,
};
