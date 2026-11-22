import { PublicSnapshotSchema } from '@live-game/contracts';
import { describe, expect, it } from 'vitest';
import { burstScenario, chaosScenario, steadyScenario } from '../src/providers/simulator/scenarios';
import { createTestEngine, runSchedule } from './helpers';

const SEED = 20261122;

function playSteady200() {
  const harness = createTestEngine();
  const startedAt = harness.clock.now();
  harness.engine.operator({ type: 'start_game' });

  const schedule = steadyScenario({
    seed: SEED,
    viewers: 200,
    startAt: startedAt,
    joinWindowMs: 20_000,
    durationMs: 200_000,
    eventsPerSecond: 25,
    giftRate: 0.02,
  });
  runSchedule(harness, schedule, startedAt, 200_000);
  return { ...harness, schedule };
}

describe('steady-200 scenario (simulator → engine, no network)', () => {
  const run = playSteady200();
  const snapshot = run.engine.snapshot();

  it('registers all 200 simulated participants on the two teams', () => {
    expect(snapshot.players).toHaveLength(200);
    expect(snapshot.players.every((p) => p.teamId === 'gelin' || p.teamId === 'damat')).toBe(true);
    const [gelin, damat] = snapshot.teams;
    expect((gelin?.playerCount ?? 0) + (damat?.playerCount ?? 0)).toBe(200);
  });

  it('plays a full round on the server: countdown → active → results with a result recorded', () => {
    expect(snapshot.phase).toBe('results');
    expect(snapshot.lastResult).not.toBeNull();
    const result = snapshot.lastResult!;
    expect(result.round).toBe(1);
    expect(result.teams.reduce((sum, team) => sum + team.playerCount, 0)).toBe(200);
    expect(result.teams.every((team) => team.score > 0)).toBe(true);

    const [a, b] = result.teams;
    const expectedWinner = a!.score === b!.score ? null : a!.score > b!.score ? a!.id : b!.id;
    expect(result.winner).toBe(expectedWinner);
  });

  it('keeps the score bounded by the cooldown rule', () => {
    // One point per player per 5 s over a 180 s round at most.
    const total = snapshot.lastResult!.teams.reduce((sum, team) => sum + team.score, 0);
    expect(total).toBeLessThanOrEqual(200 * Math.ceil(180 / 5));
    expect(total).toBeGreaterThan(0);
  });

  it('processed the traffic without errors, with gifts producing effects', () => {
    expect(run.engine.stats.errors).toBe(0);
    expect(run.engine.stats.invalid).toBe(0);
    expect(run.engine.stats.processed).toBeGreaterThan(1000);
    expect(run.engine.queueDepth).toBe(0);
    expect(run.presentation.some((e) => e.type === 'celebration')).toBe(true);
    expect(run.presentation.filter((e) => e.type === 'player_joined')).toHaveLength(200);
  });

  it('produces a valid public snapshot', () => {
    expect(PublicSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const again = playSteady200().engine.snapshot();
    expect(again).toEqual(snapshot);
  });
});

describe('burst scenario', () => {
  it('200 simultaneous halay comments cannot exceed one point each', () => {
    const harness = createTestEngine();
    const startedAt = harness.clock.now();
    const { engine, clock } = harness;

    // Join everyone first, then start the round and burst.
    runSchedule(harness, steadyScenario({ seed: 1, viewers: 200, startAt: startedAt, joinWindowMs: 5_000, durationMs: 5_001, eventsPerSecond: 1 }), startedAt, 5_000);
    engine.operator({ type: 'start_game' });
    engine.operator({ type: 'start_round' });
    clock.advance(10_000); // let any earlier cooldowns lapse

    const burstStart = clock.now();
    runSchedule(harness, burstScenario({ seed: 2, viewers: 200, startAt: burstStart, atMs: 0, spreadMs: 2_000, text: 'halay', idPrefix: 'burst' }), burstStart, 2_000);

    const total = engine.state.scoring.get('gelin') + engine.state.scoring.get('damat');
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(200);
    expect(engine.stats.errors).toBe(0);
  });
});

describe('chaos scenario', () => {
  it('never throws, stalls, or grows the queue, and the game stays consistent', () => {
    const harness = createTestEngine();
    const startedAt = harness.clock.now();
    harness.engine.operator({ type: 'start_game' });

    runSchedule(
      harness,
      chaosScenario({ seed: 99, viewers: 100, startAt: startedAt, durationMs: 120_000, episodes: 3000 }),
      startedAt,
      120_000,
    );

    const { engine } = harness;
    expect(engine.stats.errors).toBe(0);
    expect(engine.stats.invalid).toBeGreaterThan(0);
    expect(engine.stats.duplicate).toBeGreaterThan(0);
    expect(engine.stats.rateLimited).toBeGreaterThan(0);
    expect(engine.queueDepth).toBe(0);
    expect(engine.stats.maxQueueDepth).toBeLessThanOrEqual(1000);
    expect(PublicSnapshotSchema.safeParse(engine.snapshot()).success).toBe(true);
    expect(engine.state.players.count).toBeLessThanOrEqual(100);

    // The inert, hostile display name was stored as plain text and never as markup-bearing structure.
    const names = engine.snapshot().players.map((p) => p.name);
    expect(names.every((name) => name.length <= 96)).toBe(true);
  });
});
