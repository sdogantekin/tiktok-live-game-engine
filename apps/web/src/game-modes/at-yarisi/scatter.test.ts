import { describe, expect, it } from 'vitest';
import { scatter, SCENERY_CLEARANCE } from './scatter';
import { shape } from './scene-config';
import { distanceFromTrack } from './track';

const rng = (seed: number) => {
  let a = seed;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
};

describe('scenery scatter', () => {
  it('never puts anything on or beside the track', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const rule of [{ min: 0, max: 200 }, { min: 0, max: 30, where: 'infield' as const }, { min: 16, max: 60, where: 'outside' as const }]) {
        for (const spot of scatter(rng(seed), 200, rule)) expect(distanceFromTrack(shape, spot.x, spot.z)).toBeGreaterThanOrEqual(SCENERY_CLEARANCE);
      }
    }
  });

  it('keeps to the distance band and the side it was asked for', () => {
    const infield = scatter(rng(7), 150, { min: 0, max: 40, where: 'infield' });
    expect(infield.length).toBeGreaterThan(50);
    for (const s of infield) {
      expect(Math.abs(s.x)).toBeLessThan(shape.radius); // inside the oval
      expect(distanceFromTrack(shape, s.x, s.z)).toBeLessThanOrEqual(40);
    }
    for (const s of scatter(rng(8), 150, { min: 20, max: 70, where: 'outside' })) {
      expect(distanceFromTrack(shape, s.x, s.z)).toBeGreaterThanOrEqual(20);
      expect(distanceFromTrack(shape, s.x, s.z)).toBeLessThanOrEqual(70);
    }
  });

  it('keeps out of the stands, is repeatable, and gives each spot a turn and a pick', () => {
    const a = scatter(rng(9), 100, { min: 8, max: 120 });
    const b = scatter(rng(9), 100, { min: 8, max: 120 });
    expect(a).toEqual(b);
    for (const s of a) {
      expect(Math.abs(s.x) > shape.radius + 6 && Math.abs(s.x) < shape.radius + 36 && Math.abs(s.z) < 56).toBe(false);
      expect(s.pick).toBeGreaterThanOrEqual(0);
      expect(s.pick).toBeLessThan(1);
    }
  });

  it('gives up gracefully when the rule cannot be met', () => {
    expect(scatter(rng(1), 10, { min: 500, max: 600 })).toEqual([]);
  });
});
