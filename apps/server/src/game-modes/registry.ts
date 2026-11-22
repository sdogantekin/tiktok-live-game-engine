import type { ModeId } from '@live-game/contracts';
import type { GameMode } from '../core/mode';
import { createMahalleHalayiMode } from './mahalle-halayi/rules';

/** Static, build-time registry. Adding a mode means adding an entry here; there is no runtime loading. */
const MODES: Record<ModeId, () => GameMode> = {
  'mahalle-halayi': createMahalleHalayiMode,
};

export function getGameMode(id: ModeId): GameMode {
  return MODES[id]();
}
