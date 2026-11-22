import { describe, expect, it } from 'vitest';
import { KeyedRateLimiter, TokenBucket } from './rate-limit';
import { RecentIdCache } from './recent-ids';

describe('RecentIdCache', () => {
  it('reports repeats and stays bounded, forgetting the oldest id', () => {
    const cache = new RecentIdCache(3);
    expect(cache.checkAndAdd('a')).toBe(false);
    expect(cache.checkAndAdd('a')).toBe(true);
    cache.checkAndAdd('b');
    cache.checkAndAdd('c');
    cache.checkAndAdd('d'); // evicts 'a'
    expect(cache.size).toBe(3);
    expect(cache.checkAndAdd('a')).toBe(false); // forgotten, so accepted again
    expect(cache.checkAndAdd('d')).toBe(true);
  });

  it('rejects a non-positive capacity', () => {
    expect(() => new RecentIdCache(0)).toThrow(RangeError);
  });
});

describe('TokenBucket', () => {
  it('allows a burst up to capacity, then refills over time', () => {
    const bucket = new TokenBucket({ capacity: 3, perSecond: 3 }, 0);
    expect([1, 2, 3, 4].map(() => bucket.tryTake(0))).toEqual([true, true, true, false]);
    expect(bucket.tryTake(333)).toBe(false); // ~1 token needs 333.4 ms
    expect(bucket.tryTake(334)).toBe(true);
    expect(bucket.tryTake(334)).toBe(false);
  });

  it('never exceeds capacity after a long idle period', () => {
    const bucket = new TokenBucket({ capacity: 2, perSecond: 100 }, 0);
    const taken = [1, 2, 3].map(() => bucket.tryTake(60_000));
    expect(taken).toEqual([true, true, false]);
  });

  it('tolerates the clock moving backwards', () => {
    const bucket = new TokenBucket({ capacity: 1, perSecond: 1 }, 1000);
    expect(bucket.tryTake(1000)).toBe(true);
    expect(bucket.tryTake(500)).toBe(false);
  });
});

describe('KeyedRateLimiter', () => {
  it('limits keys independently', () => {
    const limiter = new KeyedRateLimiter({ capacity: 1, perSecond: 1 });
    expect(limiter.tryTake('a', 0)).toBe(true);
    expect(limiter.tryTake('a', 0)).toBe(false);
    expect(limiter.tryTake('b', 0)).toBe(true);
  });

  it('bounds the number of tracked keys', () => {
    const limiter = new KeyedRateLimiter({ capacity: 1, perSecond: 1 }, 100);
    for (let i = 0; i < 1000; i++) limiter.tryTake(`u${i}`, 0);
    expect(limiter.size).toBe(100);
  });
});
