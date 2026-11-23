import { LANE_WIDTH } from './scene-config';

/** What the starting gate looks like right now. */
export interface GateState {
  /** How many stalls (horses) it has. */
  stalls: number;
  /** 0 = the doors are shut, 1 = swung wide open. */
  open: number;
  /** Whether it is standing at all: it is taken away a moment after the horses are away. */
  up: boolean;
}

/** The doors swing open in this many seconds, and the gate is gone this many seconds after the start. */
export const DOORS_OPEN_SECONDS = 0.45;
export const GATE_GONE_SECONDS = 3.5;

/** The gate before the start (`secondsSinceStart` null) and in the moments after it. */
export function gateTimeline(secondsSinceStart: number | null): Pick<GateState, 'open' | 'up'> {
  if (secondsSinceStart === null) return { open: 0, up: true };
  return { open: Math.min(1, Math.max(0, secondsSinceStart / DOORS_OPEN_SECONDS)), up: secondsSinceStart < GATE_GONE_SECONDS };
}

/**
 * Where the dividers between the stalls stand, as lateral offsets from the track's centre line: one between each pair of neighbouring
 * horses and one at each end, so every horse stands in its own stall (the horses stand at `laneOffset`, half a lane in from each divider).
 */
export function dividerLaterals(stalls: number): number[] {
  return Array.from({ length: stalls + 1 }, (_, j) => (j - stalls / 2) * LANE_WIDTH);
}
