import { useEffect, useSyncExternalStore } from 'react';
import type { SoundEngine } from '../game-renderer/audio/engine';

/**
 * Browsers keep audio silent until the page has had a click or key press. Any first click or key press unlocks it;
 * until then a small hint is shown (unless the operator has muted the sound, when there is nothing to unlock).
 */
export function SoundGate({ engine, muted, text }: { engine: SoundEngine; muted: boolean; text: string }) {
  const state = useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.ctx.state,
  );

  useEffect(() => {
    const unlock = () => {
      void engine.unlock();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [engine]);

  if (state === 'running' || muted) return null;
  return (
    <button className="sound-gate" onClick={() => void engine.unlock()} data-testid="sound-gate">
      🔈 {text}
    </button>
  );
}
