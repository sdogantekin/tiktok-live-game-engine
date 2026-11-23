import { useRealtime } from '../realtime/react';
import type { RunCommand } from './OperatorApp';

/** Broadcast sound: mute and volume. The server keeps the settings, so every broadcast view agrees and they survive a refresh. */
export function SoundPanel({ run }: { run: RunCommand }) {
  const sound = useRealtime((state) => state.hud?.sound);
  if (!sound) return null;

  return (
    <section className="panel" data-testid="sound">
      <h2>Sound</h2>
      <div className="row">
        <button onClick={() => run({ type: 'set_sound', muted: !sound.muted })} aria-pressed={sound.muted}>
          {sound.muted ? 'Unmute' : 'Mute'}
        </button>
        <label>
          Volume {Math.round(sound.volume * 100)}%
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(sound.volume * 100)}
            onChange={(event) => run({ type: 'set_sound', volume: Number(event.target.value) / 100 })}
            aria-label="Sound volume"
          />
        </label>
        <span data-testid="sound-state">{sound.muted ? 'muted' : 'on'}</span>
      </div>
    </section>
  );
}
