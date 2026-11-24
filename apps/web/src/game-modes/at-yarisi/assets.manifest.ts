/**
 * The runtime GLB for At Yarışı, built by `assets/game-modes/at-yarisi/scripts/build_horse.py` (Blender) and validated by
 * `assets.test.ts`. The horse is the CC0 horse of Quaternius' "Farm Animals Animated" pack (mesh, 28-bone rig and its Run, Idle, Walk and
 * Jump animations, see `THIRD_PARTY_NOTICES.md`) with our own jockey and tack added. Three skinned meshes share one skeleton: the scene tints
 * `Coat` with the horse's colour and `Silks` (the jockey's clothes, cap, saddle cloth and the blinkers) with the racer's colour; `Rider`
 * (the horse's mane, tail and hooves, and the jockey's skin, boots, saddle and bridle) keeps its own colours.
 */
export const MODEL_BASE = '/game-modes/at-yarisi/models';

export const MODEL_URLS = { horse: `${MODEL_BASE}/horse.glb` } as const;

export const HORSE_MESHES = ['Coat', 'Silks', 'Rider'] as const;
/** gallop (the pack's Run), idle, walk, victory (the pack's Jump). */
export const HORSE_CLIPS = ['gallop', 'idle', 'walk', 'victory'] as const;
export const HORSE_BONES = 28;
/** The model is in the pack's own units (about 4 to a horse's back); the scene scales it by this to a horse about 1.2 m at the back. */
export const HORSE_SCALE = 0.3;

export const BUDGETS = { horseTriangles: 2500, totalBytes: 1024 * 1024 } as const;

/**
 * Scenery from the Kenney Nature Kit (CC0, https://kenney.nl/assets/nature-kit): trees, bushes, flowers, grass and stones,
 * chosen from the kit and copied here unchanged (see `THIRD_PARTY_NOTICES.md`). They are flat-coloured, a few hundred
 * triangles each at most, and drawn with instancing.
 */
export const SCENERY_BASE = '/game-modes/at-yarisi/models/scenery';
export const SCENERY_MODELS = [
  'tree_default',
  'tree_oak',
  'tree_detailed',
  'tree_fat',
  'tree_pineDefaultA',
  'tree_pineTallA',
  'tree_pineRoundA',
  'plant_bush',
  'plant_bushLarge',
  'plant_bushDetailed',
  'flower_redA',
  'flower_yellowA',
  'flower_purpleA',
  'grass_large',
  'stone_largeA',
  'stone_largeC',
  'stone_smallA',
] as const;
