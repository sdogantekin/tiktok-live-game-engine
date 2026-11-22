import { NormalizedEventSchema } from '@live-game/contracts';
import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { burstScenario, chaosScenario, steadyScenario } from './scenarios';

const base = { seed: 7, viewers: 50, startAt: 1_000_000 };

describe('Rng', () => {
  it('is deterministic per seed and stays in range', () => {
    const a = new Rng(1);
    const b = new Rng(1);
    const seq = Array.from({ length: 20 }, () => a.next());
    expect(seq).toEqual(Array.from({ length: 20 }, () => b.next()));
    expect(seq.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(new Rng(2).next()).not.toBe(new Rng(1).next());
  });

  it('weighted picks follow the weights roughly', () => {
    const rng = new Rng(3);
    const items = [
      { value: 'a', weight: 9 },
      { value: 'b', weight: 1 },
    ];
    const picks = Array.from({ length: 2000 }, () => rng.pickWeighted(items));
    const aShare = picks.filter((p) => p === 'a').length / picks.length;
    expect(aShare).toBeGreaterThan(0.85);
    expect(aShare).toBeLessThan(0.95);
  });
});

describe('steadyScenario', () => {
  const options = { ...base, viewers: 200, joinWindowMs: 20_000, durationMs: 120_000, eventsPerSecond: 25, giftRate: 0.02 };

  it('is repeatable for a seed and different for another', () => {
    expect(steadyScenario(options)).toEqual(steadyScenario(options));
    expect(steadyScenario({ ...options, seed: 8 })).not.toEqual(steadyScenario(options));
  });

  it('is time-ordered, valid, and has one join per viewer inside the join window', () => {
    const events = steadyScenario(options);
    expect(events.every((e, i) => i === 0 || events[i - 1]!.atMs <= e.atMs)).toBe(true);
    expect(events.every((e) => NormalizedEventSchema.safeParse(e.raw).success)).toBe(true);

    const joins = events.filter((e) => {
      const raw = e.raw as { payload: { text?: string } };
      return raw.payload.text === 'gelin' || raw.payload.text === 'damat';
    });
    expect(joins).toHaveLength(200);
    expect(joins.every((e) => e.atMs < 20_000)).toBe(true);
  });

  it('produces roughly the requested event rate and includes gifts', () => {
    const events = steadyScenario(options);
    const rate = events.length / 120;
    expect(rate).toBeGreaterThan(18);
    expect(rate).toBeLessThan(32);
    expect(events.some((e) => (e.raw as { kind: string }).kind === 'gift.received')).toBe(true);
  });
});

describe('burstScenario', () => {
  it('sends one event per viewer within the spread', () => {
    const events = burstScenario({ ...base, viewers: 200, atMs: 5_000, spreadMs: 2_000, text: 'halay' });
    expect(events).toHaveLength(200);
    expect(events.every((e) => e.atMs >= 5_000 && e.atMs < 7_000)).toBe(true);
  });
});

describe('chaosScenario', () => {
  const events = chaosScenario({ ...base, durationMs: 60_000, episodes: 400 });

  it('mixes valid events, junk, and exact duplicates', () => {
    const valid = events.filter((e) => NormalizedEventSchema.safeParse(e.raw).success);
    const invalid = events.length - valid.length;
    expect(invalid).toBeGreaterThan(0);
    expect(valid.length).toBeGreaterThan(0);

    const ids = valid.map((e) => (e.raw as { eventId: string }).eventId);
    expect(new Set(ids).size).toBeLessThan(ids.length); // duplicates present
  });

  it('is repeatable', () => {
    expect(chaosScenario({ ...base, durationMs: 60_000, episodes: 400 })).toEqual(events);
  });
});
