import type { AvatarLook, CameraConfig, EffectRecipe, Formation } from '../../game-renderer/types';

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
