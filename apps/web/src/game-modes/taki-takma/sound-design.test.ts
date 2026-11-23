import { describe, expect, it } from 'vitest';
import { validateScore } from '../../game-renderer/audio/music-plan';
import { soundDesign } from './sound-design';

describe('the Takı Takma Töreni sound design', () => {
  it('plays music only in the phases that should have it', () => {
    expect(soundDesign.music).toEqual({ stopped: 'off', lobby: 'calm', countdown: 'build', active: 'full', results: 'off' });
  });

  it('is a well formed score in a hicaz-flavoured scale, calmer than the halay', () => {
    const score = soundDesign.score!;
    expect(validateScore(score)).toEqual([]);
    expect(score.scale.slice(1).map((s, i) => s - score.scale[i]!)).toContain(3); // the augmented second
    expect(score.stepsPerBeat).toBe(2);
  });

  it('chimes when a takı is pinned (as it lands), applause for `alkış`, and gives every gift item a sound', () => {
    const pin = soundDesign.cue({ type: 'player_action', playerId: 'a', animation: 'pin' });
    expect(pin.map((r) => r.name)).toEqual(['chime']);
    expect(pin[0]!.delayMs).toBeGreaterThan(0);
    expect(soundDesign.cue({ type: 'player_action', playerId: 'a', animation: 'clap' })[0]!.name).toBe('clap');
    for (const effect of ['bilezik', 'kolye_seti', 'ev_anahtari', 'taki_yagmuru']) expect(soundDesign.cue({ type: 'celebration', effect }).length, effect).toBeGreaterThan(0);
    expect(soundDesign.cue({ type: 'celebration', effect: 'ev_anahtari' }).map((r) => r.name)).toContain('fanfare');
    expect(soundDesign.cue({ type: 'chat', playerId: 'a', text: 'selam' })).toEqual([]);
  });
});
