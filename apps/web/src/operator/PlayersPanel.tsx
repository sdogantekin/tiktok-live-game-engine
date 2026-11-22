import type { TeamStanding } from '@live-game/contracts';
import { useState } from 'react';
import { useRealtime } from '../realtime/react';
import type { RunCommand } from './OperatorApp';

/** Stable fallback: a selector must not return a fresh array on every call. */
const NO_TEAMS: readonly TeamStanding[] = [];

const MAX_ROWS = 200;

export function PlayersPanel({ run }: { run: RunCommand }) {
  const players = useRealtime((state) => state.players);
  const teams = useRealtime((state) => state.hud?.teams ?? NO_TEAMS);
  const [filter, setFilter] = useState('');

  const needle = filter.trim().toLowerCase();
  const all = Object.values(players).sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  const matching = needle ? all.filter((p) => p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle)) : all;
  const rows = matching.slice(0, MAX_ROWS);
  const teamName = (id: string | null) => teams.find((team) => team.id === id)?.name ?? '—';

  return (
    <section className="panel" data-testid="players">
      <h2>Players ({all.length})</h2>
      <input placeholder="filter by name or id" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter players" />
      <div className="scroll">
        <table>
          <tbody>
            {rows.map((player) => (
              <tr key={player.id} data-player={player.id}>
                <td>{player.name}</td>
                <td className="muted">{player.id}</td>
                <td>{teamName(player.teamId)}</td>
                <td className="actions">
                  {teams
                    .filter((team) => team.id !== player.teamId)
                    .map((team) => (
                      <button key={team.id} onClick={() => run({ type: 'reassign_player', playerId: player.id, teamId: team.id })}>
                        → {team.name}
                      </button>
                    ))}
                  <button onClick={() => run({ type: 'remove_player', playerId: player.id })}>Remove</button>
                  <button className="danger" onClick={() => run({ type: 'ignore_player', playerId: player.id })}>
                    Ignore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {matching.length > rows.length && <p className="muted">Showing the first {MAX_ROWS} of {matching.length}.</p>}
        {all.length === 0 && <p className="muted">No players yet. Add simulated viewers.</p>}
      </div>
    </section>
  );
}
