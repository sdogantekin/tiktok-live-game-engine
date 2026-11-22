import { useState } from 'react';
import { useRealtime } from '../realtime/react';
import type { RunCommand } from './OperatorApp';

/** Celebrations the operator may trigger by hand; the server rejects any effect the mode does not define. */
const CELEBRATIONS = ['gg', 'big_celebration'] as const;

export function GameControls({ run }: { run: RunCommand }) {
  const hud = useRealtime((state) => state.hud);
  const [confirmingReset, setConfirmingReset] = useState(false);

  if (!hud) return <section className="panel">Waiting for the server…</section>;
  const { phase, paused } = hud;
  const timed = phase === 'countdown' || phase === 'active' || phase === 'results';

  return (
    <section className="panel">
      <h2>Game</h2>
      <div className="row">
        <button onClick={() => run({ type: 'start_game' })} disabled={phase !== 'stopped'}>
          Start game
        </button>
        <button onClick={() => run({ type: 'stop_game' })} disabled={phase === 'stopped'}>
          Stop game
        </button>
        <button onClick={() => run({ type: 'pause' })} disabled={!timed || paused}>
          Pause
        </button>
        <button onClick={() => run({ type: 'resume' })} disabled={!paused}>
          Resume
        </button>
      </div>
      <div className="row">
        <button onClick={() => run({ type: 'start_round' })} disabled={phase !== 'lobby' && phase !== 'countdown'}>
          Start round now
        </button>
        <button onClick={() => run({ type: 'end_round' })} disabled={phase !== 'active'}>
          End round
        </button>
        {confirmingReset ? (
          <>
            <span>Reset this round's scores?</span>
            <button
              className="danger"
              onClick={() => {
                run({ type: 'reset_round_score' });
                setConfirmingReset(false);
              }}
            >
              Confirm reset
            </button>
            <button onClick={() => setConfirmingReset(false)}>Cancel</button>
          </>
        ) : (
          <button onClick={() => setConfirmingReset(true)} disabled={phase !== 'active'}>
            Reset score…
          </button>
        )}
      </div>
      <div className="row">
        <span>Celebrate:</span>
        {CELEBRATIONS.map((effect) => (
          <button key={effect} onClick={() => run({ type: 'trigger_celebration', effect })}>
            {effect}
          </button>
        ))}
      </div>
    </section>
  );
}

export function Scoreboard() {
  const hud = useRealtime((state) => state.hud);
  if (!hud) return null;

  return (
    <section className="panel">
      <h2>Scores</h2>
      <table data-testid="scoreboard">
        <thead>
          <tr>
            <th>Team</th>
            <th>Energy</th>
            <th>Players</th>
          </tr>
        </thead>
        <tbody>
          {hud.teams.map((team) => (
            <tr key={team.id} data-team={team.id}>
              <td>{team.name}</td>
              <td className="num" data-testid={`score-${team.id}`}>
                {team.score}
              </td>
              <td className="num">{team.playerCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hud.lastResult && (
        <p>
          Last result (round {hud.lastResult.round}):{' '}
          {hud.lastResult.winner
            ? (hud.teams.find((team) => team.id === hud.lastResult?.winner)?.name ?? hud.lastResult.winner)
            : 'draw'}
        </p>
      )}
    </section>
  );
}
