import type { TrackShape } from './track';
import { trackPoint } from './track';

export type Vec3 = readonly [number, number, number];

export interface CameraPose {
  position: Vec3;
  lookAt: Vec3;
}

/** Moves `current` towards `target`, `lambda` being how quickly (per second); frame-rate independent. */
export function damp(current: number, target: number, lambda: number, dtSec: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dtSec));
}

/** The shortest signed turn from angle `a` to `b`. */
export function turnBetween(a: number, b: number): number {
  const turn = (b - a) % (2 * Math.PI);
  return turn > Math.PI ? turn - 2 * Math.PI : turn < -Math.PI ? turn + 2 * Math.PI : turn;
}

/** Like `damp`, but for an angle: takes the short way round. */
export function dampAngle(current: number, target: number, lambda: number, dtSec: number): number {
  return current + turnBetween(current, target) * (1 - Math.exp(-lambda * dtSec));
}

export interface Subject {
  x: number;
  z: number;
  heading: number;
  distance: number;
}

/** The middle of the leading group: the average place and (circular) average heading of the `count` horses furthest ahead. */
export function focusOf(subjects: readonly Subject[], count = 3): { x: number; z: number; heading: number } | null {
  const lead = [...subjects].sort((a, b) => b.distance - a.distance).slice(0, Math.max(1, count));
  if (lead.length === 0) return null;
  const n = lead.length;
  return {
    x: lead.reduce((s, r) => s + r.x, 0) / n,
    z: lead.reduce((s, r) => s + r.z, 0) / n,
    heading: Math.atan2(lead.reduce((s, r) => s + Math.sin(r.heading), 0) / n, lead.reduce((s, r) => s + Math.cos(r.heading), 0) / n),
  };
}

export interface ChaseTuning {
  /** How far behind the focus the camera sits, how high, and how far ahead of the focus it looks (metres). */
  behind: number;
  height: number;
  ahead: number;
}

export const CHASE: ChaseTuning = { behind: 25, height: 17, ahead: 12 };
export const WIDE: ChaseTuning = { behind: 48, height: 34, ahead: 6 };

/** A camera behind and above `focus`, looking a little way ahead of it along its heading. */
export function chaseCamera(focus: { x: number; z: number; heading: number }, tuning: ChaseTuning = CHASE): CameraPose {
  const fx = Math.sin(focus.heading);
  const fz = Math.cos(focus.heading);
  return {
    position: [focus.x - fx * tuning.behind, tuning.height, focus.z - fz * tuning.behind],
    lookAt: [focus.x + fx * tuning.ahead, 1, focus.z + fz * tuning.ahead],
  };
}

/** Before the start: a slow arc round the front of the grid, high enough to show all the horses lined up. */
export function gridCamera(shape: TrackShape, seconds: number): CameraPose {
  const start = trackPoint(shape, 0);
  const sweep = Math.min(1, Math.max(0, seconds / 12));
  const angle = -0.9 + 1.5 * sweep; // radians round the start line, from the front-left to nearly behind
  const radius = 26;
  return {
    position: [start.x + Math.sin(angle) * radius + 6, 12 + 6 * (1 - sweep), start.z - Math.cos(angle) * radius * 0.6 - 4],
    lookAt: [start.x, 1, start.z - 4],
  };
}
