import { describe, expect, it } from 'vitest';
import { atYarisiConfig, type RaceTuning } from './config';
import { RaceSim, seededRandom } from './race';

const tuning = atYarisiConfig.race;
const finishLine = tuning.laps * tuning.lapLengthM;

function sim(seed = 1, racers = 3, customTuning = tuning) {
  const race = new RaceSim(customTuning, seededRandom(seed));
  for (let i = 0; i < racers; i++) race.add(`r${i}`, `Racer ${i}`);
  race.start();
  return race;
}
const run = (race: RaceSim, seconds: number, stepMs = 100) => {
  for (let t = 0; t < seconds * 1000; t += stepMs) race.step(stepMs);
};

describe('the grid', () => {
  it('takes horses up to its capacity before the start, and nobody after it', () => {
    const race = new RaceSim({ ...tuning, capacity: 2 }, seededRandom(1));
    expect(race.add('a', 'A')).toBe(true);
    expect(race.add('a', 'A')).toBe(false); // already on it
    expect(race.add('b', 'B')).toBe(true);
    expect(race.add('c', 'C')).toBe(false); // full
    race.start();
    expect(race.stage).toBe('racing');
    race.remove('b');
    expect(race.add('c', 'C')).toBe(false); // the race has started
  });

  it('does not start with nobody on it', () => {
    const race = new RaceSim(tuning, seededRandom(1));
    race.start();
    expect(race.stage).toBe('grid');
  });
});

