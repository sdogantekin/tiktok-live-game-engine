import type { Vec3 } from '../../game-renderer/types';

/** How long a guest's walk to the couple takes in all, and how it divides: walking up, pinning, walking back. */
export const TRIP_MS = 5200;
const OUT_END = 0.34;
const PIN_END = 0.66;
const TURN_BACK = 0.9; // the last stretch: turn to face the couple again

export type TripPhase = 'out' | 'pin' | 'back';

export interface TripPose {
  position: Vec3;
  rotationY: number;
  phase: TripPhase;
  /** When the pin clip should start, as a fraction of the trip. */
  pinAt: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Heading (rotation about the vertical axis; 0 faces +z) for a walk from `from` to `to`. */
export const headingTo = (from: Vec3, to: Vec3) => Math.atan2(to[0] - from[0], to[2] - from[2]);

/** The shortest signed turn from `a` to `b`, radians. */
export function turnBetween(a: number, b: number): number {
  const turn = (b - a) % (2 * Math.PI);
  return turn > Math.PI ? turn - 2 * Math.PI : turn < -Math.PI ? turn + 2 * Math.PI : turn;
}

/**
 * Where a guest is `progress` (0..1) through a trip from their place in the queue `home` to the spot in front of the
 * person they are pinning a takı on, `spot`, and which way they face. `home` faces `homeFacing` (towards the couple).
 */
export function tripPose(home: Vec3, homeFacing: number, spot: Vec3, spotFacing: number, progress: number): TripPose {
  const p = Math.min(1, Math.max(0, progress));
  const out = headingTo(home, spot);
  const back = headingTo(spot, home);
  const base = { pinAt: OUT_END };
  if (p < OUT_END) {
    const t = smooth(p / OUT_END);
    const turn = Math.min(1, p / 0.06); // turns towards the walk right away
    return { ...base, phase: 'out', position: [lerp(home[0], spot[0], t), 0, lerp(home[2], spot[2], t)], rotationY: homeFacing + turnBetween(homeFacing, out) * turn };
  }
  if (p < PIN_END) {
    const turn = Math.min(1, (p - OUT_END) / 0.06); // turns to the person to pin
    return { ...base, phase: 'pin', position: [spot[0], 0, spot[2]], rotationY: out + turnBetween(out, spotFacing) * turn };
  }
  const t = smooth((p - PIN_END) / (1 - PIN_END));
  const toBack = Math.min(1, (p - PIN_END) / 0.06);
  const walking = spotFacing + turnBetween(spotFacing, back) * toBack;
  const finish = p < TURN_BACK ? 0 : (p - TURN_BACK) / (1 - TURN_BACK);
  return { ...base, phase: 'back', position: [lerp(spot[0], home[0], t), 0, lerp(spot[2], home[2], t)], rotationY: walking + turnBetween(walking, homeFacing) * finish };
}

export interface Trip {
  start: number;
  /** How big the takı being brought is (1 = a plain `tak`); gifts bring bigger ones. */
  size: number;
}

/** Which guests are on their way to the couple. Plain data keyed by player id, outside React. */
export class Trips {
  private readonly trips = new Map<string, Trip>();
  private readonly nextSize = new Map<string, number>();

  /** The takı size the sender's next trip will carry (a gift announces itself just before the trip starts). */
  announce(playerId: string, size: number): void {
    this.nextSize.set(playerId, Math.max(this.nextSize.get(playerId) ?? 0, size));
  }

  /** Starts a trip unless the guest is already on one. Returns whether it started. */
  begin(playerId: string, now: number): boolean {
    if (this.active(playerId, now)) return false;
    this.trips.set(playerId, { start: now, size: this.nextSize.get(playerId) ?? 1 });
    this.nextSize.delete(playerId);
    return true;
  }

  active(playerId: string, now: number): Trip | null {
    const trip = this.trips.get(playerId);
    if (!trip) return null;
    if (now - trip.start >= TRIP_MS) {
      this.trips.delete(playerId);
      return null;
    }
    return trip;
  }

  /** Forgets everyone who is no longer on screen. */
  keepOnly(present: ReadonlySet<string>): void {
    for (const id of [...this.trips.keys()]) if (!present.has(id)) this.trips.delete(id);
    for (const id of [...this.nextSize.keys()]) if (!present.has(id)) this.nextSize.delete(id);
  }
}

/** Limits how often a figure reacts, so a stream of pins does not keep the couple and parents flinching. */
export class ReactionGate {
  private readonly last = new Map<string, number>();
  constructor(private readonly gapMs: number) {}

  allow(key: string, now: number): boolean {
    const before = this.last.get(key);
    if (before !== undefined && now - before < this.gapMs) return false;
    this.last.set(key, now);
    return true;
  }
}

/** Each time a team's score passes a multiple of `every`, the hall celebrates. Returns how many milestones were passed. */
export function milestonesPassed(before: number, after: number, every: number): number {
  return after > before ? Math.floor(after / every) - Math.floor(before / every) : 0;
}

/** How long a one-off reaction of a figure (the couple or a parent) lasts, by the renderer's animation kind. */
const REACTION_MS: Readonly<Record<string, number>> = { flourish: 1100, jump: 1100, special: 1700 };

/** The reaction each figure is playing now (a nod, a clap, a bow). Plain data outside React, read every frame. */
export class Reactions {
  private readonly current = new Map<string, { kind: 'flourish' | 'jump' | 'special'; start: number }>();

  fire(figureId: string, kind: 'flourish' | 'jump' | 'special', now: number): void {
    this.current.set(figureId, { kind, start: now });
  }

  /** The reaction to play right now, or undefined when the figure is just standing there. */
  playing(figureId: string, now: number): { kind: 'flourish' | 'jump' | 'special'; start: number; phase: number } | undefined {
    const reaction = this.current.get(figureId);
    if (!reaction) return undefined;
    if (now - reaction.start >= (REACTION_MS[reaction.kind] ?? 1100)) {
      this.current.delete(figureId);
      return undefined;
    }
    return { ...reaction, phase: 0 };
  }
}
