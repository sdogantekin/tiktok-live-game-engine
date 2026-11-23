import { describe, expect, it } from 'vitest';
import { distanceFromTrack, lapOf, racerColor, trackPoint, trackShape } from './track';

const shape = trackShape(400);

describe('the track', () => {
  it('is exactly one lap long and closes on itself', () => {
    expect(2 * shape.straight + 2 * Math.PI * shape.radius).toBeCloseTo(400, 6);
    const start = trackPoint(shape, 0);
    const end = trackPoint(shape, 399.999999);
    expect(Math.hypot(start.x - end.x, start.z - end.z)).toBeLessThan(0.01);
    expect(trackPoint(shape, 400)).toEqual(trackPoint(shape, 0)); // the next lap starts where this one did
    expect(trackPoint(shape, -10)).toEqual(trackPoint(shape, 390));
  });

  it('has no jumps: half a metre along the line is half a metre on the ground', () => {
    for (const lateral of [0, 1.5, -1.5]) {
      let previous = trackPoint(shape, 0, lateral);
      for (let d = 0.5; d <= 400; d += 0.5) {
        const point = trackPoint(shape, d, lateral);
        const moved = Math.hypot(point.x - previous.x, point.z - previous.z);
        expect(moved, `at ${d} lane ${lateral}`).toBeLessThan(0.6 + Math.abs(lateral) * 0.05);
        expect(moved).toBeGreaterThan(0.3);
        previous = point;
      }
    }
  });

  it('points the way the horse is running', () => {
    for (let d = 1; d < 400; d += 7) {
      const a = trackPoint(shape, d);
      const b = trackPoint(shape, d + 0.01);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      expect(Math.atan2(dx, dz)).toBeCloseTo(Math.atan2(Math.sin(a.heading), Math.cos(a.heading)), 1);
    }
  });

  it('puts a lane on the outside of the bends', () => {
    const inner = trackPoint(shape, 100, 0);
    const outer = trackPoint(shape, 100, 2);
    expect(Math.hypot(outer.x, outer.z + shape.straight / 2)).toBeGreaterThan(Math.hypot(inner.x, inner.z + shape.straight / 2));
  });
});

describe('laps and colours', () => {
  it('counts laps from 1 and never past the last', () => {
    expect(lapOf(0, 400, 6)).toBe(1);
    expect(lapOf(399, 400, 6)).toBe(1);
    expect(lapOf(400, 400, 6)).toBe(2);
    expect(lapOf(2400, 400, 6)).toBe(6);
    expect(lapOf(99999, 400, 6)).toBe(6);
  });

  it('gives a viewer the same colour every time', () => {
    expect(racerColor('tiktok:123')).toBe(racerColor('tiktok:123'));
    expect(racerColor('tiktok:123')).not.toBe(racerColor('tiktok:124'));
    expect(racerColor('x')).toMatch(/^hsl\(\d+, 78%, 55%\)$/);
  });
});

describe('distanceFromTrack', () => {
  it('is zero on the centre line and grows away from it, inside and outside', () => {
    for (let d = 0; d < 400; d += 13) {
      const p = trackPoint(shape, d);
      expect(distanceFromTrack(shape, p.x, p.z)).toBeCloseTo(0, 5);
      const wide = trackPoint(shape, d, 9);
      expect(distanceFromTrack(shape, wide.x, wide.z)).toBeCloseTo(9, 5);
    }
    expect(distanceFromTrack(shape, 0, 0)).toBeCloseTo(shape.radius, 5); // the middle of the infield
    expect(distanceFromTrack(shape, 200, 0)).toBeGreaterThan(150);
  });
});
