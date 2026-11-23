import { useState } from 'react';
import type { ModeId } from '@live-game/contracts';
import { listPresentations } from '../game-modes/registry';
import { useRealtime } from '../realtime/react';
import type { RunCommand } from './OperatorApp';

/**
 * Which game this server runs. Switching resets players, scores and rounds, so it is only possible while the game is
 * stopped; stop the game first (the button explains why when it is disabled).
 */
export function GamePanel({ run }: { run: RunCommand }) {
  const current = useRealtime((state) => state.hud?.modeId);
  const phase = useRealtime((state) => state.hud?.phase);
  const games = listPresentations();
  const [picked, setPicked] = useState<ModeId | null>(null);
  const selected = picked ?? current ?? games[0]?.id;
  const stopped = phase === 'stopped';
  const title = games.find((game) => game.id === current)?.title ?? current;

  return (
    <section className="panel" data-testid="games">
      <h2>Game</h2>
      <div className="row">
        <span data-testid="current-game">Now: {title ?? '…'}</span>
        <label>
          Game
          <select value={selected} onChange={(event) => setPicked(event.target.value as ModeId)} aria-label="Game">
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.title}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => selected && run({ type: 'select_game', modeId: selected })} disabled={!stopped || !selected}>
          Switch game
        </button>
      </div>
      {!stopped && <p className="hint">Stop the game to switch: switching resets players, scores and rounds.</p>}
    </section>
  );
}
