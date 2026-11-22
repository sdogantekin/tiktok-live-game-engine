export interface RateSpec {
  /** Burst size: tokens available when idle. */
  capacity: number;
  perSecond: number;
}

export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly spec: RateSpec,
    now: number,
  ) {
    this.tokens = spec.capacity;
    this.updatedAt = now;
  }

  tryTake(now: number): boolean {
    const elapsedSeconds = Math.max(0, now - this.updatedAt) / 1000;
    this.tokens = Math.min(this.spec.capacity, this.tokens + elapsedSeconds * this.spec.perSecond);
    this.updatedAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** One token bucket per key, with a bounded key count (the oldest key is forgotten when full). */
export class KeyedRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly spec: RateSpec,
    private readonly maxKeys = 10_000,
  ) {}

  tryTake(key: string, now: number): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) {
        const oldest = this.buckets.keys().next().value;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      bucket = new TokenBucket(this.spec, now);
      this.buckets.set(key, bucket);
    }
    return bucket.tryTake(now);
  }

  get size(): number {
    return this.buckets.size;
  }
}
