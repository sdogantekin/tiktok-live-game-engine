/**
 * The runtime GLB for At Yarışı, built by `assets/game-modes/at-yarisi/scripts/build_horse.py` (Blender) and validated by
 * `assets.test.ts`. One horse with its jockey, three skinned meshes on one 14-bone skeleton: the scene tints `Coat` with the
 * horse's colour and `Silks` with the racer's colour; `Details` keeps its own colours.
 */
export const MODEL_BASE = '/game-modes/at-yarisi/models';

export const MODEL_URLS = { horse: `${MODEL_BASE}/horse.glb` } as const;

export const HORSE_MESHES = ['Coat', 'Silks', 'Details'] as const;
export const HORSE_CLIPS = ['idle', 'gallop', 'gallop_boost', 'victory'] as const;
export const HORSE_BONES = 14;

export const BUDGETS = { horseTriangles: 2500, totalBytes: 1024 * 1024 } as const;
