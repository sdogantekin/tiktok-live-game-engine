import type { LiveView } from '@live-game/contracts';
import { describe, expect, it } from 'vitest';
import { LiveFeed } from './live-feed';

const view = (seq: number): LiveView => ({ kind: 'race', seq, serverNow: seq * 100, stage: 'racing', laps: 6, lapLength: 400, racers: [], waiting: 0, capacity: 10 });

describe('LiveFeed', () => {
  it('keeps the newest view and tells subscribers', () => {
    const feed = new LiveFeed();
    let calls = 0;
    feed.subscribe(() => calls++);
    expect(feed.latest()).toBeNull();
    feed.push(view(1));
    feed.push(view(2));
    expect(feed.latest()?.seq).toBe(2);
    expect(calls).toBe(2);
  });

  it('drops a view that arrives late or twice, so the picture never goes backwards', () => {
    const feed = new LiveFeed();
    let calls = 0;
    feed.push(view(5));
    feed.subscribe(() => calls++);
    feed.push(view(4));
    feed.push(view(5));
    expect(feed.latest()?.seq).toBe(5);
    expect(calls).toBe(0);
  });

  it('can be reset, and stops telling an unsubscribed listener', () => {
    const feed = new LiveFeed();
    let calls = 0;
    const off = feed.subscribe(() => calls++);
    feed.push(view(1));
    off();
    feed.reset();
    expect(feed.latest()).toBeNull();
    expect(calls).toBe(1);
    feed.reset(); // already empty: nothing to announce
  });
});
