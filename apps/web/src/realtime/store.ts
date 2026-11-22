import type {
  HudState,
  PresentationBatch,
  PresentationEvent,
  PublicPlayer,
  PublicSnapshot,
  RosterDelta,
} from '@live-game/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'unauthorized';

export interface JoinerEntry {
  /** Unique per entry, for React keys. */
  key: number;
  playerId: string;
  name: string;
  teamId: string;
}

export type FeedEvent = Exclude<PresentationEvent, { type: 'player_action' }>;

export interface FeedEntry {
  key: number;
  /** Client time the entry was received (ms epoch). */
  at: number;
  event: FeedEvent;
}

export const MAX_JOINERS = 6;
export const MAX_FEED = 100;

export interface RealtimeState {
  connection: ConnectionState;
  /** Latest HUD state; null until the first snapshot arrives. */
  hud: HudState | null;
  players: Readonly<Record<string, PublicPlayer>>;
  /** `serverNow - clientNow` at the last HUD, used to turn server deadlines into local countdowns. */
  clockOffsetMs: number;
  /** Newest first. Only players who joined (or got a team) after the last snapshot. */
  joiners: readonly JoinerEntry[];
  /** Newest first; notable cues only (joins, celebrations, hints). */
  feed: readonly FeedEntry[];
  /** Individual and folded `player_action` cues seen since connecting. */
  actionsTotal: number;

  setConnection(connection: ConnectionState): void;
  applySnapshot(snapshot: PublicSnapshot): void;
  applyHud(hud: HudState): void;
  applyRoster(delta: RosterDelta): void;
  applyPresentation(batch: PresentationBatch): void;
}

export type RealtimeStore = StoreApi<RealtimeState>;

export function createRealtimeStore(now: () => number = Date.now): RealtimeStore {
  let nextKey = 1;

  return createStore<RealtimeState>()((set) => ({
    connection: 'connecting',
    hud: null,
    players: {},
    clockOffsetMs: 0,
    joiners: [],
    feed: [],
    actionsTotal: 0,

    setConnection: (connection) => set({ connection }),

    applySnapshot: (snapshot) => {
      const { players, ...hud } = snapshot;
      set({
        hud,
        players: Object.fromEntries(players.map((player) => [player.id, player])),
        clockOffsetMs: hud.serverNow - now(),
        // A (re)connect snapshot is a baseline, not news: no "joined" entries for existing players.
        joiners: [],
      });
    },

    applyHud: (hud) => set({ hud, clockOffsetMs: hud.serverNow - now() }),

    applyRoster: (delta) =>
      set((state) => {
        const players = { ...state.players };
        const fresh: JoinerEntry[] = [];

        for (const player of delta.upsert) {
          const previous = players[player.id];
          players[player.id] = player;
          if (player.teamId && previous?.teamId !== player.teamId) {
            fresh.push({ key: nextKey++, playerId: player.id, name: player.name, teamId: player.teamId });
          }
        }
        for (const id of delta.remove) delete players[id];

        return {
          players,
          joiners: fresh.length ? [...fresh.reverse(), ...state.joiners].slice(0, MAX_JOINERS) : state.joiners,
        };
      }),

    applyPresentation: (batch) =>
      set((state) => {
        const at = now();
        const entries: FeedEntry[] = [];
        let actions = batch.crowd.reduce((sum, crowd) => sum + crowd.actions, 0);

        for (const event of batch.events) {
          if (event.type === 'player_action') actions++;
          else entries.push({ key: nextKey++, at, event });
        }
        return {
          actionsTotal: state.actionsTotal + actions,
          feed: entries.length ? [...entries.reverse(), ...state.feed].slice(0, MAX_FEED) : state.feed,
        };
      }),
  }));
}
