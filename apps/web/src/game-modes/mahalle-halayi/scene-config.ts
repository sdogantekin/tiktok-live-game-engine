import type { AvatarLook, AvatarModels, CameraConfig, EffectRecipe, Formation, Vec3 } from '../../game-renderer/types';
import { MODEL_URLS } from './assets.manifest';

/** Everything visual about the Mahalle Halayı scene that is data: swap these (and the assets) to restyle the mode. */
export const TEAM_IDS = ['gelin', 'damat'] as const;

/** Individually animated avatars across both teams. The rest of the participants are drawn as crowd. */
export const AVATAR_CAP = 24;
/** Instanced crowd members per team (a visual cap; the server still counts everyone). */
export const CROWD_CAPACITY = 30;

export const FLOOR_CENTER_Z = 0.5;
const SIDE: Readonly<Record<string, -1 | 1>> = { gelin: -1, damat: 1 };

const faceCenter = (x: number, z: number) => Math.atan2(-x, FLOOR_CENTER_Z - z);

export const formation: Formation = {
  /** Each team forms a halay line: a curved row beside the dance floor, facing its centre. */
  avatar(teamId, index, count) {
    const t = count > 1 ? index / (count - 1) : 0.5;
    const u = 2 * t - 1;
    const side = SIDE[teamId] ?? 1;
    const x = side * (2.5 + 1.2 * u * u);
    const z = FLOOR_CENTER_Z + u * 4.4;
    return { position: [x, 0, z], rotationY: faceCenter(x, z) };
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

export const camera: CameraConfig = { position: [0, 22, 19], lookAt: [0, 0, -2.2], fov: 52 };

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

/** Which character GLB and clips each team's avatars use. */
export const avatarModels: AvatarModels = {
  urls: { gelin: MODEL_URLS.characters.gelin, damat: MODEL_URLS.characters.damat },
  clips: { idle: 'idle', halay: 'halay', zipla: 'jump', spin: 'dance_a', wiggle: 'dance_b', hop: 'jump', rose: 'rose_special' },
  looping: ['idle', 'halay'],
};

/** The band on the stage plays idle, and dance_b while a big celebration is on. */
export const bandModels: AvatarModels = {
  urls: { band: MODEL_URLS.characters.band },
  clips: { idle: 'idle', halay: 'idle', zipla: 'idle', spin: 'idle', wiggle: 'dance_b', hop: 'dance_b', rose: 'idle' },
  looping: ['idle', 'dance_b'],
};

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
  { piece: 'Davul', position: [0, 0.5, -6.3], castShadow: true },
  { piece: 'Zurna', position: [-2.1, 0.5, -7.0], castShadow: true },
  { piece: 'Zurna', position: [2.1, 0.5, -7.0], castShadow: true },
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

/** Band members on the stage: x offsets from the stage centre. */
export const bandPositions: readonly Vec3[] = [
  [-1.7, 0.5, -7.5],
  [0, 0.5, -7.5],
  [1.7, 0.5, -7.5],
];
