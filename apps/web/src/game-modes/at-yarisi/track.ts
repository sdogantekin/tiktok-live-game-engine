/**
 * The race track as pure geometry: a stadium-shaped oval (two straights joined by two half circles) whose centre line is
 * exactly one lap long. A horse's place on it comes only from the distance the server reports.
 */
export interface TrackShape {
  /** Radius of the two bends, metres. */
  radius: number;
  /** Length of each straight, metres. */
  straight: number;
  lapLength: number;
}

export function trackShape(lapLength: number, radius = 24): TrackShape {
  const straight = Math.max(0, (lapLength - 2 * Math.PI * radius) / 2);
  return { radius, straight, lapLength };
}

export interface TrackPoint {
  x: number;
  z: number;
  /** Direction of travel (rotation about the vertical axis; 0 faces +z). */
  heading: number;
}

/**
 * Where a horse is after `distance` metres of the centre line, `lateral` metres to the outside of it (a lane). The oval's
 * straights run along z (up and down the screen), centred on the origin; horses start in the middle of the right-hand
 * straight and run up the screen, round the far bend, down the left and back round the near bend.
 */
export function trackPoint(shape: TrackShape, distance: number, lateral = 0): TrackPoint {
  const { radius, straight, lapLength } = shape;
  const d = ((distance % lapLength) + lapLength) % lapLength;
  const half = straight / 2;
  const bend = Math.PI * radius;
  const r = radius + lateral;

  if (d < half) return { x: r, z: -d, heading: Math.PI }; // right straight, up
  let u = d - half;
  if (u < bend) {
    const t = u / radius; // far bend
    return { x: r * Math.cos(t), z: -half - r * Math.sin(t), heading: t + Math.PI };
  }
  u -= bend;
  if (u < straight) return { x: -r, z: -half + u, heading: 0 }; // left straight, down
  u -= straight;
  if (u < bend) {
    const t = u / radius; // near bend
    return { x: -r * Math.cos(t), z: half + r * Math.sin(t), heading: t };
  }
  u -= bend;
  return { x: r, z: half - u, heading: Math.PI }; // right straight again, up to the start
}

/** How far a point on the ground is from the track's centre line, metres (0 on the line; the same inside and outside the oval). */
export function distanceFromTrack(shape: TrackShape, x: number, z: number): number {
  const half = shape.straight / 2;
  const ax = Math.abs(x);
  const az = Math.abs(z);
  return az <= half ? Math.abs(ax - shape.radius) : Math.abs(Math.hypot(ax, az - half) - shape.radius);
}

/** A colour for a racer from its id, so the same viewer keeps the same colour all race. */
export function racerColor(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `hsl(${h % 360}, 78%, 55%)`;
}

/** Which lap (1-based, at most `laps`) a horse that has run `distance` metres is on. */
export const lapOf = (distance: number, lapLength: number, laps: number) => Math.min(laps, Math.floor(distance / lapLength) + 1);
