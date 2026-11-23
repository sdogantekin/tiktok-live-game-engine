import { Rng } from './rng';
import { createViewers, EventFactory, type ScheduledEvent, type SimViewer } from './simulator';

/** Words and gift keys the simulated audience uses. Plain data, so other game modes can supply their own. */
export interface Vocabulary {
  joinWords: readonly string[];
  actions: readonly { value: string; weight: number }[];
  chatter: readonly string[];
  gifts: readonly string[];
}

export const MAHALLE_VOCABULARY: Vocabulary = {
  joinWords: ['gelin', 'damat'],
  actions: [
    { value: 'halay', weight: 60 },
    { value: 'zıpla', weight: 15 },
    { value: 'oyna', weight: 15 },
  ],
  chatter: ['merhaba', 'selam herkese', 'çok güzel!', 'kim kazanıyor?', 'ben geldim'],
  gifts: ['rose', 'gg', 'big_celebration'],
};

export const TAKI_VOCABULARY: Vocabulary = {
  joinWords: ['gelin', 'damat'],
  actions: [
    { value: 'tak', weight: 70 },
    { value: 'alkış', weight: 30 },
  ],
  chatter: ['hayırlı olsun', 'mutluluklar', 'çok güzel!', 'bizim taraf önde', 'ben geldim'],
  gifts: ['rose', 'gg', 'big_celebration'],
};

/** The simulated audience's words for each game (the simulator is a provider, so it is wired to games here, not in the games). */
export function vocabularyFor(modeId: string): Vocabulary {
  return modeId === 'taki-takma' ? TAKI_VOCABULARY : MAHALLE_VOCABULARY;
}

export interface ScenarioOptions {
  seed: number;
  viewers: number;
  /** Epoch ms of the scenario start; event `receivedAt` values are derived from it. */
  startAt: number;
  vocabulary?: Vocabulary;
  /** Event id prefix; set it when playing several scenarios into one session. */
  idPrefix?: string;
}

const byTime = (a: ScheduledEvent, b: ScheduledEvent) => a.atMs - b.atMs;

export interface SteadyOptions extends ScenarioOptions {
  /** Viewers join at random moments inside this window. */
  joinWindowMs: number;
  durationMs: number;
  /** Target total comment rate across all viewers once joined. */
  eventsPerSecond: number;
  /** Chance that any given action is a gift instead of a comment. */
  giftRate?: number;
}

/** Everyone joins a team during the join window, then sends actions, chatter and the odd gift at Poisson intervals. */
export function steadyScenario(options: SteadyOptions): ScheduledEvent[] {
  const rng = new Rng(options.seed);
  const vocabulary = options.vocabulary ?? MAHALLE_VOCABULARY;
  const factory = new EventFactory(options.idPrefix);
  const viewers = createViewers(options.viewers, rng);
  const meanIntervalMs = (options.viewers / options.eventsPerSecond) * 1000;
  const events: ScheduledEvent[] = [];

  const at = (atMs: number) => options.startAt + atMs;

  for (const viewer of viewers) {
    const joinAt = rng.int(options.joinWindowMs);
    events.push({ atMs: joinAt, raw: factory.comment(viewer, rng.pick(vocabulary.joinWords), at(joinAt)) });

    for (let t = joinAt + rng.exponential(meanIntervalMs); t < options.durationMs; t += rng.exponential(meanIntervalMs)) {
      const atMs = Math.floor(t);
      if (rng.chance(options.giftRate ?? 0)) {
        events.push({ atMs, raw: factory.gift(viewer, rng.pick(vocabulary.gifts), at(atMs)) });
      } else if (rng.chance(0.1)) {
        events.push({ atMs, raw: factory.comment(viewer, rng.pick(vocabulary.chatter), at(atMs)) });
      } else {
        events.push({ atMs, raw: factory.comment(viewer, rng.pickWeighted(vocabulary.actions), at(atMs)) });
      }
    }
  }
  return events.sort(byTime);
}

