/**
 * The runtime GLB assets for Mahalle Halayı and the contract they must meet. The files are built from
 * `assets/game-modes/mahalle-halayi/scripts/` (Blender) and validated by `assets.test.ts`.
 */
export const MODEL_BASE = '/game-modes/mahalle-halayi/models';

export const MODEL_URLS = {
  characters: {
    gelin: `${MODEL_BASE}/character_gelin.glb`,
    damat: `${MODEL_BASE}/character_damat.glb`,
    gelinLeader: `${MODEL_BASE}/character_gelin_leader.glb`,
    damatLeader: `${MODEL_BASE}/character_damat_leader.glb`,
    gelinTailLeader: `${MODEL_BASE}/character_gelin_tail_leader.glb`,
    damatTailLeader: `${MODEL_BASE}/character_damat_tail_leader.glb`,
    bride: `${MODEL_BASE}/character_bride.glb`,
    groom: `${MODEL_BASE}/character_groom.glb`,
    davulcu: `${MODEL_BASE}/character_davulcu.glb`,
    zurnaci: `${MODEL_BASE}/character_zurnaci.glb`,
  },
  crowd: `${MODEL_BASE}/crowd.glb`,
  courtyard: `${MODEL_BASE}/courtyard.glb`,
} as const;

/** Every character GLB must contain exactly the animation clips listed for its look. */
const TEAM_CLIPS = ['idle', 'step_left', 'step_right', 'halay_kick', 'jump', 'dance_a', 'dance_b', 'rose_special'] as const;
const LEADER_CLIPS = ['idle', 'leader_step_left', 'leader_step_right', 'mendil_flourish', 'jump', 'dance_a', 'dance_b', 'rose_special'] as const;
export const CHARACTER_CLIPS: Readonly<Record<keyof typeof MODEL_URLS.characters, readonly string[]>> = {
  gelin: TEAM_CLIPS,
  damat: TEAM_CLIPS,
  gelinLeader: LEADER_CLIPS,
  damatLeader: LEADER_CLIPS,
  gelinTailLeader: LEADER_CLIPS,
  damatTailLeader: LEADER_CLIPS,
  bride: ['idle', 'step_left', 'step_right'],
  groom: ['idle', 'step_left', 'step_right'],
  davulcu: ['idle', 'davul_play'],
  zurnaci: ['idle', 'zurna_play'],
};
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
