export interface Summary {
  count: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

/**
 * Records a stream of measurements (e.g. latencies in ms) in a fixed-size ring, so memory stays bounded
 * however long the server runs. Percentiles are over the most recent `capacity` samples; `count` and `max`
 * cover everything since creation or the last `reset()`.
 */
export class Histogram {
  private readonly samples: number[];
  private next = 0;
  private filled = 0;
  private total = 0;
  private sum = 0;
  private maxSeen = 0;

  constructor(private readonly capacity = 20_000) {
    this.samples = new Array<number>(capacity).fill(0);
  }

  record(value: number): void {
    this.samples[this.next] = value;
    this.next = (this.next + 1) % this.capacity;
    this.filled = Math.min(this.filled + 1, this.capacity);
    this.total++;
    this.sum += value;
    if (value > this.maxSeen) this.maxSeen = value;
  }

  reset(): void {
    this.next = this.filled = this.total = this.sum = this.maxSeen = 0;
  }

  summary(): Summary {
    if (this.total === 0) return { count: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    const sorted = this.samples.slice(0, this.filled).sort((a, b) => a - b);
    const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
    return { count: this.total, mean: this.sum / this.total, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: this.maxSeen };
  }
}
