import type { RaceView } from '@live-game/contracts';
import { describe, expect, it } from 'vitest';
import { RaceSmoother } from './smoothing';

const racer = (id: string, distance: number, speed = 16, place: number | null = null) => ({ id, name: id, distance, speed, boost: 0, place });
const view = (seq: number, racers: ReturnType<typeof racer>[], stage: RaceView['stage'] = 'racing'): RaceView => ({ kind: 'race', seq, serverNow: seq * 100, stage, laps: 6, lapLength: 400, racers, waiting: 0, capacity: 10 });

describe('RaceSmoother', () => {
  it('draws nothing before the first view', () => {
    expect(new RaceSmoother().step(0, 16)).toEqual([]);
  });

  it('starts a horse where the server says it is', () => {
    const smoother = new RaceSmoother();
    smoother.push(view(1, [racer('a', 100)]), 0);
    expect(smoother.step(0, 16)[0]!.distance).toBe(100);
  });

  it('moves smoothly between views, a little further each frame, and never backwards', () => {
    const smoother = new RaceSmoother();
    smoother.push(view(1, [racer('a', 100)]), 0);
    smoother.step(0, 16);
    let previous = 100;
    for (let t = 16; t <= 100; t += 16) {
      const now = smoother.step(t, 16)[0]!.distance;
      expect(now).toBeGreaterThanOrEqual(previous);
      expect(now - previous).toBeLessThan(0.5); // 16 m/s is about a quarter metre a frame
      previous = now;
    }
    smoother.push(view(2, [racer('a', 101.6)]), 100);
    expect(smoother.step(116, 16)[0]!.distance).toBeGreaterThanOrEqual(previous);
  });

  it('does not run on without end when views stop arriving', () => {
    const smoother = new RaceSmoother();
    smoother.push(view(1, [racer('a', 100, 20)]), 0);
    smoother.step(0, 16);
    let distance = 0;
    for (let t = 16; t <= 5000; t += 16) distance = smoother.step(t, 16)[0]!.distance;
    expect(distance).toBeLessThan(100 + 20 * 0.26); // at most about a quarter second ahead
  });

  it('takes a big jump at once (a new race starts at zero)', () => {
    const smoother = new RaceSmoother();
    smoother.push(view(1, [racer('a', 2399)]), 0);
    smoother.step(0, 16);
    smoother.push(view(2, [racer('a', 0, 0)], 'grid'), 10);
    expect(smoother.step(16, 16)[0]!.distance).toBe(0);
  });

  it('drops late or repeated views and forgets horses that left', () => {
    const smoother = new RaceSmoother();
    smoother.push(view(5, [racer('a', 100), racer('b', 90)]), 0);
    smoother.push(view(4, [racer('a', 1)]), 1);
    smoother.push(view(5, [racer('a', 2)]), 2);
    expect(smoother.step(3, 16).map((r) => r.id)).toEqual(['a', 'b']);
    smoother.push(view(6, [racer('a', 101)]), 4);
    expect(smoother.step(5, 16).map((r) => r.id)).toEqual(['a']);
  });

  it('places finished horses exactly at the line (no guessing past it)', () => {
    const smoother = new RaceSmoother();
    smoother.push(view(1, [racer('a', 2400, 20, 1)], 'finished'), 0);
    smoother.step(0, 16);
    expect(smoother.step(200, 16)[0]!.distance).toBe(2400);
  });
});
