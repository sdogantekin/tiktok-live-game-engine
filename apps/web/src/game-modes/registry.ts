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

/** Every game the web app can present, for the operator's game picker. */
export function listPresentations(): readonly { id: ModeId; title: string }[] {
  return (Object.keys(PRESENTATIONS) as ModeId[]).map((id) => ({ id, title: PRESENTATIONS[id].title }));
}
