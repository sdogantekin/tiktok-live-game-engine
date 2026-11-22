import type { CueBus } from './cue-bus';

export type Vec3 = readonly [number, number, number];

export interface CameraConfig {
  position: Vec3;
  lookAt: Vec3;
  /** Vertical field of view in degrees. */
  fov: number;
}

export interface Placement {
  position: Vec3;
  /** Rotation around the vertical axis, radians (0 faces +z). */
  rotationY: number;
}

/** Where a mode puts its avatars and crowd. Purely geometric; owned by the mode, not the renderer. */
export interface Formation {
  /** Slot `index` of `count` individually animated avatars for a team. */
  avatar(teamId: string, index: number, count: number): Placement;
  /** Instance `index` of the team's instanced crowd. */
  crowd(teamId: string, index: number): Placement;
}

/** Primitive-built avatar look for a team. Replaced by real models later without touching game logic. */
export interface AvatarLook {
  bodyColor: string;
  headColor: string;
  accessory: 'cone' | 'cylinder' | 'none';
  accessoryColor: string;
}

/** How a celebration looks and how often it may stack. Data supplied by the mode. */
export interface EffectRecipe {
  durationMs: number;
  maxConcurrent: number;
  maxQueued: number;
  confetti?: {
    count: number;
    colors: readonly string[];
    origin: 'player' | 'center';
    spread: number;
    lift: number;
  };
  rings?: { count: number; color: string; origin: 'player' | 'center' };
  /** `hop-all`: every avatar jumps. `spin-player`: the sender's avatar spins (if it has one). */
  avatars?: 'hop-all' | 'spin-player';
  /** Lets the scene react, e.g. musicians bouncing during a big celebration. */
  musicians?: 'bounce';
}

export interface RosterEntry {
  id: string;
  teamId: string | null;
}

export interface TeamCount {
  id: string;
  playerCount: number;
}

/** Everything a mode scene receives from the broadcast view. */
export interface SceneProps {
  roster: readonly RosterEntry[];
  teams: readonly TeamCount[];
  /** Transient cues (dances, joins, celebrations). Subscribe; do not store in React state. */
  cues: CueBus;
}
