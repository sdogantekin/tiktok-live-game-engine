import type { NormalizedEvent } from '@live-game/contracts';
import type { Rng } from './rng';

export const SIMULATOR_PROVIDER = 'simulator';

export interface SimViewer {
  userId: string;
  displayName: string;
}

/** One payload at an offset from the scenario start. `raw` is deliberately `unknown`: chaos scenarios send junk. */
export interface ScheduledEvent {
  atMs: number;
  raw: unknown;
}

const FIRST_NAMES = [
  'Ayşe', 'Mehmet', 'Fatma', 'Ahmet', 'Zeynep', 'Mustafa', 'Elif', 'Emre', 'Merve', 'Burak',
  'Seda', 'Can', 'Deniz', 'Ece', 'Kaan', 'Gül', 'Onur', 'İpek', 'Barış', 'Şeyma',
];

/** Creates `count` viewers numbered from `firstNumber` (so a growing pool never reuses ids). */
export function createViewers(count: number, rng: Rng, firstNumber = 1): SimViewer[] {
  return Array.from({ length: count }, (_, index) => {
    const number = firstNumber + index;
    return {
      userId: `sim-${String(number).padStart(4, '0')}`,
      displayName: `${rng.pick(FIRST_NAMES)}${number}`,
    };
  });
}

/** Builds valid normalized events with unique, session-scoped ids. */
export class EventFactory {
  private sequence = 0;

  /** Use distinct prefixes when combining scenarios in one session so event ids never collide. */
  constructor(private readonly idPrefix = SIMULATOR_PROVIDER) {}

  comment(viewer: SimViewer, text: string, receivedAt: number): NormalizedEvent {
    return {
      kind: 'comment.received',
      eventId: this.nextId(),
      provider: SIMULATOR_PROVIDER,
      userId: viewer.userId,
      displayName: viewer.displayName,
      receivedAt,
      payload: { text },
    };
  }

  gift(viewer: SimViewer, giftKey: string, receivedAt: number, count = 1): NormalizedEvent {
    return {
      kind: 'gift.received',
      eventId: this.nextId(),
      provider: SIMULATOR_PROVIDER,
      userId: viewer.userId,
      displayName: viewer.displayName,
      receivedAt,
      payload: { giftKey, count },
    };
  }

  like(viewer: SimViewer, count: number, receivedAt: number): NormalizedEvent {
    return {
      kind: 'like.received',
      eventId: this.nextId(),
      provider: SIMULATOR_PROVIDER,
      userId: viewer.userId,
      displayName: viewer.displayName,
      receivedAt,
      payload: { count },
    };
  }

  private nextId(): string {
    return `${this.idPrefix}-${++this.sequence}`;
  }
}
