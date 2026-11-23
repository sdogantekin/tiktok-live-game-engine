import { describe, expect, it } from 'vitest';
import { Publisher } from '../src/realtime/publisher';
import { createTestEngine } from './helpers';
import { raceStub } from './race-stub';

const like = (harness: ReturnType<typeof createTestEngine>, user: string, count: number, eventId?: string) =>
  harness.engine.ingest({
    eventId: eventId ?? `like-${Math.random()}`,
    provider: 'test',
    userId: user,
    displayName: user,
    receivedAt: harness.clock.now(),
    kind: 'like.received',
    payload: { count },
  });

describe('likes', () => {
  it('are ignored by a game that does not use them (Mahalle Halayı)', () => {
    const harness = createTestEngine();
    harness.say('a', 'gelin');
    expect(like(harness, 'a', 50)).toBe('ignored');
    harness.engine.step();
    expect(harness.engine.stats.likesApplied).toBe(0);
    expect(harness.engine.stats.likesDropped).toBe(50);
  });

  it('are ignored for viewers the engine does not know, and for ignored players', () => {
    const { mode, log } = raceStub();
    const harness = createTestEngine({ mode });
    expect(like(harness, 'stranger', 5)).toBe('ignored');
    harness.say('a', 'gelin');
    harness.engine.operator({ type: 'ignore_player', playerId: 'test:a' });
    expect(like(harness, 'a', 5)).toBe('ignored');
    harness.engine.step();
    expect(log.likes).toEqual([]);
  });

  it('are summed per viewer and handed over at no more than maxPerSecond', () => {
    const { mode, log } = raceStub();
    const harness = createTestEngine({ mode });
    harness.say('a', 'gelin');
    harness.engine.step(); // the first step has no elapsed time
    like(harness, 'a', 5);
    like(harness, 'a', 5);
    like(harness, 'a', 5); // 15 waiting; the game takes 10 a second, so 1 per 100 ms step
    for (let i = 0; i < 6; i++) {
      harness.clock.advance(100);
      harness.engine.step();
    }
    expect(log.likes.reduce((a, b) => a + b, 0)).toBe(6);
    expect(Math.max(...log.likes)).toBe(1);
    for (let i = 0; i < 20; i++) {
      harness.clock.advance(100);
      harness.engine.step();
    }
    expect(harness.engine.stats.likesApplied).toBe(15);
  });

  it('a flood is bounded: only a couple of seconds of likes wait, the rest are dropped', () => {
    const { mode } = raceStub();
    const harness = createTestEngine({ mode });
    harness.say('a', 'gelin');
    like(harness, 'a', 10_000);
    like(harness, 'a', 10_000);
    expect(harness.engine.stats.likesDropped).toBe(20_000 - 20); // maxPerSecond 10 x 2 s of buffer
  });

  it('a repeated event id is counted once', () => {
    const { mode } = raceStub();
    const harness = createTestEngine({ mode });
    harness.say('a', 'gelin');
    expect(like(harness, 'a', 3, 'same')).toBe('queued');
    expect(like(harness, 'a', 3, 'same')).toBe('duplicate');
  });

  it('do not use the command budget, and their effects reach the screen', () => {
    const { mode } = raceStub();
    const harness = createTestEngine({ mode });
    harness.say('a', 'gelin');
    harness.presentation.length = 0;
    harness.engine.step();
    like(harness, 'a', 3);
    harness.clock.advance(100);
    harness.engine.step();
    expect(harness.presentation).toEqual([{ type: 'player_action', playerId: 'test:a', animation: 'boost' }]);
    expect(harness.engine.stats.rateLimited).toBe(0);
  });

  it('are dropped for a viewer who is removed while they wait', () => {
    const { mode, log } = raceStub();
    const harness = createTestEngine({ mode });
    harness.say('a', 'gelin');
    harness.engine.step();
    like(harness, 'a', 5);
    harness.engine.operator({ type: 'remove_player', playerId: 'test:a' });
    harness.clock.advance(100);
    harness.engine.step();
    expect(log.likes).toEqual([]);
  });

  it('reject a malformed like', () => {
    const harness = createTestEngine({ mode: raceStub().mode });
    for (const count of [0, -1, 1.5, 10_001, '5', null]) {
      expect(harness.engine.ingest({ eventId: 'x', provider: 'test', userId: 'a', displayName: 'a', receivedAt: 1, kind: 'like.received', payload: { count } })).toBe('invalid');
    }
  });
});

