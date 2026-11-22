import { PublicSnapshotSchema } from '@live-game/contracts';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../clock';
import type { RoundTimings } from '../rounds/round-service';
import { GameState } from './game-state';

const TEAMS = [
  { id: 'gelin', name: 'Gelin Takımı' },
  { id: 'damat', name: 'Damat Takımı' },
];
const TIMINGS: RoundTimings = { countdownMs: 15_000, roundMs: 180_000, resultsMs: 15_000, autoNext: false };

function setup(timings: Partial<RoundTimings> = {}) {
  const clock = new ManualClock();
  const state = new GameState({ modeId: 'mahalle-halayi', teams: TEAMS, clock, timings: { ...TIMINGS, ...timings } });
  return { clock, state };
}

function join(state: GameState, id: string, team?: string) {
  state.registerViewer(id, id);
  if (team) state.joinTeam(id, team);
}

describe('team switching by phase', () => {
  it('allows first assignment in every phase and switching only before the round starts', () => {
    const { state } = setup();
    join(state, 'a', 'gelin');
    expect(state.joinTeam('a', 'damat')).toEqual({ ok: true, changed: true }); // stopped

    state.rounds.startGame(); // lobby
    expect(state.joinTeam('a', 'gelin')).toEqual({ ok: true, changed: true });

    state.rounds.startRound(); // active
    expect(state.joinTeam('a', 'damat')).toEqual({ ok: false, reason: 'switch_locked' });
    join(state, 'late');
    expect(state.joinTeam('late', 'damat')).toEqual({ ok: true, changed: true }); // late joiner

    expect(state.joinTeam('a', 'damat', { force: true })).toEqual({ ok: true, changed: true }); // operator
    state.rounds.pause();
    expect(state.joinTeam('a', 'gelin')).toEqual({ ok: false, reason: 'switch_locked' });

    state.rounds.endRound(); // results
    expect(state.joinTeam('a', 'gelin')).toEqual({ ok: false, reason: 'switch_locked' });
  });
});

describe('energy', () => {
  it('is accepted only during an unpaused active round, for team members', () => {
    const { state } = setup();
    join(state, 'a', 'gelin');
    join(state, 'nobody');

    expect(state.addEnergy('a', 1)).toEqual({ ok: false, reason: 'not_scoring' }); // stopped
    state.rounds.startGame();
    expect(state.addEnergy('a', 1)).toEqual({ ok: false, reason: 'not_scoring' }); // lobby
    state.rounds.startRound();

    expect(state.addEnergy('a', 1)).toEqual({ ok: true });
    expect(state.addEnergy('nobody', 1)).toEqual({ ok: false, reason: 'no_team' });
    expect(state.addEnergy('ghost', 1)).toEqual({ ok: false, reason: 'unknown_player' });

    state.rounds.pause();
    expect(state.addEnergy('a', 1)).toEqual({ ok: false, reason: 'not_scoring' });
    state.rounds.resume();
    state.rounds.endRound();
    expect(state.addEnergy('a', 1)).toEqual({ ok: false, reason: 'not_scoring' }); // results

    expect(state.scoring.get('gelin')).toBe(1);
    expect(state.players.get('a')!.stats).toEqual({ actions: 1, energy: 1 });
  });

  it('does not accept energy from ignored players', () => {
    const { state } = setup();
    join(state, 'a', 'gelin');
    state.rounds.startGame();
    state.rounds.startRound();
    state.players.ignore('a');
    expect(state.addEnergy('a', 1)).toEqual({ ok: false, reason: 'unknown_player' });
  });
});

