import { describe, expect, it } from 'vitest';
import { degreeFreq, validateScore } from '../../game-renderer/audio/music-plan';
import { RACE_CUES, soundDesign } from './sound-design';

describe('the At Yarışı sound design', () => {
  it('plays music from the countdown to the end of the race, quietly while viewers gather', () => {
    expect(soundDesign.music).toEqual({ stopped: 'off', lobby: 'calm', countdown: 'build', active: 'full', results: 'off' });
  });

  const score = soundDesign.score!;

  it('is a well formed score', () => {
    expect(validateScore(score)).toEqual([]);
  });

  it('gallops: triplets, a bass drum on every beat, and a tune in a bright major scale around E5', () => {
    expect(score.stepsPerBeat).toBe(3);
    for (let beat = 0; beat < score.drums.length / 3; beat++) expect(score.drums[beat * 3]).toMatch(/[Dd]/);
    expect(degreeFreq(score, 0, score.leadOctaves)).toBeCloseTo(659.26, 1); // E5
    expect(score.scale).toContain(4); // the major third
    expect(score.scale).not.toContain(3);
  });

  it('gives each viewer action and gift its own sound, and the race moments theirs', () => {
    expect(soundDesign.cue({ type: 'player_action', playerId: 'a', animation: 'boost' })[0]!.name).toBe('whoosh');
    expect(soundDesign.cue({ type: 'player_joined', playerId: 'a', teamId: 'yarisci' })[0]!.name).toBe('pop');
    for (const effect of ['surge_rose', 'surge_gg', 'jockey', 'crowd_cheer', RACE_CUES.lastLap, RACE_CUES.won]) {
      expect(soundDesign.cue({ type: 'celebration', effect }).length, effect).toBeGreaterThan(0);
    }
    expect(soundDesign.cue({ type: 'celebration', effect: 'unknown' })).toEqual([]);
    expect(soundDesign.cue({ type: 'chat', playerId: 'a', text: 'hi' })).toEqual([]);
  });

  it('marks the start, the results and the last three seconds of the countdown', () => {
    expect(soundDesign.phaseEntered('active').map((r) => r.name)).toEqual(['go']);
    expect(soundDesign.phaseEntered('results').map((r) => r.name)).toContain('fanfare');
    expect(soundDesign.phaseEntered('lobby')).toEqual([]);
    expect([5, 4, 3, 2, 1, 0].map((s) => soundDesign.countdownTick(s)?.name ?? null)).toEqual([null, null, 'tick', 'tick', 'tick', null]);
  });
});
