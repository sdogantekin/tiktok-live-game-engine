import type { RaceView } from '@live-game/contracts';

/** One horse as the screen should draw it this frame. */
export interface ShownRacer {
  id: string;
  name: string;
  distance: number;
  speed: number;
  boost: number;
  place: number | null;
}

/** How fast a drawn value catches up with the server's (per second), and how far off it may be before it simply jumps. */
const CATCH_UP_PER_SECOND = 12;
const SNAP_METRES = 30;
/** Never guess further ahead than this: if views stop arriving the horses stop instead of running off. */
const MAX_EXTRAPOLATION_MS = 250;

const ease = (shown: number, target: number, dtMs: number) => shown + (target - shown) * (1 - Math.exp((-CATCH_UP_PER_SECOND * dtMs) / 1000));

/**
 * Turns the server's race views (about ten a second) into smooth motion at the screen's rate. Each horse is drawn at the
 * server's last distance plus its speed times the time since that view (a short, capped guess), eased towards, so it never
 * stutters and never goes backwards; a big jump (a new race) is taken at once. Pure: the scene calls `push` and `step`.
 */
export class RaceSmoother {
  private view: RaceView | null = null;
  private receivedAt = 0;
  private readonly shown = new Map<string, { distance: number; speed: number; boost: number }>();

  /** A new view arrived at client time `nowMs`. Views that are older than the one already held are dropped. */
  push(view: RaceView, nowMs: number): void {
    if (this.view && view.seq <= this.view.seq) return;
    this.view = view;
    this.receivedAt = nowMs;
  }

  get stage(): RaceView['stage'] | null {
    return this.view?.stage ?? null;
  }

  get current(): RaceView | null {
    return this.view;
  }

  /** The horses to draw at client time `nowMs`, `dtMs` after the previous call, in the server's order. */
  step(nowMs: number, dtMs: number): ShownRacer[] {
    const view = this.view;
    if (!view) {
      this.shown.clear();
      return [];
    }
    const ahead = view.stage === 'racing' ? Math.min(MAX_EXTRAPOLATION_MS, Math.max(0, nowMs - this.receivedAt)) / 1000 : 0;
    const present = new Set<string>();
    const out = view.racers.map((racer) => {
      present.add(racer.id);
      const target = racer.place === null ? racer.distance + racer.speed * ahead : racer.distance;
      const before = this.shown.get(racer.id);
      const now =
        !before || Math.abs(target - before.distance) > SNAP_METRES
          ? { distance: target, speed: racer.speed, boost: racer.boost }
          : { distance: Math.max(before.distance, ease(before.distance, target, dtMs)), speed: ease(before.speed, racer.speed, dtMs), boost: ease(before.boost, racer.boost, dtMs) };
      this.shown.set(racer.id, now);
      return { id: racer.id, name: racer.name, place: racer.place, ...now };
    });
    for (const id of [...this.shown.keys()]) if (!present.has(id)) this.shown.delete(id);
    return out;
  }
}
