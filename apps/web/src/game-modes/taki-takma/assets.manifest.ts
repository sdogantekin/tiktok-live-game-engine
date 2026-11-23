/**
 * The runtime GLB assets for Takı Takma Töreni, built by `assets/game-modes/taki-takma/scripts/build_taki_characters.py`
 * (Blender) on the same toy rig and style as Mahalle Halayı, and validated by `assets.test.ts`.
 */
export const MODEL_BASE = '/game-modes/taki-takma/models';

export const MODEL_URLS = {
  characters: {
    guestGelinWoman: `${MODEL_BASE}/character_guest_gelin_woman.glb`,
    guestGelinMan: `${MODEL_BASE}/character_guest_gelin_man.glb`,
    guestDamatWoman: `${MODEL_BASE}/character_guest_damat_woman.glb`,
    guestDamatMan: `${MODEL_BASE}/character_guest_damat_man.glb`,
    bride: `${MODEL_BASE}/character_couple_bride.glb`,
    groom: `${MODEL_BASE}/character_couple_groom.glb`,
    anneGelin: `${MODEL_BASE}/character_anne_gelin.glb`,
    babaGelin: `${MODEL_BASE}/character_baba_gelin.glb`,
    anneDamat: `${MODEL_BASE}/character_anne_damat.glb`,
    babaDamat: `${MODEL_BASE}/character_baba_damat.glb`,
  },
} as const;

const GUEST_CLIPS = ['idle', 'walk', 'pin', 'clap', 'jump'] as const;
const COUPLE_CLIPS = ['idle', 'receive', 'thank', 'clap'] as const;
const PARENT_CLIPS = ['idle', 'clap', 'wipe_tears', 'cheer'] as const;

/** Every character GLB must contain exactly these animation clips. */
export const CHARACTER_CLIPS: Readonly<Record<keyof typeof MODEL_URLS.characters, readonly string[]>> = {
  guestGelinWoman: GUEST_CLIPS,
  guestGelinMan: GUEST_CLIPS,
  guestDamatWoman: GUEST_CLIPS,
  guestDamatMan: GUEST_CLIPS,
  bride: COUPLE_CLIPS,
  groom: COUPLE_CLIPS,
  anneGelin: PARENT_CLIPS,
  babaGelin: PARENT_CLIPS,
  anneDamat: PARENT_CLIPS,
  babaDamat: PARENT_CLIPS,
};
export const CHARACTER_BONES = 12;

export const BUDGETS = { characterTriangles: 1500, totalBytes: 5 * 1024 * 1024 } as const;
