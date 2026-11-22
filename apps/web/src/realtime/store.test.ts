import type { HudState, PublicPlayer, PublicSnapshot } from '@live-game/contracts';
import { describe, expect, it } from 'vitest';
import { createRealtimeStore, MAX_FEED, MAX_JOINERS } from './store';
import { formatClock, remainingMs } from './time';

const hud = (overrides: Partial<HudState> = {}): HudState => ({
  modeId: 'mahalle-halayi',
  serverNow: 1_000_000,
  phase: 'stopped',
  paused: false,
  round: 0,
  phaseEndsAt: null,
  remainingMs: null,
  providerStatus: 'connected',
  teams: [
    { id: 'gelin', name: 'Gelin Takımı', score: 0, playerCount: 0 },
    { id: 'damat', name: 'Damat Takımı', score: 0, playerCount: 0 },
  ],
  lastResult: null,
  ...overrides,
});

const player = (id: string, teamId: string | null = null, name = id): PublicPlayer => ({
  id,
  name,
  teamId,
  joinedAt: 1,
  lastActiveAt: 1,
});

const snapshot = (players: PublicPlayer[] = [], overrides: Partial<HudState> = {}): PublicSnapshot => ({
  ...hud(overrides),
  players,
});

describe('connection and snapshots', () => {
  it('starts connecting with no state, then adopts a snapshot as the baseline', () => {
    const store = createRealtimeStore(() => 1_000_500);
    expect(store.getState()).toMatchObject({ connection: 'connecting', hud: null, players: {} });

    store.getState().setConnection('connected');
    store.getState().applySnapshot(snapshot([player('a', 'gelin'), player('b')], { phase: 'active', round: 1 }));

    const state = store.getState();
    expect(state.connection).toBe('connected');
    expect(state.hud).toMatchObject({ phase: 'active', round: 1 });
    expect(state.hud).not.toHaveProperty('players');
    expect(Object.keys(state.players)).toEqual(['a', 'b']);
    expect(state.clockOffsetMs).toBe(-500);
    expect(state.joiners).toEqual([]); // existing players are not "news"
  });

  it('a reconnect snapshot replaces stale state wholesale', () => {
    const store = createRealtimeStore();
    store.getState().applySnapshot(snapshot([player('a', 'gelin'), player('b', 'damat')]));
    store.getState().applySnapshot(snapshot([player('c', 'gelin')], { phase: 'results' }));
    expect(Object.keys(store.getState().players)).toEqual(['c']);
    expect(store.getState().hud?.phase).toBe('results');
  });

  it('HUD updates replace the HUD and refresh the clock offset but keep the roster', () => {
    let clientNow = 1_000_000;
    const store = createRealtimeStore(() => clientNow);
    store.getState().applySnapshot(snapshot([player('a', 'gelin')]));
    clientNow = 1_005_000;
    store.getState().applyHud(hud({ serverNow: 1_002_000, phase: 'countdown' }));
    expect(store.getState().hud?.phase).toBe('countdown');
    expect(store.getState().clockOffsetMs).toBe(-3_000);
    expect(Object.keys(store.getState().players)).toEqual(['a']);
  });
});

describe('roster deltas', () => {
  it('upserts, removes, and announces newly teamed players (newest first, bounded)', () => {
    const store = createRealtimeStore();
    store.getState().applySnapshot(snapshot([player('old', 'gelin')]));

    store.getState().applyRoster({ upsert: [player('a', 'gelin', 'Ayşe'), player('b', 'damat', 'Burak')], remove: [] });
    expect(store.getState().joiners.map((j) => j.name)).toEqual(['Burak', 'Ayşe']);
    expect(Object.keys(store.getState().players).sort()).toEqual(['a', 'b', 'old']);

    store.getState().applyRoster({ upsert: [], remove: ['old'] });
    expect(store.getState().players).not.toHaveProperty('old');

    const many = Array.from({ length: 20 }, (_, i) => player(`p${i}`, 'gelin'));
    store.getState().applyRoster({ upsert: many, remove: [] });
    expect(store.getState().joiners).toHaveLength(MAX_JOINERS);
    expect(store.getState().joiners[0]?.playerId).toBe('p19');
  });

  it('announces a team switch but not a rename or an unassigned registration', () => {
    const store = createRealtimeStore();
    store.getState().applySnapshot(snapshot([player('a', 'gelin', 'Ayşe')]));

    store.getState().applyRoster({ upsert: [player('a', 'gelin', 'Ayşe K')], remove: [] }); // rename only
    store.getState().applyRoster({ upsert: [player('lurker', null)], remove: [] }); // no team yet
    expect(store.getState().joiners).toEqual([]);

    store.getState().applyRoster({ upsert: [player('a', 'damat', 'Ayşe K')], remove: [] }); // switched
    expect(store.getState().joiners).toHaveLength(1);
    expect(store.getState().joiners[0]).toMatchObject({ playerId: 'a', teamId: 'damat' });
  });

  it('does not mutate the previous players object', () => {
    const store = createRealtimeStore();
    store.getState().applySnapshot(snapshot([player('a', 'gelin')]));
    const before = store.getState().players;
    store.getState().applyRoster({ upsert: [player('b', 'gelin')], remove: [] });
    expect(Object.keys(before)).toEqual(['a']);
  });
});

describe('presentation batches', () => {
  it('keeps notable cues in the feed, newest first, and counts actions including folded crowd actions', () => {
    const store = createRealtimeStore(() => 42);
    store.getState().applyPresentation({
      events: [
        { type: 'player_joined', playerId: 'a', teamId: 'gelin' },
        { type: 'player_action', playerId: 'a', animation: 'halay' },
        { type: 'celebration', effect: 'gg' },
      ],
      crowd: [{ teamId: 'gelin', actions: 7 }],
    });
    const state = store.getState();
    expect(state.actionsTotal).toBe(8);
    expect(state.feed.map((entry) => entry.event.type)).toEqual(['celebration', 'player_joined']);
    expect(state.feed[0]?.at).toBe(42);
    expect(new Set(state.feed.map((e) => e.key)).size).toBe(2);
  });

  it('bounds the feed', () => {
    const store = createRealtimeStore();
    for (let i = 0; i < MAX_FEED + 30; i++) {
      store.getState().applyPresentation({ events: [{ type: 'celebration', effect: 'gg' }], crowd: [] });
    }
    expect(store.getState().feed).toHaveLength(MAX_FEED);
  });
});

describe('countdown time', () => {
  it('derives remaining time from the server deadline and the clock offset', () => {
    const state = hud({ phase: 'active', phaseEndsAt: 1_060_000, serverNow: 1_000_000 });
    // Client clock is 10 minutes behind the server: offset = server - client.
    const clientNow = 400_000;
    const offset = 1_000_000 - clientNow;
    expect(remainingMs(state, offset, clientNow)).toBe(60_000);
    expect(remainingMs(state, offset, clientNow + 59_000)).toBe(1_000);
    expect(remainingMs(state, offset, clientNow + 90_000)).toBe(0); // never negative
  });

  it('shows the frozen time while paused and nothing when untimed', () => {
    expect(remainingMs(hud({ phase: 'active', paused: true, phaseEndsAt: null, remainingMs: 25_000 }), 0, 5)).toBe(25_000);
    expect(remainingMs(hud({ phase: 'lobby' }), 0, 5)).toBeNull();
    expect(remainingMs(null, 0, 5)).toBeNull();
  });

  it('formats mm:ss, rounding up', () => {
    expect(formatClock(null)).toBe('--:--');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(180_000)).toBe('03:00');
    expect(formatClock(61_000)).toBe('01:01');
  });
});
