import { describe, expect, it } from 'vitest';
import { degreeFreq, effectiveLayer, nextLayer, planStep, validateScore } from './music-plan';
import { testScore as score } from './test-score';

describe('score validation', () => {
  it('accepts a well formed score: patterns line up and use only known symbols', () => {
    expect(validateScore(score)).toEqual([]);
  });

  it('catches a malformed score', () => {
    expect(validateScore({ ...score, claps: '.c.' })).toContain('claps must be as long as drums');
    expect(validateScore({ ...score, drums: 'D.x.D.t.D.tkD.tt' })).toContain('drums may only use D d t k .');
    expect(validateScore({ ...score, phrases: ['-.45.543.2.1.0--', ...score.phrases.slice(1)] })).toContain('phrase 0 starts with a hold');
    expect(validateScore({ ...score, layerDown: [0.2, 0.2, 0.4] })).toContain('each layerDown must be below its layerUp');
  });
});

describe('degreeFreq', () => {
  it('puts degree 0 at the root shifted by the octaves, the last degree an octave up, and continues past it', () => {
    expect(degreeFreq(score, 0, score.leadOctaves)).toBeCloseTo(400, 6);
    expect(degreeFreq(score, 7, score.leadOctaves)).toBeCloseTo(800, 6);
    expect(degreeFreq(score, 8, score.leadOctaves)).toBeCloseTo(degreeFreq(score, 1, score.leadOctaves + 1), 6);
  });
});

describe('arrangement layers', () => {
  it('climbs with energy and falls back only after a clear drop (hysteresis)', () => {
    expect(nextLayer(0, 0.05, score)).toBe(0);
    expect(nextLayer(0, 0.15, score)).toBe(1);
    expect(nextLayer(1, 0.4, score)).toBe(2);
    expect(nextLayer(0, 1, score)).toBe(3); // a surge climbs several layers at once
    expect(nextLayer(2, 0.25, score)).toBe(2); // between layerDown and layerUp: stays
    expect(nextLayer(2, 0.15, score)).toBe(1);
    expect(nextLayer(3, 0.45, score)).toBe(3);
    expect(nextLayer(3, 0, score)).toBe(0);
  });

  it('is shaped by the music mode', () => {
    expect(effectiveLayer('calm', 3)).toBe(0);
    expect(effectiveLayer('build', 3)).toBe(1);
    expect(effectiveLayer('full', 0)).toBe(1); // a live round always has the drums
    expect(effectiveLayer('full', 3)).toBe(3);
  });
});

describe('planStep', () => {
  const voices = (step: number, layer: number, mode: 'calm' | 'build' | 'full' = 'full') => planStep(score, step, layer, mode).map((n) => n.voice);

  it('plays nothing when the music is off', () => {
    expect(planStep(score, 0, 3, 'off')).toEqual([]);
  });

  it('is deterministic and repeats every pattern', () => {
    for (let step = 0; step < 40; step++) {
      expect(planStep(score, step, 3, 'full')).toEqual(planStep(score, step, 3, 'full'));
    }
    expect(voices(3, 1)).toEqual(voices(3 + score.drums.length, 1));
  });

  it('holds a drone note once a bar, at every layer', () => {
    for (const layer of [0, 1, 2, 3]) {
      const drones = Array.from({ length: score.stepsPerBar * 4 }, (_, step) => planStep(score, step, layer, 'full').filter((n) => n.voice === 'drone').length);
      expect(drones.reduce((a, b) => a + b, 0)).toBe(4);
      expect(drones[0]).toBe(1);
    }
  });

  it('keeps layer 0 to a quiet bass drum on the beat', () => {
    for (let step = 0; step < score.drums.length; step++) {
      const notes = planStep(score, step, 0, 'calm').filter((n) => n.voice !== 'drone');
      expect(notes.every((n) => n.voice === 'bassDrum')).toBe(true);
      if (notes.length > 0) expect(step % score.stepsPerBeat).toBe(0);
    }
  });

  it('adds the drums at layer 1, the lead at 2, and claps with an octave shadow at 3', () => {
    const count = (layer: number, voice: string) =>
      Array.from({ length: score.drums.length * score.phrases.length }, (_, step) => planStep(score, step, layer, 'full').filter((n) => n.voice === voice).length).reduce((a, b) => a + b, 0);
    expect(count(1, 'rimDrum')).toBeGreaterThan(0);
    expect(count(1, 'reed')).toBe(0);
    expect(count(2, 'reed')).toBeGreaterThan(0);
    expect(count(2, 'clap')).toBe(0);
    expect(count(3, 'clap')).toBeGreaterThan(0);
    expect(count(3, 'reed')).toBe(2 * count(2, 'reed')); // every lead note is doubled an octave up
  });

  it('lasts as long as the phrase says: a hold lengthens the note instead of retriggering it', () => {
    // Phrase 0 ends "0--": a note held for three steps.
    const lastNote = planStep(score, score.drums.length - 3, 2, 'full').find((n) => n.voice === 'reed');
    expect(lastNote).toMatchObject({ voice: 'reed', steps: 3 });
    expect(planStep(score, score.drums.length - 2, 2, 'full').some((n) => n.voice === 'reed')).toBe(false);
  });

  it('plays the phrases in turn', () => {
    const firstNotes = score.phrases.map((_, i) => planStep(score, i * score.drums.length, 2, 'full').find((n) => n.voice === 'reed'));
    expect(firstNotes.every((note) => note !== undefined)).toBe(true);
    const freqs = firstNotes.map((note) => (note as { freq: number }).freq);
    expect(new Set(freqs).size).toBeGreaterThan(1); // the phrases do not all start on the same note
  });
});
