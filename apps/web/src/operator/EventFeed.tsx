import type { TeamStanding } from '@live-game/contracts';
import { useRealtime } from '../realtime/react';
import type { FeedEvent } from '../realtime/store';

/** Stable fallback: a selector must not return a fresh array on every call. */
const NO_TEAMS: readonly TeamStanding[] = [];

const HINT_TEXT = { no_team: 'must pick a team first', switch_locked: 'tried to switch teams mid-round', queued: 'is waiting for a place in the next race' } as const;

export function EventFeed() {
  const feed = useRealtime((state) => state.feed);
  const players = useRealtime((state) => state.players);
  const teams = useRealtime((state) => state.hud?.teams ?? NO_TEAMS);

  const who = (playerId: string) => players[playerId]?.name ?? playerId;
  const describe = (event: FeedEvent): string => {
    switch (event.type) {
      case 'player_joined':
        return `${who(event.playerId)} joined ${teams.find((team) => team.id === event.teamId)?.name ?? event.teamId}`;
      case 'celebration':
        return `Celebration: ${event.effect}${event.playerId ? ` (${who(event.playerId)})` : ''}`;
      case 'hint':
        return `${who(event.playerId)} ${HINT_TEXT[event.reason]}`;
      case 'chat':
        return `${who(event.playerId)} said: ${event.text}`; // shown on stream, so the operator can see what viewers see
    }
  };

  return (
    <section className="panel" data-testid="feed">
      <h2>Recent events</h2>
      <ol className="feed">
        {feed.slice(0, 40).map((entry) => (
          <li key={entry.key}>
            <time className="muted mono">{new Date(entry.at).toLocaleTimeString()}</time> {describe(entry.event)}
          </li>
        ))}
      </ol>
      {feed.length === 0 && <p className="muted">Nothing yet.</p>}
    </section>
  );
}
