import { describe, expect, it } from 'vitest';
import { degreeFreq, validateScore } from '../../game-renderer/audio/music-plan';
import { validateTrack } from '../../game-renderer/audio/track-player';
import { soundDesign } from './sound-design';

describe('the game sound design', () => {
  it('plays music only in the phases that should have it', () => {
    expect(soundDesign.music).toEqual({ stopped: 'off', lobby: 'calm', countdown: 'build', active: 'full', results: 'off' });
  });

  it('answers viewer words with different effects', () => {
    expect(soundDesign.cue({ type: 'player_action', playerId: 'a', animation: 'halay' })[0]!.name).toBe('clap');
    expect(soundDesign.cue({ type: 'player_action', playerId: 'a', animation: 'zipla' })[0]!.name).toBe('whoosh');
    expect(soundDesign.cue({ type: 'player_action', playerId: 'a', animation: 'oyna' })[0]!.name).toBe('sparkle');
    expect(soundDesign.cue({ type: 'player_joined', playerId: 'a', teamId: 'gelin' })[0]!.name).toBe('pop');
  });

  it('gives each celebration its own sound, and big ones a fanfare', () => {
    expect(soundDesign.cue({ type: 'celebration', effect: 'rose' }).map((r) => r.name)).toEqual(['chime']);
    expect(soundDesign.cue({ type: 'celebration', effect: 'big_celebration' }).map((r) => r.name)).toContain('fanfare');
    expect(soundDesign.cue({ type: 'celebration', effect: 'unknown' })).toEqual([]);
  });

  it('marks the start of a round, the results, and the last three seconds of a countdown', () => {
    expect(soundDesign.phaseEntered('active').map((r) => r.name)).toEqual(['go']);
    expect(soundDesign.phaseEntered('results').map((r) => r.name)).toEqual(['fanfare']);
    expect(soundDesign.phaseEntered('lobby')).toEqual([]);
    expect([5, 4, 3, 2, 1, 0].map((s) => soundDesign.countdownTick(s)?.name ?? null)).toEqual([null, null, 'tick', 'tick', 'tick', null]);
  });
});

describe('the game music', () => {
  const score = soundDesign.score!;

  it('is a well formed score', () => {
    expect(validateScore(score)).toEqual([]);
  });

  it('puts the zurna around D5 in a bright scale: no minor third and no augmented second', () => {
    expect(degreeFreq(score, 0, score.leadOctaves)).toBeCloseTo(587.32, 1); // D5
    expect(degreeFreq(score, 7, score.leadOctaves)).toBeCloseTo(1174.64, 1); // the octave above
    expect(score.scale).toContain(4); // major third (F#): bright, not the dark minor third
    expect(score.scale).not.toContain(3);
    const gaps = score.scale.slice(1).map((semitones, i) => semitones - score.scale[i]!);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(2); // only whole and half steps
  });

  it('is brisk and lively: sixteenth-note melodies over a davul that never goes quiet for a whole beat', () => {
    expect(score.stepsPerBeat).toBe(4);
    const beatLength = score.stepsPerBeat;
    for (let beat = 0; beat < score.drums.length / beatLength; beat++) {
      expect(score.drums.slice(beat * beatLength, (beat + 1) * beatLength)).not.toBe('....');
    }
  });
});

describe('the game music file', () => {
  const track = soundDesign.track!;

  it('is a valid track definition that lives in the game public audio folder', () => {
    expect(validateTrack(track)).toEqual([]);
    expect(track.url).toBe('/game-modes/mahalle-halayi/audio/halay.mp3');
  });

  it('is optional: the game keeps a complete built-in score for when the file is missing or still loading', () => {
    expect(soundDesign.score).toBeDefined();
    expect(validateScore(soundDesign.score!)).toEqual([]);
  });

  it('states no tempo, because the file mixes several halays at different speeds (the dancers keep their own beat)', () => {
    expect(track.bpm).toBeUndefined();
  });
});
