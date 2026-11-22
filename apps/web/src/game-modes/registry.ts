import type { ModeId } from '@live-game/contracts';
import { mahalleHalayiPresentation } from './mahalle-halayi/presentation';
import type { ModePresentation } from './types';

/** Static, build-time registry of mode presentations (no runtime loading). */
const PRESENTATIONS: Record<ModeId, ModePresentation> = {
  'mahalle-halayi': mahalleHalayiPresentation,
};

export function getPresentation(modeId: ModeId): ModePresentation {
  return PRESENTATIONS[modeId];
}
