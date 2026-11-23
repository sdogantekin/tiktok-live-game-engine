import type { HudState, RaceView } from '@live-game/contracts';
import { type CSSProperties, useSyncExternalStore } from 'react';
import type { LiveFeed } from '../../game-renderer/live-feed';
import { lapOf, racerColor } from './track';

/** Everything is sized in stage units (`--u` is 1% of the stage width), like the rest of the broadcast. */
const u = (n: number) => `calc(var(--u) * ${n})`;
const panel: CSSProperties = { position: 'absolute', background: 'rgba(15, 24, 15, 0.72)', color: '#fff', borderRadius: u(1.6), fontFamily: 'inherit' };

function useRace(live: LiveFeed): RaceView | null {
  const view = useSyncExternalStore(live.subscribe, live.latest);
  return view?.kind === 'race' ? view : null;
}

/** The race's own HUD: standings, the lap, who is waiting, a legend, and the ranking once it is over. */
export function Overlay({ hud, live }: { hud: HudState; live: LiveFeed }) {
  const view = useRace(live);
  const standing = view ? [...view.racers].sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || b.distance - a.distance) : [];
  const leader = standing[0];

  return (
    <>
      <section style={{ ...panel, left: u(2), top: u(21), width: u(38), padding: u(1.4) }} data-testid="standings" aria-label="Sıralama">
        {standing.slice(0, 10).map((racer, i) => (
          <div key={racer.id} style={{ display: 'flex', alignItems: 'center', gap: u(1.2), height: u(4.6), fontSize: u(3.2) }} data-testid="standing-row">
            <span style={{ width: u(3.4), textAlign: 'right', opacity: 0.85 }}>{i + 1}</span>
            <span style={{ width: u(2.6), height: u(2.6), borderRadius: '50%', background: racerColor(racer.id), flex: 'none' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: i === 0 ? 700 : 500 }}>{racer.name}</span>
          </div>
        ))}
        {standing.length === 0 && <div style={{ fontSize: u(3.2), opacity: 0.8 }}>Yarışçı bekleniyor…</div>}
      </section>

      {view && (
        <section style={{ ...panel, right: u(2), top: u(21), padding: u(1.6), fontSize: u(3.4), textAlign: 'right' }}>
          <div data-testid="lap">Tur {leader ? lapOf(leader.distance, view.lapLength, view.laps) : 1} / {view.laps}</div>
          <div style={{ fontSize: u(2.8), opacity: 0.85 }}>
            Yarışçı {view.racers.length}/{view.capacity}
            {view.waiting > 0 ? ` · Sırada ${view.waiting}` : ''}
          </div>
        </section>
      )}

      {hud.phase !== 'results' && (
        <section style={{ ...panel, left: u(2), right: u(2), bottom: u(34), padding: u(1.6), fontSize: u(3), textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>Katılmak için 1 yaz!</div>
          <div style={{ opacity: 0.9 }}>Beğeni atarak atını hızlandır · hediyeler ekstra güç verir</div>
        </section>
      )}

      {hud.phase === 'results' && hud.lastResult?.ranking && (
        <section style={{ ...panel, left: '50%', top: '42%', transform: 'translate(-50%, 0)', width: u(70), padding: u(2.4), textAlign: 'center' }} data-testid="race-result">
          <div style={{ fontSize: u(5), fontWeight: 800, marginBottom: u(1) }}>Yarış bitti!</div>
          {hud.lastResult.ranking.slice(0, 5).map((entry) => (
            <div key={entry.playerId} style={{ fontSize: u(entry.place === 1 ? 4.6 : 3.6), fontWeight: entry.place === 1 ? 800 : 500 }}>
              {entry.place}. {entry.name}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
