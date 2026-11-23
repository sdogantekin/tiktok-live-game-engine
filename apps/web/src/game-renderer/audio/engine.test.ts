import { describe, expect, it } from 'vitest';
import { volumeToGain } from './engine';

describe('volumeToGain', () => {
  it('is silent at 0, below full scale at 1, clamped, and rises smoothly', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBeLessThan(1);
    expect(volumeToGain(5)).toBe(volumeToGain(1));
    expect(volumeToGain(-1)).toBe(0);
    expect(volumeToGain(0.5)).toBeLessThan(volumeToGain(0.6));
    expect(volumeToGain(0.5)).toBeLessThan(volumeToGain(1) / 2 + 1e-9); // quieter than linear: even to the ear
  });
});
