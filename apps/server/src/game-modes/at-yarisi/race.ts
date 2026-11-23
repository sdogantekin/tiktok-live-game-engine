import type { LiveViewBody, RankingEntry } from '@live-game/contracts';
import type { RaceGift, RaceTuning } from './config';

/** A small seedable random source (mulberry32), so a race is reproducible in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type RaceStage = 'grid' | 'racing' | 'finished';

interface Racer {
  id: string;
  name: string;
  /** This horse's own pace: a little above or below average for the whole race. */
  temperament: number;
  /** A slowly wandering stroke of luck in -1..1. */
  luck: number;
  distance: number;
  speed: number;
  likeBoost: number;
  surge: { bonus: number; msLeft: number } | null;
  jockeyBonus: number;
  /** Race time (seconds) at which the racer crossed the line, or null. */
  finishedAt: number | null;
  place: number | null;
}

/**
 * The race itself: pure maths with no knowledge of viewers, rounds or sockets. Each horse's speed is its own base pace,
 * times what likes and gifts added (both capped, gifts lower than likes), times a little luck and a mild catch-up, and
 * never above `maxSpeed`. The engine decides when it steps; this only advances by the time it is given.
 */
export class RaceSim {
  stage: RaceStage = 'grid';
  private readonly racers = new Map<string, Racer>();
  private raceTime = 0;
  private nextPlace = 1;

  constructor(
    private readonly tuning: RaceTuning,
    private readonly random: () => number = Math.random,
  ) {}

  get size(): number {
    return this.racers.size;
  }

  has(id: string): boolean {
    return this.racers.has(id);
  }

  ids(): string[] {
    return [...this.racers.keys()];
  }

  /** Puts a horse on the grid. Only before the start, and only while there is room. */
  add(id: string, name: string): boolean {
    if (this.stage !== 'grid' || this.racers.has(id) || this.racers.size >= this.tuning.capacity) return false;
    this.racers.set(id, {
      id,
      name,
      temperament: 1 + (this.random() * 2 - 1) * this.tuning.temperament,
      luck: 0,
      distance: 0,
      speed: 0,
      likeBoost: 0,
      surge: null,
      jockeyBonus: 0,
      finishedAt: null,
      place: null,
    });
    return true;
  }

  rename(id: string, name: string): void {
    const racer = this.racers.get(id);
    if (racer) racer.name = name;
  }

  /** Takes a horse out (the viewer left). During a race the others carry on. */
  remove(id: string): void {
    this.racers.delete(id);
  }

  start(): void {
    if (this.stage === 'grid' && this.racers.size > 0) this.stage = 'racing';
  }

  /** Likes from a racer's own viewer add a boost that is bigger when it is small and cannot pass `likes.max`. */
  like(id: string, count: number): boolean {
    const racer = this.racers.get(id);
    if (!racer || this.stage !== 'racing' || racer.place !== null) return false;
    const { perLike, max } = this.tuning.likes;
    // `count` likes in one go: each closes a fraction `perLike / max` of the gap to the ceiling (closed form, so a huge count costs nothing).
    const gap = max - racer.likeBoost;
    racer.likeBoost = max - gap * Math.pow(1 - perLike / max, count);
    return true;
  }

  /** A gift helps its own racer only. One surge at a time (a stronger one replaces a weaker one); a jockey stays. */
  gift(id: string, gift: RaceGift): boolean {
    const racer = this.racers.get(id);
    if (!racer || this.stage !== 'racing' || racer.place !== null) return false;
    if (gift.kind === 'jockey') racer.jockeyBonus = Math.max(racer.jockeyBonus, gift.bonus);
    else if (!racer.surge || gift.bonus >= racer.surge.bonus) racer.surge = { bonus: gift.bonus, msLeft: gift.durationMs };
    return true;
  }

