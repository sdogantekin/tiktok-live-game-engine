import { describe, expect, it } from 'vitest';
import { Histogram } from './metrics';

describe('Histogram', () => {
  it('reports zeros when empty', () => {
    expect(new Histogram().summary()).toEqual({ count: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 });
  });

  it('computes percentiles, mean, max and count', () => {
    const h = new Histogram();
    for (let i = 1; i <= 100; i++) h.record(i);
    const s = h.summary();
    expect(s.count).toBe(100);
    expect(s.mean).toBe(50.5);
    expect(s.p50).toBe(51);
    expect(s.p95).toBe(96);
    expect(s.p99).toBe(100);
    expect(s.max).toBe(100);
  });

  it('keeps memory bounded: percentiles use the latest samples while count and max cover everything', () => {
    const h = new Histogram(10);
    h.record(1000); // an old outlier
    for (let i = 0; i < 100; i++) h.record(1);
    const s = h.summary();
    expect(s.count).toBe(101);
    expect(s.max).toBe(1000);
    expect(s.p99).toBe(1); // the outlier has left the ring
  });

  it('can be reset between scenarios', () => {
    const h = new Histogram();
    h.record(5);
    h.reset();
    expect(h.summary().count).toBe(0);
  });
});