describe('a game with a live part', () => {
  it('is stepped with the elapsed time (never more than a quarter second) and the players it should know', () => {
    const { mode, log } = raceStub();
    const harness = createTestEngine({ mode });
    harness.say('a', 'gelin');
    harness.engine.step();
    harness.clock.advance(100);
    harness.engine.step();
    harness.clock.advance(5_000); // a stall
    harness.engine.step();
    expect(log.steps).toEqual([0, 100, 250]);
    expect([...log.contexts.at(-1)!.players.keys()]).toEqual(['test:a']);
    expect(log.contexts.at(-1)!.phase).toBe('stopped');
  });

  it('can end the active round itself, and the results carry its ranking', () => {
    const { mode } = raceStub();
    const harness = createTestEngine({ mode });
    harness.say('a', 'gelin');
    harness.startActiveRound();
    harness.engine.step();
    for (let i = 0; i < 12; i++) {
      harness.clock.advance(100);
      harness.engine.step();
    }
    expect(harness.engine.state.rounds.phase).toBe('results');
    expect(harness.engine.state.lastResult?.ranking).toEqual([{ place: 1, playerId: 'test:a', name: 'a' }]);
  });

  it('does not end a round that is not active', () => {
    const { mode, log } = raceStub();
    const harness = createTestEngine({ mode });
    for (let i = 0; i < 12; i++) {
      harness.clock.advance(100);
      harness.engine.step();
    }
    expect(log.ended).toBe(true);
    expect(harness.engine.state.rounds.phase).toBe('stopped');
  });

  it('a game without one has no view and its step does nothing', () => {
    const harness = createTestEngine();
    expect(harness.engine.hasLive).toBe(false);
    expect(harness.engine.liveView()).toBeNull();
    expect(() => harness.engine.step()).not.toThrow();
    expect(harness.engine.state.lastResult).toBeNull();
  });

  it('its view is stamped with a rising sequence number and the server time; a game without a ranking has none in its results', () => {
    const { mode } = raceStub();
    const harness = createTestEngine({ mode });
    const first = harness.engine.liveView()!;
    harness.clock.advance(40);
    const second = harness.engine.liveView()!;
    expect(second.seq).toBeGreaterThan(first.seq);
    expect(second.serverNow).toBe(first.serverNow + 40);
    const plain = createTestEngine();
    plain.say('a', 'gelin');
    plain.startActiveRound();
    plain.engine.operator({ type: 'end_round' });
    expect(plain.engine.state.lastResult).not.toHaveProperty('ranking');
  });

  it('survives a game that throws while stepping', () => {
    const base = raceStub().mode;
    const errors: unknown[] = [];
    const harness = createTestEngine({
      mode: { ...base, live: { ...base.live!, step: () => { throw new Error('boom'); } } },
      onError: (e) => errors.push(e),
    });
    expect(() => harness.engine.step()).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(harness.engine.stats.errors).toBe(1);
  });
});

describe('publishing the live view', () => {
  it('sends it when it changes, stays quiet while it does not, and sends nothing for a game without one', () => {
    const { mode } = raceStub();
    const harness = createTestEngine({ mode });
    const sent: unknown[] = [];
    const publisher = new Publisher({ engine: harness.engine, send: (event, payload) => event === 'state:live' && sent.push(payload) });
    publisher.publishLive();
    publisher.publishLive();
    expect(sent).toHaveLength(1);
    harness.engine.step();
    harness.clock.advance(100);
    harness.engine.step(); // the stub's racer moved
    publisher.publishLive();
    expect(sent).toHaveLength(2);

    const none: unknown[] = [];
    const plain = createTestEngine();
    new Publisher({ engine: plain.engine, send: (event, payload) => event === 'state:live' && none.push(payload) }).publishLive();
    expect(none).toEqual([]);
  });
});