  /** How much gifts are adding to a racer right now, never above the cap. */
  private giftBonus(racer: Racer): number {
    return Math.min(this.tuning.giftBonusCap, racer.jockeyBonus + (racer.surge?.bonus ?? 0));
  }

  step(dtMs: number): void {
    if (this.stage !== 'racing' || dtMs <= 0) return;
    const dt = dtMs / 1000;
    const { tuning } = this;
    const finishLine = tuning.laps * tuning.lapLengthM;
    const running = [...this.racers.values()].filter((r) => r.place === null);
    const mean = running.length > 0 ? running.reduce((sum, r) => sum + r.distance, 0) / running.length : 0;
    const startTime = this.raceTime;
    this.raceTime += dt;

    const finishers: { racer: Racer; at: number }[] = [];
    for (const racer of running) {
      // Luck wanders: it drifts back to zero and is pushed about at random, so any horse can have a good or a bad stretch.
      racer.luck = Math.max(-1, Math.min(1, racer.luck * (1 - dt / 2) + (this.random() * 2 - 1) * Math.sqrt(dt) * 0.5));
      racer.likeBoost *= Math.exp(-dt / tuning.likes.fadeSeconds);
      if (racer.likeBoost < 1e-4) racer.likeBoost = 0;
      if (racer.surge) {
        racer.surge.msLeft -= dtMs;
        if (racer.surge.msLeft <= 0) racer.surge = null;
      }

      const steadier = racer.jockeyBonus > 0 ? 0.5 : 1; // a jockey halves the luck
      const luck = 1 + tuning.luck * racer.luck * steadier;
      const catchUp = 1 + Math.max(-0.5, Math.min(0.5, (mean - racer.distance) / tuning.lapLengthM)) * 2 * tuning.catchUp;
      const help = 1 + racer.likeBoost + this.giftBonus(racer);
      racer.speed = Math.min(tuning.maxSpeed, tuning.baseSpeed * racer.temperament * help * luck * catchUp);

      const before = racer.distance;
      racer.distance += racer.speed * dt;
      if (racer.distance >= finishLine) {
        // Exactly when in this step the line was crossed, so a tie within one step is decided fairly.
        finishers.push({ racer, at: startTime + (racer.speed > 0 ? (finishLine - before) / racer.speed : dt) });
      }
    }

    finishers.sort((a, b) => a.at - b.at);
    for (const { racer, at } of finishers) {
      racer.distance = finishLine;
      racer.finishedAt = at;
      racer.place = this.nextPlace++;
    }
    if (this.racers.size > 0 && [...this.racers.values()].every((r) => r.place !== null)) this.stage = 'finished';
  }

  /** Ends the race where it is (time ran out): the stage is finished and places follow distance. */
  stop(): void {
    if (this.stage === 'racing') this.stage = 'finished';
  }

  /** Best first: finishers by place, then the rest by distance. */
  standing(): Racer[] {
    return [...this.racers.values()].sort((a, b) => {
      if (a.place !== null || b.place !== null) return (a.place ?? Infinity) - (b.place ?? Infinity);
      return b.distance - a.distance;
    });
  }

  ranking(): RankingEntry[] {
    return this.standing().map((racer, i) => ({ place: i + 1, playerId: racer.id, name: racer.name }));
  }

  view(waiting: number): LiveViewBody {
    const { tuning } = this;
    const maxHelp = tuning.likes.max + tuning.giftBonusCap;
    return {
      kind: 'race',
      stage: this.stage,
      laps: tuning.laps,
      lapLength: tuning.lapLengthM,
      racers: [...this.racers.values()].map((r) => ({
        id: r.id,
        name: r.name.slice(0, 64),
        distance: Math.round(r.distance * 10) / 10,
        speed: Math.round(r.speed * 10) / 10,
        boost: Math.round(Math.min(1, (r.likeBoost + this.giftBonus(r)) / maxHelp) * 100) / 100,
        place: r.place,
      })),
      waiting,
      capacity: tuning.capacity,
    };
  }
}
