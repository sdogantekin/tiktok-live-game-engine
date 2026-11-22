/**
 * The runtime GLB assets for Mahalle Halayı and the contract they must meet. The files are built from
 * `assets/game-modes/mahalle-halayi/scripts/` (Blender) and validated by `assets.test.ts`.
 */
export const MODEL_BASE = '/game-modes/mahalle-halayi/models';

export const MODEL_URLS = {
  characters: {
    gelin: `${MODEL_BASE}/character_gelin.glb`,
    damat: `${MODEL_BASE}/character_damat.glb`,
    band: `${MODEL_BASE}/character_band.glb`,
  },
  crowd: `${MODEL_BASE}/crowd.glb`,
  courtyard: `${MODEL_BASE}/courtyard.glb`,
} as const;

/** Every character GLB must contain exactly these animation clips. */
export const CHARACTER_CLIPS = ['idle', 'halay', 'jump', 'dance_a', 'dance_b', 'rose_special'] as const;
export const CHARACTER_BONES = 12;

/** Named set pieces the courtyard GLB must contain; the scene places them from data. */
export const COURTYARD_PIECES = [
  'Floor_Plaza',
  'Floor_Dance',
  'House_A',
  'House_B',
  'House_C',
  'Lamp',
  'Banner_Gelin',
  'Banner_Damat',
  'Stage',
  'Davul',
  'Zurna',
  'Arch',
  'Planter',
] as const;

export const CROWD_NODES = ['CrowdBody', 'CrowdHead'] as const;

/** Initial budgets (to be confirmed by measurement in the performance step). */
export const BUDGETS = {
  characterTriangles: 1500,
  crowdTriangles: 260,
  courtyardTriangles: 30_000,
  totalBytes: 5 * 1024 * 1024,
  maxTextureSize: 1024,
} as const;
