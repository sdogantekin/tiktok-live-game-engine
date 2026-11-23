import type { AvatarModels, CameraConfig } from '../../game-renderer/types';
import { MODEL_URLS } from './assets.manifest';
import { trackShape } from './track';

/** Everything visual about the race that is data. */
export const LAP_LENGTH = 400;
export const shape = trackShape(LAP_LENGTH);

/** The scene draws up to this many horses (the server's capacity is 10). */
export const MAX_RACERS = 12;
/** Width of the track and of each horse's lane, metres. */
export const TRACK_HALF_WIDTH = 8.5;
export const LANE_WIDTH = 1.25;

/** The speed an average horse runs at, so the gallop clip (authored for one stride a second) is played at the right pace. */
export const BASE_SPEED = 16;
/** A stride rate beyond these limits looks silly, whatever the speed. */
export const MIN_STRIDE = 0.35;
export const MAX_STRIDE = 2.1;

export const horseModels: AvatarModels = {
  urls: { horse: MODEL_URLS.horse },
  clips: { idle: 'idle', flourish: 'gallop', jump: 'gallop', spin: 'gallop', wiggle: 'gallop', hop: 'gallop', special: 'victory' },
  looping: ['idle', 'gallop', 'gallop_boost'],
};

/** Coat colours; each horse gets one from its id. Silks (the jockey's clothes and the saddle cloth) take the racer's colour. */
export const COATS = ['#8b5a2b', '#a0522d', '#b8b3a8', '#3a3330', '#d9a441', '#6b4423'] as const;

/** Where the lane for horse `index` of `count` lies, in metres to the outside of the centre line. */
export const laneOffset = (index: number, count: number) => (index - (count - 1) / 2) * LANE_WIDTH;

/** The opening camera; the scene moves it every frame after that. */
export const camera: CameraConfig = { position: [20, 14, -8], lookAt: [0, 1, -10], fov: 52 };
