import type { SoundDesign } from '../../game-renderer/audio/types';

/**
 * The sound of Mahalle Halayı, all original: a brisk 4/4 halay in a bright folk scale (D mixolydian), a davul-and-zurna
 * arrangement that builds with the crowd's energy, and effects for what happens on stage. Tempo comes from the beat
 * clock, so the music speeds up with the dancers.
 */
export const soundDesign: SoundDesign = {
  // The game's own music file. The file mixes several halays at different tempos (about 96 to 136 BPM), so it states no
  // single `bpm`: the dancers keep their own beat while it plays. Without the file (it is not committed to the repository,
  // see .gitignore) or while it loads, the built-in synthesised music below plays instead.
  track: { url: '/game-modes/mahalle-halayi/audio/halay.mp3', gain: 0.9 },
  score: {
    stepsPerBeat: 4, // sixteenth notes: halay melodies are quick and ornamented
    stepsPerBar: 16, // 4/4
    rootHz: 146.83, // D3
    leadOctaves: 2, // the zurna sings around D5 and above
    scale: [0, 2, 4, 5, 7, 9, 10, 12], // D mixolydian: bright and folk-like (no dark augmented second)
    // Two bars of the davul: a heavy dum on 1 and 3 with a syncopated pickup (the "a" before the next beat), tek answers, a double dum to turn the second bar.
    drums: 'D..dt.tkD..dt.ttD..dt.tkD.dDt.tt',
    // Hand claps on the 2 and the 4.
    claps: '....c.......c.......c.......c...',
    // A steady shaker: accents on every beat and soft pulses between.
    shaker: 'SsssSsssSsssSsssSsssSsssSsssSsss',
    // The bass plucks the root with the drum and turns on the fifth.
    bass: '0..0.0.00..0.0.40..0.0.00.0.0.40',
    // Four two-bar zurna phrases: a call, a high answer, a fast run, and a repeated-note turn home. Digits are scale
    // degrees (0 = D5), each step a sixteenth; "-" holds the note.
    phrases: [
      '5-5-6-5-4-4-54342-2-3-4-3-2-0---',
      '7-7-6-5-6-5-4-3-4-4-3-2-3-2-1-0-',
      '012345676543210152-5-3-4-2-3-1-0',
      '4-4-4-4-5-5-4-3-2-3-4-3-2-1-0---',
    ],
    layerUp: [0.12, 0.32, 0.6],
    layerDown: [0.06, 0.2, 0.4],
  },
  music: { stopped: 'off', lobby: 'calm', countdown: 'build', active: 'full', results: 'off' },

  cue(cue) {
    switch (cue.type) {
      case 'player_joined':
        return [{ name: 'pop' }];
      case 'player_action':
        if (cue.animation === 'halay') return [{ name: 'clap' }];
        if (cue.animation === 'zipla') return [{ name: 'whoosh' }];
        return [{ name: 'sparkle', velocity: 0.6 }];
      case 'crowd':
        return [{ name: 'clap', velocity: 0.5 }];
      case 'chat':
        return []; // what people say stays quiet: the music and the dancers are the sound
      case 'celebration':
        if (cue.effect === 'rose') return [{ name: 'chime' }];
        if (cue.effect === 'gg') return [{ name: 'cheer' }, { name: 'sparkle', delayMs: 150 }];
        if (cue.effect === 'big_celebration') return [{ name: 'fanfare' }, { name: 'cheer', delayMs: 200 }];
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
