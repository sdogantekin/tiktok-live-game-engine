/** Small seeded PRNG (mulberry32) so simulator scenarios are exactly repeatable. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(items.length)];
    if (item === undefined) throw new Error('Cannot pick from an empty list');
    return item;
  }

  /** Picks by relative weight. */
  pickWeighted<T>(items: readonly { value: T; weight: number }[]): T {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let roll = this.next() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll < 0) return item.value;
    }
    const last = items[items.length - 1];
    if (!last) throw new Error('Cannot pick from an empty list');
    return last.value;
  }

  /** Exponentially distributed delay with the given mean (Poisson arrivals). */
  exponential(meanMs: number): number {
    return -Math.log(1 - this.next()) * meanMs;
  }
}
