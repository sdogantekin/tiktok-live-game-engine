import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { stripedStrip } from './Parcours';
import { shape } from './scene-config';
import { distanceFromTrack } from './track';

const position = (g: THREE.BufferGeometry) => g.getAttribute('position');

describe('stripedStrip', () => {
  const light = new THREE.Color('#ffffff');
  const dark = new THREE.Color('#000000');
  const strip = stripedStrip(10, 20, 8, (i) => (i % 2 === 0 ? light : dark));

  it('covers the lap in stripes of the asked length, alternating in colour', () => {
    const colors = strip.getAttribute('color');
    const stripes = Math.ceil(shape.lapLength / 8);
    expect(position(strip).count).toBe(stripes * 3 * 4); // each stripe is three short quads
    expect(colors.getX(0)).toBe(1); // the first stripe is light
    expect(colors.getX(3 * 4)).toBe(0); // the next is dark
  });

  it('lies between the two lateral offsets, flat on the ground', () => {
    const p = position(strip);
    for (let i = 0; i < p.count; i++) {
      expect(p.getY(i)).toBeCloseTo(0.02, 5);
      const d = distanceFromTrack(shape, p.getX(i), p.getZ(i));
      expect(d).toBeGreaterThanOrEqual(10 - 1e-3);
      expect(d).toBeLessThanOrEqual(20 + 1e-3);
    }
  });

  it('can be built on the inside as well, and a stripe that ends the lap is not longer than the step', () => {
    const inside = stripedStrip(-20, -10, 7, () => light);
    const p = position(inside);
    for (let i = 0; i < p.count; i++) {
      const d = distanceFromTrack(shape, p.getX(i), p.getZ(i));
      expect(d).toBeGreaterThanOrEqual(10 - 1e-3);
      expect(d).toBeLessThanOrEqual(20 + 1e-3);
    }
    expect(inside.getIndex()!.count).toBe((p.count / 4) * 6);
  });
});
