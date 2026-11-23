import type { SoundDesign } from '../../game-renderer/audio/types';

/**
 * The sound of At Yarışı, all original: a driving, galloping beat (three steps to a beat, long-short-short like hooves) under
 * a bright brass-like tune in a major scale, building as the field heats up. Likes whoosh, gifts sparkle and chime, the last lap
 * rings a bell-like chime, and a win brings the crowd up. Tempo follows the beat clock, which the scene drives from the
 * excitement of the race.
 */
export const soundDesign: SoundDesign = {
  score: {
    stepsPerBeat: 3, // triplets: the gallop
    stepsPerBar: 12, // 4/4
    rootHz: 164.81, // E3
    leadOctaves: 2, // the tune sings around E5
    scale: [0, 2, 4, 5, 7, 9, 11, 12], // major: bright and open
    // Two bars of hooves: a bass-drum on every beat, a ghost hit and a rim hit after it (da-da-DUM), a different last beat to turn.
    drums: 'DktDktDktDktDktDktDktDtD',
    // Claps on the 2 and the 4 of both bars.
    claps: '...c.....c.....c.....c..',
    // A steady shaker, accented on every beat.
    shaker: 'SssSssSssSssSssSssSssSss',
    // The bass pulses the root and turns on the fifth.
    bass: '0..0..0..0..0..0..4..0.4',
    // Four two-bar phrases, a note per beat or half beat: a call, an answer, a run up and down, and a sign-off. Digits are scale
    // degrees (0 = E5), "-" holds the note.
    phrases: ['4-.4-.5-.7-.7-.5-.4-.2-.', '7-.5-.7-.4-.5-.7-.5-.4-.', '01234567-.654321.0--.-..', '4-.2-.4-.5-.4-.2-.0-.-.-'],
    layerUp: [0.12, 0.32, 0.6],
    layerDown: [0.06, 0.2, 0.4],
  },
  music: { stopped: 'off', lobby: 'calm', countdown: 'build', active: 'full', results: 'off' },

  cue(cue) {
    switch (cue.type) {
      case 'player_joined':
        return [{ name: 'pop', velocity: 0.7 }];
      case 'player_action':
        return [{ name: 'whoosh', velocity: 0.35 }]; // a burst of likes: the horse picks up speed
      case 'crowd':
        return [];
      case 'chat':
        return [];
      case 'celebration':
        if (cue.effect === 'surge_rose') return [{ name: 'sparkle', velocity: 0.7 }, { name: 'whoosh', delayMs: 60 }];
        if (cue.effect === 'surge_gg') return [{ name: 'chime' }, { name: 'whoosh', delayMs: 60 }];
        if (cue.effect === 'jockey') return [{ name: 'fanfare', velocity: 0.55 }];
        if (cue.effect === 'crowd_cheer') return [{ name: 'cheer', velocity: 0.5 }];
        // Moments the scene announces from the race itself (see `RACE_CUES`).
        if (cue.effect === 'last_lap') return [{ name: 'chime' }, { name: 'chime', delayMs: 180, velocity: 0.8 }];
        if (cue.effect === 'race_won') return [{ name: 'cheer' }, { name: 'sparkle', delayMs: 150 }];
        return [];
    }
  },

  phaseEntered(phase) {
    if (phase === 'active') return [{ name: 'go' }];
    if (phase === 'results') return [{ name: 'fanfare' }, { name: 'cheer', delayMs: 250 }];
    return [];
  },

  countdownTick(secondsLeft) {
    return secondsLeft >= 1 && secondsLeft <= 3 ? { name: 'tick', velocity: 0.8 } : null;
  },
};

/** The effect names the scene sends as cues when the race itself reaches a moment worth a sound. */
export const RACE_CUES = { lastLap: 'last_lap', won: 'race_won' } as const;
