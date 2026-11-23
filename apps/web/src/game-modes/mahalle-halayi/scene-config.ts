import { triangleTravel } from '../../game-renderer/beat-clock';
import type { AnimationRules, AnimKind, AvatarLook, AvatarModels, CameraConfig, EffectRecipe, Formation, LineMotion, Vec3 } from '../../game-renderer/types';
import { MODEL_URLS } from './assets.manifest';

/** Everything visual about the Mahalle Halayı scene that is data: swap these (and the assets) to restyle the mode. */
export const TEAM_IDS = ['gelin', 'damat'] as const;

/** Individually animated avatars across both teams. The rest of the participants are drawn as crowd. */
export const AVATAR_CAP = 24;
/** Instanced crowd members per team (a visual cap; the server still counts everyone). */
export const CROWD_CAPACITY = 30;

export const FLOOR_CENTER_Z = 0.5;
const SIDE: Readonly<Record<string, -1 | 1>> = { gelin: -1, damat: 1 };

/** How far the halaybaşı stands in front of the line, in metres. */
const LEADER_STEP_OUT = 0.4;

const faceCenter = (x: number, z: number) => Math.atan2(-x, FLOOR_CENTER_Z - z);

export const formation: Formation = {
  /** Each team forms a halay line: a curved row beside the dance floor, facing its centre. */
  avatar(teamId, index, count) {
    const t = count > 1 ? index / (count - 1) : 0.5;
    const u = 2 * t - 1;
    const side = SIDE[teamId] ?? 1;
    // The two halaybaşı (the first and last slots, one at each end) step a little out of the line, towards the dance floor.
    const x = side * (index === 0 || index === count - 1 ? 3 - LEADER_STEP_OUT : 3); // a straight line: everyone faces the same way, straight across
    const z = FLOOR_CENTER_Z + u * 4.9; // neighbours stand ~0.9 m apart: close enough for their hands to meet
    return { position: [x, 0, z], rotationY: (-side * Math.PI) / 2 };
  },
  crowd(teamId, index) {
    const side = SIDE[teamId] ?? 1;
    const row = index % 10;
    const col = Math.floor(index / 10);
    const x = side * (4.6 + col * 0.7);
    const z = -4 + row * 0.95;
    return { position: [x, 0, z], rotationY: faceCenter(x, z) };
  },
};

export const looks: Readonly<Record<string, AvatarLook>> = {
  gelin: { bodyColor: '#e0457b', headColor: '#f1c9a5', accessory: 'cone', accessoryColor: '#ffffff' },
  damat: { bodyColor: '#2f6fdb', headColor: '#e8bd98', accessory: 'cylinder', accessoryColor: '#b3261e' },
};

export const camera: CameraConfig = { position: [0, 27, 11], lookAt: [0, 0, -1.2], fov: 52 };

const PARTY_COLORS = ['#e0457b', '#2f6fdb', '#ffd35a', '#ffffff', '#7bd88f'] as const;

export const effectRecipes: Readonly<Record<string, EffectRecipe>> = {
  rose: {
    durationMs: 1500,
    maxConcurrent: 6,
    maxQueued: 0,
    confetti: { count: 40, colors: ['#ff6fa5', '#ffffff', '#ffd1e3'], origin: 'player', spread: 1.4, lift: 5 },
    rings: { count: 1, color: '#ff6fa5', origin: 'player' },
    avatars: 'spin-player',
  },
  gg: {
    durationMs: 2500,
    maxConcurrent: 1,
    maxQueued: 1,
    confetti: { count: 140, colors: PARTY_COLORS, origin: 'center', spread: 4.5, lift: 8 },
    rings: { count: 2, color: '#ffd35a', origin: 'center' },
    avatars: 'hop-all',
  },
  big_celebration: {
    durationMs: 4500,
    maxConcurrent: 1,
    maxQueued: 3,
    confetti: { count: 300, colors: PARTY_COLORS, origin: 'center', spread: 6.5, lift: 11 },
    rings: { count: 3, color: '#ffffff', origin: 'center' },
    avatars: 'hop-all',
    musicians: 'bounce',
  },
};

/** The same clip for every animation kind: for performers that just keep their own loop going. */
const sameClip = (clip: string): AvatarModels['clips'] => ({ idle: clip, flourish: clip, jump: clip, spin: clip, wiggle: clip, hop: clip, special: clip });

/** What the viewers' words make an avatar do: `halay` is a kick-flourish, `zıpla` a jump, anything else a random dance. */
export const animationRules: AnimationRules = {
  durations: { flourish: 700, jump: 750, spin: 1400, wiggle: 900, hop: 750, special: 1250 },
  forAction(animation, random): AnimKind {
    if (animation === 'halay') return 'flourish';
    if (animation === 'zipla') return 'jump';
    return random() < 0.5 ? 'spin' : 'wiggle';
  },
};

/** How the halay lines walk: up and down the courtyard, half a cycle (one direction) every 8 beats. */
const TRAVEL_HALF_CYCLE_BEATS = 8;
const TRAVEL_AMPLITUDE = 0.9;

/** Where both lines are on the beat `beats`: they walk together along the courtyard (z), turning at each end. */
export function lineMotion(beats: number, bpm: number): LineMotion {
  const { distance, direction } = triangleTravel(beats, TRAVEL_HALF_CYCLE_BEATS, TRAVEL_AMPLITUDE);
  return { offset: [0, 0, distance], heading: [0, direction], beats, bpm };
}

function halaybasi(urls: Readonly<Record<string, string>>): AvatarModels {
  return {
    urls,
    clips: { idle: 'idle', flourish: 'mendil_flourish', jump: 'jump', spin: 'dance_a', wiggle: 'mendil_flourish', hop: 'jump', special: 'rose_special' },
    looping: ['idle', 'leader_step_left', 'leader_step_right'],
    loopBeats: { leader_step_left: 2, leader_step_right: 2 },
    lineSteps: { left: 'leader_step_left', right: 'leader_step_right' },
  };
}

