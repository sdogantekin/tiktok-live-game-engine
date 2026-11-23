import type { SoundDesign } from '../../game-renderer/audio/types';

/**
 * The sound of Takı Takma Töreni, all original: a gentle, swaying wedding tune in a hicaz-flavoured scale (D, Eb, F#, G,
 * A, Bb, C), with a soft davul and hand claps that build with the crowd's energy. Pinning a takı is a chime; the big
 * gifts and the gold shower bring a fanfare and cheers. Tempo follows the beat clock.
 */
export const soundDesign: SoundDesign = {
  score: {
    stepsPerBeat: 2, // eighth notes: calmer than the halay
    stepsPerBar: 8,
    rootHz: 146.83, // D3
    leadOctaves: 2,
    scale: [0, 1, 4, 5, 7, 8, 10, 12], // hicaz: the augmented second between Eb and F# is the sound of a Turkish wedding
    drums: 'D..tD.t.D..tD.tk',
    claps: '....c.......c...',
    shaker: 'SsSsSsSsSsSsSsSs',
    bass: '0...0...4...0...',
    phrases: ['0-1-2---1-0-1---', '4-4-5-4-2---1-0-', '2-3-4-5-4-3-2-1-', '4---5-6-7---5-4-'],
    layerUp: [0.1, 0.3, 0.55],
    layerDown: [0.05, 0.18, 0.36],
  },
  music: { stopped: 'off', lobby: 'calm', countdown: 'build', active: 'full', results: 'off' },

  cue(cue) {
    switch (cue.type) {
      case 'player_joined':
        return [{ name: 'pop' }];
      case 'player_action':
        return cue.animation === 'pin' ? [{ name: 'chime', velocity: 0.55, delayMs: 1700 }] : [{ name: 'clap', velocity: 0.8 }]; // the chime lands as the takı is pinned
      case 'crowd':
        return [{ name: 'clap', velocity: 0.5 }];
      case 'chat':
        return [];
      case 'celebration':
        if (cue.effect === 'bilezik') return [{ name: 'chime' }];
        if (cue.effect === 'kolye_seti') return [{ name: 'chime' }, { name: 'sparkle', delayMs: 200 }, { name: 'cheer', delayMs: 300, velocity: 0.7 }];
        if (cue.effect === 'ev_anahtari') return [{ name: 'fanfare' }, { name: 'cheer', delayMs: 200 }];
        if (cue.effect === 'taki_yagmuru') return [{ name: 'sparkle' }, { name: 'cheer', delayMs: 250 }];
        return [];
    }
  },

  phaseEntered(phase) {
    if (phase === 'active') return [{ name: 'go' }];
    if (phase === 'results') return [{ name: 'fanfare' }];
    return [];
  },

  countdownTick(secondsLeft) {
    return secondsLeft >= 1 && secondsLeft <= 3 ? { name: 'tick', velocity: 0.8 } : null;
  },
};