describe('round results', () => {
  function playRound(state: GameState, gelin: number, damat: number) {
    join(state, 'g', 'gelin');
    join(state, 'd', 'damat');
    state.rounds.startGame();
    state.rounds.startRound();
    for (let i = 0; i < gelin; i++) state.addEnergy('g', 1);
    for (let i = 0; i < damat; i++) state.addEnergy('d', 1);
    state.rounds.endRound();
  }

  it('picks the winner by team energy', () => {
    const { state } = setup();
    playRound(state, 3, 1);
    expect(state.lastResult).toEqual({
      round: 1,
      winner: 'gelin',
      teams: [
        { id: 'gelin', name: 'Gelin Takımı', score: 3, playerCount: 1 },
        { id: 'damat', name: 'Damat Takımı', score: 1, playerCount: 1 },
      ],
    });
  });

  it('declares a draw on equal energy, including 0–0', () => {
    const a = setup();
    playRound(a.state, 2, 2);
    expect(a.state.lastResult?.winner).toBeNull();

    const b = setup();
    playRound(b.state, 0, 0);
    expect(b.state.lastResult?.winner).toBeNull();
  });

  it('resets scores when the next round begins but keeps the previous result and team membership', () => {
    const { clock, state } = setup({ autoNext: true });
    join(state, 'g', 'gelin');
    state.rounds.startGame();
    state.rounds.startRound();
    state.addEnergy('g', 1);
    state.rounds.endRound();
    expect(state.scoring.get('gelin')).toBe(1); // still shown on the results screen

    clock.advance(15_000);
    state.tick(); // results → lobby → countdown (round 2)
    expect(state.rounds.phase).toBe('countdown');
    expect(state.rounds.round).toBe(2);
    expect(state.scoring.get('gelin')).toBe(0);
    expect(state.lastResult?.round).toBe(1);
    expect(state.players.get('g')!.teamId).toBe('gelin');
  });

  it('runs a full automatic loop on timers', () => {
    const { clock, state } = setup({ autoNext: true });
    join(state, 'g', 'gelin');
    state.rounds.startGame();
    clock.advance(15_000);
    state.tick();
    state.addEnergy('g', 1);
    clock.advance(180_000);
    state.tick();
    expect(state.rounds.phase).toBe('results');
    expect(state.lastResult?.winner).toBe('gelin');
  });
});

describe('operator score reset', () => {
  it('zeroes scores during an active round only', () => {
    const { state } = setup();
    join(state, 'a', 'gelin');
    expect(state.resetRoundScore()).toEqual({ ok: false, reason: 'invalid_phase' });
    state.rounds.startGame();
    state.rounds.startRound();
    state.addEnergy('a', 1);
    expect(state.resetRoundScore()).toEqual({ ok: true });
    expect(state.scoring.get('gelin')).toBe(0);
  });
});

describe('snapshot', () => {
  it('matches the public contract and carries timing for clients', () => {
    const { clock, state } = setup();
    join(state, 'a', 'gelin');
    state.rounds.startGame();
    state.rounds.startRound();

    const snapshot = state.snapshot();
    expect(PublicSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot).toMatchObject({
      modeId: 'mahalle-halayi',
      serverNow: clock.now(),
      phase: 'active',
      paused: false,
      round: 1,
      phaseEndsAt: clock.now() + 180_000,
      remainingMs: null,
      lastResult: null,
    });
    expect(snapshot.players).toEqual([
      { id: 'a', name: 'a', teamId: 'gelin', joinedAt: clock.now(), lastActiveAt: clock.now() },
    ]);
  });

  it('represents pause with remainingMs and no deadline', () => {
    const { clock, state } = setup();
    state.rounds.startGame();
    state.rounds.startRound();
    clock.advance(30_000);
    state.rounds.pause();
    const snapshot = state.snapshot();
    expect(PublicSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot).toMatchObject({ paused: true, phaseEndsAt: null, remainingMs: 150_000 });
  });

  it('omits ignored players', () => {
    const { state } = setup();
    join(state, 'a', 'gelin');
    join(state, 'b', 'damat');
    state.players.ignore('a');
    const snapshot = state.snapshot();
    expect(snapshot.players.map((p) => p.id)).toEqual(['b']);
    expect(snapshot.teams.map((t) => t.playerCount)).toEqual([0, 1]);
  });

  it('handles 200 participants', () => {
    const { state } = setup();
    for (let i = 0; i < 200; i++) join(state, `u${i}`, i % 2 ? 'damat' : 'gelin');
    const snapshot = state.snapshot();
    expect(snapshot.players).toHaveLength(200);
    expect(snapshot.teams.map((t) => t.playerCount)).toEqual([100, 100]);
    expect(PublicSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });
});
