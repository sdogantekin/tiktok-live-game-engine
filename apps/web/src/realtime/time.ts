import type { HudState } from '@live-game/contracts';

/**
 * Time left in the current timed phase, or null when the phase has no timer.
 * While paused the server freezes the remaining time; otherwise it is derived from the deadline
 * and the measured server/client clock offset, so a client with a wrong clock still shows the right time.
 */
export function remainingMs(hud: HudState | null, clockOffsetMs: number, clientNow: number): number | null {
  if (!hud) return null;
  if (hud.paused) return hud.remainingMs;
  if (hud.phaseEndsAt === null) return null;
  return Math.max(0, hud.phaseEndsAt - (clientNow + clockOffsetMs));
}

/** `mm:ss`, rounding up so the display never shows 00:00 before the phase has actually ended. */
export function formatClock(ms: number | null): string {
  if (ms === null) return '--:--';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
