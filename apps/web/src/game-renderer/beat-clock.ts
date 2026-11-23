/** Tempo the animation clips are authored at: one beat is half a second. */
export const CLIP_BPM = 120;
export const BASE_BPM = 96;
export const MAX_BPM = 132;
/** The tempo follows the group energy but never jumps: it moves at most this many BPM per second. */
const MAX_BPM_SLEW = 14;

/** Tempo for a group energy level (0..1). */
export function bpmForEnergy(energy: number): number {
  return BASE_BPM + (MAX_BPM - BASE_BPM) * Math.min(1, Math.max(0, energy));
}

/**
 * The shared musical clock of the scene: everything that dances reads `beats` (a continuous beat count) so the
 * lines, the musicians, the crowd and, later, the audio stay on the same beat. The tempo follows the group
 * energy; because the beat count is integrated, a tempo change never makes the dancers jump.
 */
export class BeatClock {
  beats = 0;
  bpm = BASE_BPM;
  private last: number | null = null;

  /** Advances the clock to `now` (ms). Call once per frame, before anything reads it. */
  tick(now: number, energy: number): void {
    if (this.last === null) {
      this.last = now;
      return;
    }
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000)); // a stalled tab must not fast-forward the dance
    this.last = now;
    const target = bpmForEnergy(energy);
    const step = MAX_BPM_SLEW * dt;
    this.bpm += Math.max(-step, Math.min(step, target - this.bpm));
    this.beats += (dt * this.bpm) / 60;
  }
}

/** Position within a loop of `loopBeats` beats, 0..1 (what a beat-synced clip is sampled with). */
export function loopPhase(beats: number, loopBeats: number): number {
  const phase = (beats / loopBeats) % 1;
  return phase < 0 ? phase + 1 : phase;
}

export interface Travel {
  /** How far the line has moved from its home position, metres along the axis. */
  distance: number;
  /** +1 while moving along the axis, -1 coming back. */
  direction: 1 | -1;
}

/**
 * Triangle-wave travel: the line walks `amplitude` metres one way over `halfCycleBeats` beats, then back.
 * It starts at one end (`-amplitude`) and moves at constant speed, which is what a stepping animation needs.
 */
export function triangleTravel(beats: number, halfCycleBeats: number, amplitude: number): Travel {
  const phase = loopPhase(beats, halfCycleBeats * 2);
  const forward = phase < 0.5;
  const t = forward ? phase * 2 : 2 - phase * 2; // 0..1..0
  return { distance: amplitude * (2 * t - 1), direction: forward ? 1 : -1 };
}

/**
 * Which way a character facing `rotationY` (0 faces +z) has to step to move along `heading` on the ground:
 * 'left' or 'right' of its own body. The character's left is (cos, -sin) in (x, z).
 */
export function stepSide(rotationY: number, heading: readonly [number, number]): 'left' | 'right' {
  const leftness = heading[0] * Math.cos(rotationY) - heading[1] * Math.sin(rotationY);
  return leftness >= 0 ? 'left' : 'right';
}

/**
 * A dancer walking a circle round `centre`, always facing it, `beatsPerTurn` beats per full turn.
 * `heading` is the ground direction (x, z) it is walking in, along the circle.
 */
export function orbitPose(
  beats: number,
  orbit: { centre: readonly [number, number, number]; radius: number; phase: number; beatsPerTurn: number },
): { x: number; z: number; rotationY: number; heading: readonly [number, number] } {
  const angle = orbit.phase + (2 * Math.PI * beats) / orbit.beatsPerTurn;
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const sign = Math.sign(orbit.beatsPerTurn) || 1;
  return {
    x: orbit.centre[0] + orbit.radius * dx,
    z: orbit.centre[2] + orbit.radius * dz,
    rotationY: Math.atan2(-dx, -dz),
    heading: [-dz * sign, dx * sign],
  };
}