export interface BurstOptions extends ScenarioOptions {
  /** Offset of the burst from the scenario start. */
  atMs: number;
  spreadMs: number;
  text: string;
}

/** Every viewer sends the same comment within a short window (e.g. 200 `halay` in 2 s). */
export function burstScenario(options: BurstOptions): ScheduledEvent[] {
  const rng = new Rng(options.seed);
  const factory = new EventFactory(options.idPrefix);
  return createViewers(options.viewers, rng)
    .map((viewer) => {
      const atMs = options.atMs + rng.int(options.spreadMs);
      return { atMs, raw: factory.comment(viewer, options.text, options.startAt + atMs) };
    })
    .sort(byTime);
}

export interface ChaosOptions extends ScenarioOptions {
  durationMs: number;
  /** Number of chaotic episodes to generate. */
  episodes: number;
}

export const MALFORMED_PAYLOADS: readonly unknown[] = [
  null,
  42,
  'halay',
  [],
  {},
  { kind: 'comment.received' },
  { kind: 'comment.received', eventId: 'x', provider: 'simulator', userId: 'u', displayName: 'n', receivedAt: 1, payload: { text: 123 } },
  { kind: 'gift.received', eventId: 'x', provider: 'simulator', userId: 'u', displayName: 'n', receivedAt: 1, payload: { giftKey: 'rose', count: 0 } },
  { kind: 'like.received', eventId: 'x', provider: 'simulator', userId: 'u', displayName: 'n', receivedAt: 1, payload: {} },
];

/** Hostile and sloppy traffic: duplicates, junk, oversized text, rapid repeats, invisible characters, prototype-ish keys. */
export function chaosScenario(options: ChaosOptions): ScheduledEvent[] {
  const rng = new Rng(options.seed);
  const vocabulary = options.vocabulary ?? MAHALLE_VOCABULARY;
  const factory = new EventFactory(options.idPrefix);
  const viewers = createViewers(options.viewers, rng);
  const events: ScheduledEvent[] = [];
  const at = (atMs: number) => options.startAt + atMs;
  const add = (atMs: number, raw: unknown) => events.push({ atMs, raw });
  const randomViewer = (): SimViewer => rng.pick(viewers);

  for (let i = 0; i < options.episodes; i++) {
    const atMs = rng.int(options.durationMs);
    const viewer = randomViewer();

    switch (rng.int(8)) {
      case 0:
        add(atMs, factory.comment(viewer, rng.pickWeighted(vocabulary.actions), at(atMs)));
        break;
      case 1: {
        const event = factory.comment(viewer, rng.pick(vocabulary.joinWords), at(atMs));
        add(atMs, event);
        add(atMs + rng.int(50), event); // exact duplicate (same event id)
        break;
      }
      case 2:
        add(atMs, rng.pick(MALFORMED_PAYLOADS));
        break;
      case 3:
        add(atMs, factory.comment(viewer, 'x'.repeat(100_000), at(atMs))); // fails schema
        add(atMs, factory.comment(viewer, 'halay '.repeat(150), at(atMs))); // valid schema, never a command
        break;
      case 4:
        for (let n = 0; n < 20; n++) add(atMs + n * 5, factory.comment(viewer, 'halay', at(atMs + n * 5))); // rapid repeat
        break;
      case 5:
        add(atMs, factory.comment(viewer, 'ha​lay', at(atMs)));
        add(atMs, factory.comment(viewer, '‮halay', at(atMs)));
        break;
      case 6:
        add(atMs, factory.comment({ ...viewer, displayName: '<img src=x onerror=alert(1)>' }, rng.pick(vocabulary.joinWords), at(atMs)));
        break;
      default:
        add(atMs, factory.gift(viewer, rng.pick(['constructor', '__proto__', 'toString', 'unknown_gift']), at(atMs)));
    }
  }
  return events.sort(byTime);
}
