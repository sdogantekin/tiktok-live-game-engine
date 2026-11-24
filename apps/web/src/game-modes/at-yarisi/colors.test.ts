import { describe, expect, it } from 'vitest';
import { colorsFor, RacerColors, SILKS_PALETTE } from './colors';

const ids = (n: number, prefix = 'r') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('RacerColors', () => {
  it('gives every racer on the grid a different colour, in palette order', () => {
    const colors = new RacerColors();
    colors.sync(ids(10));
    const given = ids(10).map((id) => colors.colorOf(id));
    expect(new Set(given).size).toBe(10);
    expect(given).toEqual(SILKS_PALETTE.slice(0, 10));
  });

  it('keeps a racer\'s colour while it stays, and hands a leaver\'s colour to the next newcomer', () => {
    const colors = new RacerColors();
    colors.sync(['a', 'b', 'c']);
    const b = colors.colorOf('b');
    colors.sync(['a', 'b', 'c', 'd']);
    expect(colors.colorOf('b')).toBe(b);
    expect(colors.colorOf('d')).toBe(SILKS_PALETTE[3]);
    colors.sync(['a', 'c', 'd']); // b leaves
    colors.sync(['a', 'c', 'd', 'e']);
    expect(colors.colorOf('e')).toBe(b); // takes the freed colour
    expect(colors.colorOf('a')).toBe(SILKS_PALETTE[0]);
  });

  it('is the same however often it is asked with the same racers', () => {
    const colors = new RacerColors();
    colors.sync(ids(5));
    const before = ids(5).map((id) => colors.colorOf(id));
    colors.sync(ids(5));
    colors.sync(ids(5));
    expect(ids(5).map((id) => colors.colorOf(id))).toEqual(before);
  });

  it('falls back to a colour made from the id for a stranger, and past the palette', () => {
    const colors = new RacerColors();
    expect(colors.colorOf('nobody')).toMatch(/^hsl\(/);
    colors.sync(ids(SILKS_PALETTE.length + 2));
    expect(colors.colorOf(`r${SILKS_PALETTE.length + 1}`)).toMatch(/^hsl\(/);
  });

  it('has colours that are all different from each other', () => {
    expect(new Set(SILKS_PALETTE).size).toBe(SILKS_PALETTE.length);
  });

  it('is synced once per view by colorsFor', () => {
    const view = { seq: 100_001, racers: [{ id: 'x1' }, { id: 'x2' }] };
    const a = colorsFor(view);
    const b = colorsFor(view);
    expect(a).toBe(b);
    expect(a.colorOf('x1')).not.toBe(a.colorOf('x2'));
  });
});