/** Which character GLB and clips each team's avatars use. While nothing special happens they do the beat-synced side step. */
export const avatarModels: AvatarModels = {
  urls: { gelin: MODEL_URLS.characters.gelin, damat: MODEL_URLS.characters.damat },
  clips: { idle: 'idle', flourish: 'halay_kick', jump: 'jump', spin: 'dance_a', wiggle: 'dance_b', hop: 'jump', special: 'rose_special' },
  looping: ['idle', 'step_left', 'step_right'],
  loopBeats: { step_left: 2, step_right: 2 },
  lineSteps: { left: 'step_left', right: 'step_right' },
  // The two halaybaşı of each line, one at each end. Each keeps one hand in the chain and waves a mendil with the other.
  leader: halaybasi({ gelin: MODEL_URLS.characters.gelinLeader, damat: MODEL_URLS.characters.damatLeader }),
  tailLeader: halaybasi({ gelin: MODEL_URLS.characters.gelinTailLeader, damat: MODEL_URLS.characters.damatTailLeader }),
};

const beatLoop = (clip: string, beats: number, look: keyof typeof MODEL_URLS.characters): AvatarModels => ({
  urls: { [look]: MODEL_URLS.characters[look] },
  clips: sameClip(clip),
  looping: [clip],
  loopBeats: { [clip]: beats },
});

/** The bride and groom do their own halay on a small circle: the same linked side step as the lines. */
const sideStepper = (look: 'bride' | 'groom'): AvatarModels => ({
  urls: { [look]: MODEL_URLS.characters[look] },
  clips: sameClip('idle'),
  looping: ['idle', 'step_left', 'step_right'],
  loopBeats: { step_left: 2, step_right: 2 },
  lineSteps: { left: 'step_left', right: 'step_right' },
});

/** The couple, and the two musicians, all locked to the shared beat. */
export const brideModels = sideStepper('bride');
export const groomModels = sideStepper('groom');
export const davulModels = beatLoop('davul_play', 1, 'davulcu');
export const zurnaModels = beatLoop('zurna_play', 2, 'zurnaci');
export const sazModels = beatLoop('saz_play', 1, 'sazci');

export interface Placed {
  piece: string;
  position: Vec3;
  rotationY?: number;
  castShadow?: boolean;
}

/** Where each courtyard kit piece stands (three.js coordinates: +x right, +z toward the camera). */
export const courtyardLayout: readonly Placed[] = [
  { piece: 'Floor_Plaza', position: [0, 0, 2] },
  { piece: 'Floor_Dance', position: [0, 0, FLOOR_CENTER_Z] },
  { piece: 'House_A', position: [-5, 0, -11.5] },
  { piece: 'House_B', position: [0.5, 0, -11.5] },
  { piece: 'House_C', position: [5.4, 0, -11.5] },
  { piece: 'Stage', position: [0, 0, -7.6], castShadow: true },
  { piece: 'Arch', position: [0, 0, -4.9] },
  { piece: 'Lamp', position: [-5.2, 0, -3.5] },
  { piece: 'Lamp', position: [5.2, 0, -3.5] },
  { piece: 'Lamp', position: [-5.2, 0, 5.5] },
  { piece: 'Lamp', position: [5.2, 0, 5.5] },
  { piece: 'Banner_Gelin', position: [-3.4, 0, -4.9] },
  { piece: 'Banner_Damat', position: [3.4, 0, -4.9], rotationY: Math.PI },
  { piece: 'Planter', position: [-3.9, 0, -6.2], castShadow: true },
  { piece: 'Planter', position: [3.9, 0, -6.2], castShadow: true },
  { piece: 'Planter', position: [-5.6, 0, -8.4], castShadow: true },
  { piece: 'Planter', position: [5.6, 0, -8.4], castShadow: true },
];

export interface Performer {
  look: 'bride' | 'groom' | 'davulcu' | 'zurnaci' | 'sazci';
  position: Vec3;
  rotationY: number;
  /** Walks a circle round `centre` while facing it (their halay is a ring of two); `phase` is the start angle. */
  orbit?: { centre: Vec3; radius: number; phase: number; beatsPerTurn: number };
  /** The stars of the show are drawn a little larger than the crowd. */
  scale?: number;
}

/**
 * The couple stand side by side on a small circle, both facing its centre with joined hands, and side-step round it
 * (one turn every 16 beats). `phase` is where on the circle each of them starts.
 */
const COUPLE_ORBIT = { centre: [0, 0, FLOOR_CENTER_Z] as Vec3, radius: 1.0, beatsPerTurn: 16 };
export const couple: readonly Performer[] = [
  { look: 'bride', position: [0, 0, FLOOR_CENTER_Z], rotationY: 0, scale: 1.2, orbit: { ...COUPLE_ORBIT, phase: 0 } },
  { look: 'groom', position: [0, 0, FLOOR_CENTER_Z], rotationY: 0, scale: 1.2, orbit: { ...COUPLE_ORBIT, phase: -1.14 } }, // ~1.1 m apart: their slightly larger arms meet in between
];

/** Traditional wedding musicians on the stage: a saz player and a zurna player on either side of the davul. */
export const musicians: readonly Performer[] = [
  { look: 'sazci', position: [-1.9, 0.5, -7.5], rotationY: 0.15 },
  { look: 'davulcu', position: [0, 0.5, -7.3], rotationY: 0 },
  { look: 'zurnaci', position: [1.9, 0.5, -7.5], rotationY: -0.15 },
];
