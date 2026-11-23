import type { Phase } from '@live-game/contracts';
import type { SoundEngine } from './audio/engine';
import type { CueBus } from './cue-bus';
import type { LiveFeed } from './live-feed';
import type { TagBoard } from './name-tags';

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

/** The renderer's own animation vocabulary. A game maps its viewer actions onto these (see `AnimationRules`). */
export type AnimKind = 'flourish' | 'jump' | 'spin' | 'wiggle' | 'hop' | 'special';

/** How a game turns what viewers did into avatar animations. Data and a pure function supplied by the mode. */
export interface AnimationRules {
  /** How long each animation lasts, in ms. */
  durations: Readonly<Record<AnimKind, number>>;
  /** Which animation a viewer's action plays (`animation` is the game's own word from the cue). */
  forAction(animation: string, random: () => number): AnimKind;
}

/** Rigged character models for the avatars: one GLB per team (same rig and clips, different colours). */
export interface AvatarModels {
  /** GLB url by team id. */
  urls: Readonly<Record<string, string>>;
  /** Clip name for each animation kind, plus the default. */
  clips: Readonly<Record<AnimKind | 'idle', string>>;
  /** Clips that loop while their animation lasts; the rest play once. */
  looping: readonly string[];
  /** Looping clips locked to the shared beat clock, with the beats one loop lasts. Others free-run. */
  loopBeats?: Readonly<Record<string, number>>;
  /** The clips an avatar plays while its line travels, by which side of its body it steps towards. */
  lineSteps?: { left: string; right: string };
  /** Models and clips for the leader at the first end of each team's line (first slot), if the game has line leaders. */
  leader?: AvatarModels;
  /** ...and at the other end (last slot); the leader's free hand is on the other side there. */
  tailLeader?: AvatarModels;
}

/** Where the shared halay lines are right now. Set once a frame by the scene, read by avatars and name tags. */
export interface LineMotion {
  /** Offset of every avatar line from its home position, world metres. */
  offset: Vec3;
  /** Ground direction (x, z) the lines are currently walking. */
  heading: readonly [number, number];
  beats: number;
  bpm: number;
}

export interface RosterEntry {
  id: string;
  name: string;
  teamId: string | null;
}

export interface TeamCount {
  id: string;
  playerCount: number;
  /** The team's score, for scenes that show it (a meter, a milestone effect). */
  score?: number;
}

/** Everything a mode scene receives from the broadcast view. */
export interface SceneProps {
  roster: readonly RosterEntry[];
  teams: readonly TeamCount[];
  /** Transient cues (dances, joins, celebrations). Subscribe; do not store in React state. */
  cues: CueBus;
  /** Receives which avatar belongs to whom, and who just acted, for the name-tag layer drawn over the scene. */
  tags: TagBoard;
  /** The newest live view of a game that simulates on the server (a race); empty for games that have none. */
  live: LiveFeed;
  /** The broadcast's sound engine (null if the browser has no Web Audio). */
  audio: SoundEngine | null;
  phase: Phase;
  paused: boolean;
  /** Whole seconds left in the current timed phase, or null. */
  secondsLeft: number | null;
}
