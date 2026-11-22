/** Bounded cache of recently seen event ids for session-level deduplication. */
export class RecentIdCache {
  private readonly ids = new Set<string>();

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new RangeError('capacity must be at least 1');
  }

  /** Returns true if the id was already seen; otherwise records it (evicting the oldest when full). */
  checkAndAdd(id: string): boolean {
    if (this.ids.has(id)) return true;
    this.ids.add(id);
    if (this.ids.size > this.capacity) {
      const oldest = this.ids.values().next().value;
      if (oldest !== undefined) this.ids.delete(oldest);
    }
    return false;
  }

  get size(): number {
    return this.ids.size;
  }
}
