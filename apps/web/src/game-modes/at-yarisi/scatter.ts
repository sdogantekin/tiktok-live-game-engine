import { shape, TRACK_HALF_WIDTH } from './scene-config';
import { distanceFromTrack } from './track';

export interface Spot {
  x: number;
  z: number;
  /** Rotation about the vertical axis. */
  turn: number;
  /** A random 0..1, for picking a variant or a size. */
  pick: number;
}

/** How far from the centre line scenery must stay: the track, its rails, the boards, and a margin. */
export const SCENERY_CLEARANCE = TRACK_HALF_WIDTH + 6;

/** The stands occupy a band beside each straight. */
const inStands = (x: number, z: number) => Math.abs(x) > shape.radius + 6 && Math.abs(x) < shape.radius + 36 && Math.abs(z) < 56;

export interface ScatterRule {
  /** Distance from the track's centre line, metres: at least `min` (never less than the clearance) and at most `max`. */
  min: number;
  max: number;
  /** Only inside the oval (the infield), only outside it, or both. */
  where?: 'infield' | 'outside' | 'both';
  /** Keep out of the stands (default true). */
  avoidStands?: boolean;
}

const insideOval = (x: number, z: number) => {
  const half = shape.straight / 2;
  const az = Math.abs(z);
  return az <= half ? Math.abs(x) < shape.radius : Math.hypot(x, az - half) < shape.radius;
};

/** `count` places for scenery, deterministic given `rnd`, never on or beside the track (see `SCENERY_CLEARANCE`). */
export function scatter(rnd: () => number, count: number, rule: ScatterRule): Spot[] {
  const spots: Spot[] = [];
  const min = Math.max(rule.min, SCENERY_CLEARANCE);
  let attempts = 0;
  while (spots.length < count && attempts++ < count * 400) {
    const x = (rnd() * 2 - 1) * 170;
    const z = (rnd() * 2 - 1) * 190;
    const d = distanceFromTrack(shape, x, z);
    if (d < min || d > rule.max) continue;
    const inside = insideOval(x, z);
    if (rule.where === 'infield' && !inside) continue;
    if (rule.where === 'outside' && inside) continue;
    if ((rule.avoidStands ?? true) && inStands(x, z)) continue;
    spots.push({ x, z, turn: rnd() * Math.PI * 2, pick: rnd() });
  }
  return spots;
}
