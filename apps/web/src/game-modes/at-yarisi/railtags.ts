/** A name tag in the rail-camera window: where it is inside the window (fractions of its width and height) and whose it is. */
export interface RailTag {
  id: string;
  name: string;
  /** 1, 2 or 3: where the horse stands in the race right now. */
  rank: number;
  x: number;
  y: number;
  /** False when the horse is out of the window's view. */
  visible: boolean;
}

/**
 * Shared between the 3D scene, which works out the tags every frame, and the overlay, which draws them. A plain object read every
 * frame (no React state), so moving tags never cause renders.
 */
export const railTags: { current: RailTag[] } = { current: [] };

/** How many horses get a name in the rail camera. */
export const RAIL_TAG_COUNT = 3;

/** The first three horses, best first: those home by their finishing place, then the rest by how far they have run. */
export function leadingRacers<T extends { place: number | null; distance: number }>(racers: readonly T[], count = RAIL_TAG_COUNT): T[] {
  return [...racers]
    .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || b.distance - a.distance)
    .slice(0, count);
}

/** The size of a tag in the window, as fractions of its width and height (for keeping neighbours from lying on top of each other). */
export const RAIL_TAG_SIZE = { w: 0.36, h: 0.13 } as const;

/**
 * Moves tags that would overlap an earlier (better-placed) one up, a tag's height at a time, so each name can be read when horses are close
 * together. Pure: returns the vertical position (a fraction of the window height) for each tag, in the order given.
 */
export function separateTags(tags: readonly { x: number; y: number }[], size = RAIL_TAG_SIZE, topLimit = 0.16): number[] {
  const placed: { x: number; y: number }[] = [];
  return tags.map((tag) => {
    let y = tag.y;
    while (y > topLimit && placed.some((p) => Math.abs(p.x - tag.x) < size.w && Math.abs(p.y - y) < size.h)) y -= size.h;
    placed.push({ x: tag.x, y });
    return y;
  });
}