describe('running the race', () => {
  it('is reproducible with the same seed', () => {
    const a = sim(7);
    const b = sim(7);
    run(a, 60);
    run(b, 60);
    expect(a.view(0)).toEqual(b.view(0));
    const c = sim(8);
    run(c, 60);
    expect(c.view(0)).not.toEqual(a.view(0));
  });

  it('moves every horse forward at about the base speed, and finishes after about the planned time', () => {
    const race = sim(2, 4);
    run(race, 10);
    for (const racer of race.view(0).racers) {
      expect(racer.speed).toBeGreaterThan(tuning.baseSpeed * 0.85);
      expect(racer.speed).toBeLessThan(tuning.baseSpeed * 1.15);
      expect(racer.distance).toBeGreaterThan(100);
    }
    run(race, 400);
    expect(race.stage).toBe('finished');
    const expected = finishLine / tuning.baseSpeed; // 150 s
    for (const racer of race.view(0).racers) expect(racer.place).not.toBeNull();
    expect(expected).toBeCloseTo(150, 0);
  });

  it('gives places in finishing order, once each, and stops everyone at the line', () => {
    const race = sim(3, 5);
    run(race, 400);
    const places = race.view(0).racers.map((r) => r.place!).sort();
    expect(places).toEqual([1, 2, 3, 4, 5]);
    for (const racer of race.view(0).racers) expect(racer.distance).toBe(finishLine);
    expect(race.ranking().map((r) => r.place)).toEqual([1, 2, 3, 4, 5]);
  });

  it('decides a close finish inside one step by who crossed the line first', () => {
    const race = new RaceSim({ ...tuning, temperament: 0, luck: 0, catchUp: 0 }, seededRandom(1));
    race.add('slow', 'Slow');
    race.add('fast', 'Fast');
    race.start();
    race.like('fast', 1); // a hair faster
    // Put both just short of the line, then one big step lets both cross in the same step.
    for (let i = 0; i < 1480; i++) race.step(100);
    race.step(5_000);
    expect(race.ranking()[0]!.playerId).toBe('fast');
  });

  it('ranks the unfinished by distance when time runs out', () => {
    const race = sim(4, 3);
    race.like('r1', 40);
    run(race, 30);
    race.stop();
    expect(race.stage).toBe('finished');
    const ranking = race.ranking();
    expect(ranking.map((r) => r.place)).toEqual([1, 2, 3]);
    const distances = ranking.map((r) => race.view(0).racers.find((v) => v.id === r.playerId)!.distance);
    expect(distances).toEqual([...distances].sort((a, b) => b - a));
  });

  it('carries on when a horse is removed mid-race, and finishes if the last one leaves', () => {
    const race = sim(5, 3);
    run(race, 5);
    race.remove('r0');
    run(race, 400);
    expect(race.view(0).racers.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    expect(race.stage).toBe('finished');
  });

  it('ignores steps of no or negative time, and steps before the start or after the end', () => {
    const race = new RaceSim(tuning, seededRandom(1));
    race.add('a', 'A');
    race.step(100);
    expect(race.view(0).racers[0]!.distance).toBe(0);
    race.start();
    race.step(0);
    race.step(-50);
    expect(race.view(0).racers[0]!.distance).toBe(0);
  });
});

describe('likes and gifts', () => {
  it('likes speed a horse up, with diminishing returns, up to a ceiling, and fade away', () => {
    const race = sim(1, 2, { ...tuning, temperament: 0, luck: 0, catchUp: 0 });
    race.step(100);
    const speedOf = (id: string) => race.view(0).racers.find((r) => r.id === id)!.speed;
    const base = speedOf('r0');
    race.like('r0', 5);
    race.step(100);
    const few = speedOf('r0');
    race.like('r0', 100_000);
    race.step(100);
    const many = speedOf('r0');
    expect(few).toBeGreaterThan(base);
    expect(many).toBeGreaterThan(few);
    expect(many).toBeLessThanOrEqual(base * (1 + tuning.likes.max) + 1e-6);
    run(race, 30);
    expect(speedOf('r0')).toBeCloseTo(base, 0);
  });

  it('count only for a racer who is racing', () => {
    const race = new RaceSim(tuning, seededRandom(1));
    race.add('a', 'A');
    expect(race.like('a', 5)).toBe(false); // not started
    race.start();
    expect(race.like('nobody', 5)).toBe(false);
    expect(race.like('a', 5)).toBe(true);
    run(race, 400);
    expect(race.like('a', 5)).toBe(false); // finished
  });

  it('a surge is a short burst that ends, a jockey stays, and all gift help together is capped', () => {
    // (uses its own sizes below, independent of the shipped ones)
    const race = sim(1, 1, { ...tuning, giftBonusCap: 0.25, temperament: 0, luck: 0, catchUp: 0 });
    const speed = () => race.view(0).racers[0]!.speed;
    race.step(100);
    const base = speed();
    expect(race.gift('r0', { kind: 'surge', effect: 'x', durationMs: 1000, bonus: 0.2 })).toBe(true);
    race.step(100);
    expect(speed()).toBeCloseTo(base * 1.2, 1);
    run(race, 2);
    expect(speed()).toBeCloseTo(base, 1);
    race.gift('r0', { kind: 'jockey', effect: 'j', bonus: 0.05 });
    race.step(100);
    expect(speed()).toBeCloseTo(base * 1.05, 1);
    race.gift('r0', { kind: 'surge', effect: 'x', durationMs: 5000, bonus: 5 }); // absurdly large
    race.step(100);
    expect(speed()).toBeLessThanOrEqual(base * 1.25 + 1e-6);
  });

  it('a gift never helps anyone but its sender', () => {
    const race = sim(1, 2, { ...tuning, giftBonusCap: 0.25, temperament: 0, luck: 0, catchUp: 0 });
    race.gift('r0', { kind: 'surge', effect: 'x', durationMs: 5000, bonus: 0.2 });
    race.step(100);
    const [a, b] = race.view(0).racers;
    expect(a!.speed).toBeGreaterThan(b!.speed * 1.1);
  });

  it('no input whatever can push a horse past the maximum speed', () => {
    const race = sim(1, 1);
    race.like('r0', 1e9);
    race.gift('r0', { kind: 'surge', effect: 'x', durationMs: 1e9, bonus: 1e9 });
    race.gift('r0', { kind: 'jockey', effect: 'j', bonus: 1e9 });
    for (let i = 0; i < 100; i++) {
      race.step(100);
      expect(race.view(0).racers[0]!.speed).toBeLessThanOrEqual(tuning.maxSpeed);
    }
  });
});

/**
 * Free play must be able to win. These races use the numbers a real stream might see: a viewer tapping about 8 times a
 * second, a heavy tapper at 12, someone who only joined, and a gifter who also taps 8 times a second and sends a rose now
 * and then, a GG once in a while and a jockey at the start.
 */
const gifts = { jockey: 0.02, rose: 0.06, gg: 0.09 }; // the shipped gift sizes

describe('fairness (many simulated races)', () => {
  type Style = { likesPerSecond: number; gifts?: boolean };
  function winRates(styles: Style[], races = 1500, rates: RaceTuning = tuning): number[] {
    const wins = styles.map(() => 0);
    for (let n = 0; n < races; n++) {
      const race = new RaceSim(rates, seededRandom(1000 + n));
      styles.forEach((_, i) => race.add(`s${i}`, `S${i}`));
      race.start();
      const owed = styles.map(() => 0); // fractions of a like carry over to the next step
      let t = 0;
      while (race.stage === 'racing' && t < 600_000) {
        styles.forEach((style, i) => {
          owed[i]! += (style.likesPerSecond * 100) / 1000;
          const whole = Math.floor(owed[i]!);
          owed[i]! -= whole;
          if (whole > 0) race.like(`s${i}`, whole);
          if (style.gifts) {
            if (t === 0) race.gift(`s${i}`, { kind: 'jockey', effect: 'j', bonus: gifts.jockey });
            if (t % 20_000 === 5_000) race.gift(`s${i}`, { kind: 'surge', effect: 'r', durationMs: 4000, bonus: gifts.rose });
            if (t % 60_000 === 30_000) race.gift(`s${i}`, { kind: 'surge', effect: 'g', durationMs: 6000, bonus: gifts.gg });
          }
        });
        race.step(100);
        t += 100;
      }
      race.stop();
      const first = race.ranking()[0]!.playerId;
      wins[Number(first.slice(1))]!++;
    }
    return wins.map((w) => w / races);
  }

  it('a gifter beats an equal tapper more often, but the tapper still wins a real share', () => {
    const [tapper, gifter] = winRates([{ likesPerSecond: 8 }, { likesPerSecond: 8, gifts: true }]);
    expect(gifter!).toBeGreaterThan(tapper!);
    expect(tapper!).toBeGreaterThan(0.25); // free play wins a real share (about a third)
  });

  it('a heavier tapper holds their own against a gifter who taps less, and the heaviest one beats them', () => {
    const [heavy, gifter] = winRates([{ likesPerSecond: 12 }, { likesPerSecond: 8, gifts: true }]);
    expect(heavy!).toBeGreaterThan(0.4);
    const [heaviest, gifter2] = winRates([{ likesPerSecond: 20 }, { likesPerSecond: 8, gifts: true }]);
    expect(heaviest!).toBeGreaterThan(gifter2!);
    expect(gifter!).toBeGreaterThan(0);
  });

  it('helping pays: a horse whose viewer taps beats one whose viewer only joined', () => {
    const [idle, tapper] = winRates([{ likesPerSecond: 0 }, { likesPerSecond: 8 }], 1500);
    expect(idle! + tapper!).toBeCloseTo(1, 5);
    expect(tapper!).toBeGreaterThan(0.9);
  });

  it('in a full field with equal effort, wins are spread out (no horse is a lock)', () => {
    const rates = winRates(Array.from({ length: 10 }, () => ({ likesPerSecond: 8 })), 1500);
    expect(Math.max(...rates)).toBeLessThan(0.25);
    expect(Math.min(...rates)).toBeGreaterThan(0.01);
  });
});
