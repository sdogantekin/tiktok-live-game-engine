import { describe, expect, it } from 'vitest';
import { leadingRacers, RAIL_TAG_COUNT, RAIL_TAG_SIZE, separateTags } from './railtags';

const racer = (id: string, distance: number, place: number | null = null) => ({ id, distance, place });

describe('leadingRacers', () => {
  it('picks the first three by distance while the race is on', () => {
    const picked = leadingRacers([racer('d', 100), racer('a', 900), racer('c', 400), racer('b', 800), racer('e', 50)]);
    expect(picked.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(RAIL_TAG_COUNT).toBe(3);
  });

  it('puts the finishers first, in the order they finished, then the rest by distance', () => {
    const picked = leadingRacers([racer('late', 2300), racer('second', 2400, 2), racer('winner', 2400, 1), racer('third', 2400, 3)]);
    expect(picked.map((r) => r.id)).toEqual(['winner', 'second', 'third']);
    const mixed = leadingRacers([racer('x', 2390), racer('winner', 2400, 1), racer('y', 2380)]);
    expect(mixed.map((r) => r.id)).toEqual(['winner', 'x', 'y']);
  });

  it('copes with fewer than three horses and leaves its input alone', () => {
    const input = [racer('b', 1), racer('a', 2)];
    expect(leadingRacers(input).map((r) => r.id)).toEqual(['a', 'b']);
    expect(input.map((r) => r.id)).toEqual(['b', 'a']);
    expect(leadingRacers([])).toEqual([]);
  });
});

describe('separateTags', () => {
  it('leaves tags that do not touch where they are', () => {
    expect(separateTags([{ x: 0.2, y: 0.6 }, { x: 0.8, y: 0.6 }])).toEqual([0.6, 0.6]);
    expect(separateTags([{ x: 0.5, y: 0.8 }, { x: 0.5, y: 0.5 }])).toEqual([0.8, 0.5]);
  });

  it('moves a tag up, a tag height at a time, until it clears the better-placed one', () => {
    const [first, second, third] = separateTags([{ x: 0.5, y: 0.7 }, { x: 0.55, y: 0.7 }, { x: 0.5, y: 0.7 }]);
    expect(first).toBe(0.7);
    expect(second).toBeCloseTo(0.7 - RAIL_TAG_SIZE.h, 6);
    expect(third).toBeCloseTo(0.7 - 2 * RAIL_TAG_SIZE.h, 6);
  });

  it('never pushes a tag off the top of the window', () => {
    const ys = separateTags(Array.from({ length: 10 }, () => ({ x: 0.5, y: 0.4 })));
    for (const y of ys) expect(y).toBeGreaterThanOrEqual(0.4 - 10 * RAIL_TAG_SIZE.h);
    expect(Math.min(...ys)).toBeGreaterThan(0.16 - RAIL_TAG_SIZE.h - 1e-9);
  });
});
