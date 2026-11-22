import { describe, expect, it } from 'vitest';
import { Publisher } from '../src/realtime/publisher';
import { createTestEngine } from './helpers';

// Payloads are asserted structurally; their exact shapes are covered by the contract schemas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = any;

function setup(maxActionsPerBatch?: number) {
  const harness = createTestEngine();
  const sent: { event: string; payload: Payload }[] = [];
  const publisher = new Publisher({
    engine: harness.engine,
    maxActionsPerBatch,
    send: (event, payload) => sent.push({ event, payload }),
  });
  const of = (event: string) => sent.filter((m) => m.event === event).map((m) => m.payload);
  return { ...harness, publisher, sent, of };
}

describe('HUD publishing', () => {
  it('sends once, stays quiet while nothing changes (even as time passes), and resends on change', () => {
    const { publisher, clock, engine, of } = setup();
    publisher.publishState();
    expect(of('state:hud')).toHaveLength(1);

    clock.advance(5_000); // serverNow moves, state does not
    publisher.publishState();
    expect(of('state:hud')).toHaveLength(1);

    engine.operator({ type: 'start_game' });
    publisher.publishState();
    expect(of('state:hud')).toHaveLength(2);
    expect(of('state:hud')[1]).toMatchObject({ phase: 'countdown', round: 1, serverNow: clock.now() });
    expect(of('state:hud')[1]).not.toHaveProperty('players');
  });

  it('reflects provider status and score changes', () => {
    const { publisher, engine, say, startActiveRound, of } = setup();
    say('a', 'gelin');
    startActiveRound();
    publisher.publishState();

    engine.state.setProviderStatus('disconnected');
    publisher.publishState();
    expect(of('state:hud').at(-1)).toMatchObject({ providerStatus: 'disconnected' });

    say('a', 'halay');
    publisher.publishState();
    expect(of('state:hud').at(-1).teams).toContainEqual(expect.objectContaining({ id: 'gelin', score: 1, playerCount: 1 }));
  });
});

describe('roster deltas', () => {
  it('sends joins, team changes and removals once each', () => {
    const { publisher, engine, say, of } = setup();
    say('a', 'gelin');
    say('b', 'damat');
    publisher.publishState();
    expect(of('state:roster')).toHaveLength(1);
    expect(of('state:roster')[0].upsert.map((p: { id: string }) => p.id)).toEqual(['test:a', 'test:b']);
    expect(of('state:roster')[0].remove).toEqual([]);

    publisher.publishState(); // unchanged
    expect(of('state:roster')).toHaveLength(1);

    say('a', 'damat'); // switch (allowed while stopped)
    publisher.publishState();
    expect(of('state:roster')[1]).toEqual({
      upsert: [expect.objectContaining({ id: 'test:a', teamId: 'damat' })],
      remove: [],
    });

    engine.operator({ type: 'remove_player', playerId: 'test:b' });
    engine.operator({ type: 'ignore_player', playerId: 'test:a' });
    publisher.publishState();
    expect(of('state:roster')[2]).toEqual({ upsert: [], remove: expect.arrayContaining(['test:a', 'test:b']) });
    expect(of('state:roster')[2].remove).toHaveLength(2);
  });

  it('does not resend the roster for activity-only changes', () => {
    const { publisher, clock, say, startActiveRound, of } = setup();
    say('a', 'gelin');
    startActiveRound();
    publisher.publishState();
    const before = of('state:roster').length;
    clock.advance(10_000);
    say('a', 'halay'); // updates lastActiveAt only
    publisher.publishState();
    expect(of('state:roster')).toHaveLength(before);
  });
});

describe('presentation batching', () => {
  it('sends nothing when idle and one batch otherwise', () => {
    const { publisher, of } = setup();
    publisher.flushPresentation();
    expect(of('presentation:batch')).toHaveLength(0);

    publisher.onPresentation({ type: 'celebration', effect: 'gg' });
    publisher.flushPresentation();
    publisher.flushPresentation();
    expect(of('presentation:batch')).toEqual([{ events: [{ type: 'celebration', effect: 'gg' }], crowd: [] }]);
  });

  it('caps individual player actions per batch and folds the rest into per-team crowd counts', () => {
    const { publisher, say, of } = setup(5);
    for (let i = 0; i < 30; i++) say(`p${i}`, i < 20 ? 'gelin' : 'damat');

    const celebration = { type: 'celebration' as const, effect: 'big_celebration' };
    publisher.onPresentation(celebration);
    for (let i = 0; i < 30; i++) {
      publisher.onPresentation({ type: 'player_action', playerId: `test:p${i}`, animation: 'halay' });
    }
    publisher.onPresentation({ type: 'hint', playerId: 'test:p0', reason: 'no_team' });
    publisher.flushPresentation();

    const [batch] = of('presentation:batch');
    expect(batch.events.filter((e: { type: string }) => e.type === 'player_action')).toHaveLength(5);
    expect(batch.events).toContainEqual(celebration); // non-action cues are never folded away
    expect(batch.events.at(-1)).toMatchObject({ type: 'hint' });

    const crowd = Object.fromEntries(batch.crowd.map((c: { teamId: string; actions: number }) => [c.teamId, c.actions]));
    expect(crowd.gelin + crowd.damat).toBe(25);
    expect(crowd).toEqual({ gelin: 15, damat: 10 }); // actions 0-4 kept (all gelin); 15 gelin + 10 damat folded
  });

  it('skips crowd counts for players who are unknown or have no team', () => {
    const { publisher, of } = setup(0);
    publisher.onPresentation({ type: 'player_action', playerId: 'nobody', animation: 'halay' });
    publisher.flushPresentation();
    expect(of('presentation:batch')[0]).toEqual({ events: [], crowd: [] });
  });
});

describe('presentation batch timing', () => {
  it('carries the oldest ingest time of the cues in the batch, and starts fresh for the next one', () => {
    const { publisher, of } = setup();
    publisher.onPresentation({ type: 'celebration', effect: 'gg' }, 5_000);
    publisher.onPresentation({ type: 'celebration', effect: 'gg' }, 4_200);
    publisher.onPresentation({ type: 'celebration', effect: 'gg' }, 6_000);
    publisher.flushPresentation();
    publisher.onPresentation({ type: 'celebration', effect: 'gg' });
    publisher.flushPresentation();

    const [first, second] = of('presentation:batch');
    expect(first.oldestIngestedAt).toBe(4_200);
    expect(second).not.toHaveProperty('oldestIngestedAt');
  });
});
