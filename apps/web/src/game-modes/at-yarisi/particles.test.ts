import { describe, expect, it } from 'vitest';
import { ParticlePool, type ParticleSpec } from './particles';

const spec = (over: Partial<ParticleSpec> = {}): ParticleSpec => ({ x: 0, y: 1, z: 0, vx: 1, vy: 0, vz: 2, life: 1, size0: 0.2, size1: 1, gravity: 0, heading: 0, tint: 0, ...over });

describe('ParticlePool', () => {
  it('moves and ages particles, and drops them when their life is over', () => {
    const pool = new ParticlePool(4);
    pool.spawn(spec());
    for (let i = 0; i < 10; i++) pool.step(0.05);
    let seen: number[] = [];
    pool.forEach((p) => seen.push(Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100, Math.round(p.t * 100) / 100));
    expect(seen).toEqual([0.5, 1, 0.5]);
    for (let i = 0; i < 10; i++) pool.step(0.05); // the second half second takes it to the end of its life
    expect(pool.alive).toBe(0);
    seen = [];
    pool.forEach((p) => seen.push(p.x));
    expect(seen).toEqual([]);
  });

  it('never holds more than its capacity: the oldest is recycled', () => {
    const pool = new ParticlePool(3);
    for (let i = 0; i < 10; i++) pool.spawn(spec({ tint: i, life: 5 }));
    expect(pool.alive).toBe(3);
    const tints: number[] = [];
    pool.forEach((p) => tints.push(p.tint));
    expect(tints.sort()).toEqual([7, 8, 9]);
  });

  it('pulls things with gravity and lets them land and slide to a stop', () => {
    const pool = new ParticlePool(2);
    pool.spawn(spec({ gravity: 9.8, vx: 4, vz: 0, y: 0.5, life: 10 }));
    for (let i = 0; i < 40; i++) pool.step(0.05);
    let y = -1;
    let vx = 99;
    pool.forEach((p) => {
      y = p.y;
      vx = p.vx;
    });
    expect(y).toBeCloseTo(0.05, 5);
    expect(vx).toBeLessThan(1);
  });

  it('swells to the middle of its life and thins away at both ends', () => {
    const pool = new ParticlePool(1);
    pool.spawn(spec({ life: 1, size0: 0.2, size1: 1.0 }));
    const sizes: number[] = [];
    for (let i = 0; i < 19; i++) {
      pool.step(0.05);
      pool.forEach((p) => sizes.push(p.size));
    }
    const biggest = Math.max(...sizes);
    expect(sizes.indexOf(biggest)).toBe(9); // half way
    expect(sizes[0]!).toBeLessThan(biggest);
    expect(sizes.at(-1)!).toBeLessThan(biggest);
  });

  it('takes a long frame in small steps at most, so a stall does not fling things away', () => {
    const pool = new ParticlePool(1);
    pool.spawn(spec({ vx: 10, vz: 0, life: 10 }));
    pool.step(5);
    let x = 0;
    pool.forEach((p) => (x = p.x));
    expect(x).toBeLessThanOrEqual(0.5 + 1e-9); // 10 m/s for at most 0.05 s
  });

  it('can tell a renderer which slots are free', () => {
    const pool = new ParticlePool(3);
    pool.spawn(spec());
    const free: number[] = [];
    pool.forEach(() => undefined, (slot) => free.push(slot));
    expect(free).toEqual([1, 2]);
  });
});
