import { describe, expect, it } from 'vitest';
import type { GameMode } from '../src/core/mode';
import { ManualClock } from '../src/core/clock';
import { GameEngine } from '../src/core/engine';
import { createMahalleHalayiMode } from '../src/game-modes/mahalle-halayi/rules';
import { createTestEngine } from './helpers';

describe('joining', () => {
  it('registers a viewer on a team and announces it', () => {
    const { engine, presentation, say } = createTestEngine();
    expect(say('ayse', 'gelin')).toBe('queued');
    expect(engine.state.players.get('test:ayse')?.teamId).toBe('gelin');
    expect(presentation).toEqual([{ type: 'player_joined', playerId: 'test:ayse', teamId: 'gelin' }]);
  });

  it('matches commands Turkish-insensitively and on the whole comment only', () => {
    const { engine, say } = createTestEngine();
    say('a', 'GELİN');
    say('b', 'Damat');
    expect(engine.state.players.get('test:a')?.teamId).toBe('gelin');
    expect(engine.state.players.get('test:b')?.teamId).toBe('damat');

    expect(say('c', 'gelin takımı')).toBe('ignored');
    expect(say('d', 'halay!')).toBe('ignored');
    expect(engine.state.players.get('test:c')).toBeUndefined();
    expect(engine.state.players.get('test:d')).toBeUndefined();
  });

  it('does not register chatter, so it cannot fill the player table', () => {
    const { engine, say } = createTestEngine({ config: { maxPlayers: 3 } });
    for (let i = 0; i < 100; i++) say(`chatter${i}`, 'merhaba');
    expect(engine.state.players.count).toBe(0);
    expect(engine.stats.ignored).toBe(100);
  });

  it('locks team switching once the round is active and shows a hint', () => {
    const { engine, presentation, say, startActiveRound } = createTestEngine();
    say('a', 'gelin');
    startActiveRound();
    presentation.length = 0;

    say('a', 'damat');
    expect(engine.state.players.get('test:a')?.teamId).toBe('gelin');
    expect(presentation).toEqual([{ type: 'hint', playerId: 'test:a', reason: 'switch_locked' }]);

    say('late', 'damat'); // a late viewer may still join
    expect(engine.state.players.get('test:late')?.teamId).toBe('damat');
  });

  it('allows switching before the round starts', () => {
    const { engine, say } = createTestEngine();
    say('a', 'gelin');
    engine.operator({ type: 'start_game' }); // countdown
    say('a', 'damat');
    expect(engine.state.players.get('test:a')?.teamId).toBe('damat');
  });
});

describe('scoring and cooldowns', () => {
  it('scores halay once per 5 s per player but animates every 2 s', () => {
    const { clock, presentation, say, score, startActiveRound } = createTestEngine();
    say('a', 'gelin');
    startActiveRound();
    presentation.length = 0;

    say('a', 'halay'); // t=0 scores
    clock.advance(1_000);
    say('a', 'halay'); // visual cooldown (2 s) blocks entirely
    clock.advance(1_000);
    say('a', 'halay'); // t=2 s animates, score cooldown still running
    clock.advance(3_000);
    say('a', 'halay'); // t=5 s scores again

    expect(score('gelin')).toBe(2);
    expect(presentation.filter((e) => e.type === 'player_action')).toHaveLength(3);
  });

  it('zıpla and oyna never score, in any spelling', () => {
    const { clock, say, score, startActiveRound, presentation } = createTestEngine();
    say('a', 'gelin');
    startActiveRound();
    presentation.length = 0;
    for (const word of ['zıpla', 'ZIPLA', 'Zipla', 'oyna', 'OYNA']) {
      clock.advance(2_000);
      say('a', word);
    }
    expect(score('gelin')).toBe(0);
    expect(presentation.filter((e) => e.type === 'player_action')).toHaveLength(5);
  });

  it('keeps cooldowns independent per player', () => {
    const { say, score, startActiveRound } = createTestEngine();
    say('a', 'gelin');
    say('b', 'gelin');
    startActiveRound();
    say('a', 'halay');
    say('b', 'halay');
    expect(score('gelin')).toBe(2);
  });

  it('does not score outside an active round or while paused', () => {
    const { engine, clock, say, score } = createTestEngine();
    say('a', 'gelin');
    say('a', 'halay'); // stopped
    engine.operator({ type: 'start_game' });
    say('b', 'damat');
    say('b', 'halay'); // countdown
    expect(score('gelin') + score('damat')).toBe(0);

    engine.operator({ type: 'start_round' });
    engine.operator({ type: 'pause' });
    clock.advance(2_000); // clear the visual cooldown so only the pause is under test
    say('a', 'halay');
    expect(score('gelin')).toBe(0);

    engine.operator({ type: 'resume' });
    clock.advance(2_000);
    say('a', 'halay');
    expect(score('gelin')).toBe(1);
  });

  it('shows a hint to unassigned viewers, once per hint cooldown, and scores nothing', () => {
    const { clock, presentation, say, score, startActiveRound } = createTestEngine();
    startActiveRound();
    say('new', 'halay');
    clock.advance(2_100);
    say('new', 'halay');
    expect(presentation.filter((e) => e.type === 'hint')).toHaveLength(1);
    expect(score('gelin') + score('damat')).toBe(0);
  });
});

describe('gifts', () => {
  it('trigger celebrations and never change scores, whoever sends them', () => {
    const { engine, clock, presentation, say, give, score, startActiveRound } = createTestEngine();
    say('fan', 'gelin');
    startActiveRound();
    say('fan', 'halay');
    const before = [score('gelin'), score('damat')];
    presentation.length = 0;

    give('fan', 'rose');
    give('stranger', 'rose');
    clock.advance(20_000);
    give('fan', 'gg');
    give('stranger', 'big_celebration');

    expect([score('gelin'), score('damat')]).toEqual(before);
    expect(presentation).toEqual([
      { type: 'celebration', effect: 'rose', playerId: 'test:fan' },
      { type: 'celebration', effect: 'rose' },
      { type: 'celebration', effect: 'gg' },
      { type: 'celebration', effect: 'big_celebration' },
    ]);
    expect(engine.state.players.get('test:stranger')).toBeUndefined(); // gifts do not register participants
  });

  it('applies the session-wide cooldown to gg and big_celebration', () => {
    const { clock, presentation, give } = createTestEngine();
    give('a', 'gg');
    give('b', 'gg');
    expect(presentation).toHaveLength(1);
    clock.advance(5_000);
    give('b', 'gg');
    expect(presentation).toHaveLength(2);
  });

  it('never moves scores over a long random mix of gifts and unknown keys', () => {
    const { clock, say, give, score, startActiveRound } = createTestEngine();
    for (let i = 0; i < 20; i++) say(`p${i}`, i % 2 ? 'gelin' : 'damat');
    startActiveRound();
    for (let i = 0; i < 20; i++) say(`p${i}`, 'halay');
    const before = [score('gelin'), score('damat')];

    const keys = ['rose', 'gg', 'big_celebration', 'unknown', 'constructor', '__proto__'];
    for (let i = 0; i < 500; i++) {
      clock.advance(37);
      give(`p${i % 25}`, keys[i % keys.length]!);
    }
    expect([score('gelin'), score('damat')]).toEqual(before);
  });
});

describe('ingestion hardening', () => {
  it('drops duplicate event ids', () => {
    const { engine, clock } = createTestEngine();
    const event = {
      kind: 'comment.received',
      eventId: 'dup-1',
      provider: 'test',
      userId: 'a',
      displayName: 'A',
      receivedAt: clock.now(),
      payload: { text: 'gelin' },
    };
    expect(engine.ingest(event)).toBe('queued');
    expect(engine.ingest(event)).toBe('duplicate');
    engine.drain();
    expect(engine.state.players.count).toBe(1);
    expect(engine.stats.duplicate).toBe(1);
  });

  it('limits each user to a small burst, then refills', () => {
    const { engine, clock } = createTestEngine();
    const send = (i: number) =>
      engine.ingest({
        kind: 'comment.received',
        eventId: `spam-${i}`,
        provider: 'test',
        userId: 'spammer',
        displayName: 'S',
        receivedAt: clock.now(),
        payload: { text: 'gelin' },
      });
    const outcomes = Array.from({ length: 10 }, (_, i) => send(i));
    expect(outcomes.filter((o) => o === 'queued')).toHaveLength(3);
    expect(outcomes.filter((o) => o === 'rate_limited')).toHaveLength(7);

    clock.advance(1_000);
    expect(send(100)).toBe('queued');
  });

  it('applies a global limit across users', () => {
    const { engine } = createTestEngine({ config: { globalRate: { capacity: 10, perSecond: 10 } } });
    const outcomes = Array.from({ length: 30 }, (_, i) =>
      engine.ingest({
        kind: 'comment.received',
        eventId: `g-${i}`,
        provider: 'test',
        userId: `user${i}`,
        displayName: 'U',
        receivedAt: 1,
        payload: { text: 'gelin' },
      }),
    );
    expect(outcomes.filter((o) => o === 'queued')).toHaveLength(10);
    expect(outcomes.filter((o) => o === 'rate_limited')).toHaveLength(20);
  });

  it('survives malformed payloads without throwing or changing state', () => {
    const { engine } = createTestEngine();
    const junk = [null, undefined, 42, 'halay', [], {}, { kind: 'comment.received' }, { kind: 'gift.received', payload: 1 }];
    for (const raw of junk) expect(engine.ingest(raw)).toBe('invalid');
    expect(engine.ingest({
      kind: 'comment.received', eventId: 'x', provider: 'test', userId: 'u', displayName: 'U', receivedAt: 1,
      payload: { text: 'x'.repeat(100_000) },
    })).toBe('invalid');
    engine.drain();
    expect(engine.stats.invalid).toBe(junk.length + 1);
    expect(engine.state.players.count).toBe(0);
  });

  it('sanitizes hostile display names before storing', () => {
    const { engine } = createTestEngine();
    engine.ingest({
      kind: 'comment.received', eventId: 'n1', provider: 'test', userId: 'u', displayName: '  ‮<b>Ali</b>​  ', receivedAt: 1,
      payload: { text: 'gelin' },
    });
    engine.drain();
    expect(engine.state.players.get('test:u')?.name).toBe('<b>Ali</b>'); // stored inert; rendering must escape it
  });

  it('keeps processing after an item throws', () => {
    const errors: unknown[] = [];
    const real = createMahalleHalayiMode();
    let calls = 0;
    const flaky: GameMode = {
      ...real,
      handleCommand(ctx, action) {
        if (++calls === 1) throw new Error('boom');
        return real.handleCommand(ctx, action);
      },
    };
    const { engine, say } = createTestEngine({ mode: flaky, onError: (e) => errors.push(e) });
    say('a', 'gelin'); // throws inside the mode
    say('b', 'damat');
    expect(errors).toHaveLength(1);
    expect(engine.stats.errors).toBe(1);
    expect(engine.state.players.get('test:b')?.teamId).toBe('damat');
  });
});

describe('bounded queue', () => {
  const event = (id: string, user: string, text: string) => ({
    kind: 'comment.received' as const,
    eventId: id,
    provider: 'test',
    userId: user,
    displayName: user,
    receivedAt: 1,
    payload: { text },
  });

  it('sheds the oldest visual-only items first when full', () => {
    const { engine, presentation, say } = createTestEngine({ config: { queueCapacity: 3 } });
    for (const user of ['a', 'b', 'c', 'd', 'e']) say(user, 'gelin'); // all have teams
    presentation.length = 0;

    expect(engine.ingest(event('z1', 'a', 'zıpla'))).toBe('queued');
    expect(engine.ingest(event('z2', 'b', 'oyna'))).toBe('queued');
    expect(engine.ingest(event('h1', 'c', 'halay'))).toBe('queued');
    expect(engine.queueDepth).toBe(3);

    expect(engine.ingest(event('h2', 'd', 'halay'))).toBe('queued'); // sheds z1
    expect(engine.queueDepth).toBe(3);
    expect(engine.stats.overflowDropped).toBe(1);

    engine.drain();
    const animations = presentation.flatMap((e) => (e.type === 'player_action' ? [e.animation] : []));
    expect(animations.sort()).toEqual(['halay', 'halay', 'oyna']);
  });

  it('drops the newcomer when nothing in the queue can be shed, and never exceeds capacity', () => {
    const { engine } = createTestEngine({ config: { queueCapacity: 2 } });
    expect(engine.ingest(event('1', 'a', 'gelin'))).toBe('queued');
    expect(engine.ingest(event('2', 'b', 'damat'))).toBe('queued');
    expect(engine.ingest(event('3', 'c', 'gelin'))).toBe('queue_full');
    expect(engine.queueDepth).toBe(2);
    expect(engine.stats.maxQueueDepth).toBe(2);
  });

  it('never drops operator commands, even when the queue is full', () => {
    const { engine } = createTestEngine({ config: { queueCapacity: 2 } });
    engine.ingest(event('1', 'a', 'gelin'));
    engine.ingest(event('2', 'b', 'damat'));
    expect(engine.operator({ type: 'start_game' })).toEqual({ ok: true });
    expect(engine.state.rounds.phase).toBe('countdown');
    expect(engine.state.players.count).toBe(2); // earlier viewer events were processed first, in order
  });

  it('handles a 200-event burst with a bounded queue', () => {
    const { engine } = createTestEngine({ config: { queueCapacity: 50, globalRate: { capacity: 1000, perSecond: 1000 } } });
    for (let i = 0; i < 200; i++) engine.ingest(event(`b${i}`, `u${i}`, 'zıpla'));
    expect(engine.queueDepth).toBeLessThanOrEqual(50);
    expect(engine.stats.maxQueueDepth).toBeLessThanOrEqual(50);
    expect(engine.stats.overflowDropped).toBe(150);
    engine.drain();
    expect(engine.queueDepth).toBe(0);
  });
});

describe('operator commands', () => {
  it('drive the round and report invalid transitions', () => {
    const { engine } = createTestEngine();
    expect(engine.operator({ type: 'end_round' })).toEqual({ ok: false, reason: 'invalid_phase' });
    expect(engine.operator({ type: 'start_game' })).toEqual({ ok: true });
    expect(engine.operator({ type: 'start_game' })).toEqual({ ok: false, reason: 'already_running' });
    expect(engine.operator({ type: 'start_round' })).toEqual({ ok: true });
    expect(engine.operator({ type: 'pause' })).toEqual({ ok: true });
    expect(engine.snapshot().paused).toBe(true);
    expect(engine.operator({ type: 'resume' })).toEqual({ ok: true });
    expect(engine.operator({ type: 'end_round' })).toEqual({ ok: true });
    expect(engine.operator({ type: 'stop_game' })).toEqual({ ok: true });
  });

  it('rejects unknown or malformed commands, including attempts to set scores', () => {
    const { engine } = createTestEngine();
    expect(engine.operator({ type: 'set_score', teamId: 'gelin', score: 999 })).toEqual({ ok: false, reason: 'invalid_command' });
    expect(engine.operator(null)).toEqual({ ok: false, reason: 'invalid_command' });
    expect(engine.operator({ type: 'reassign_player', playerId: 'x' })).toEqual({ ok: false, reason: 'invalid_command' });
  });

  it('resets the round score', () => {
    const { engine, say, score, startActiveRound } = createTestEngine();
    say('a', 'gelin');
    startActiveRound();
    say('a', 'halay');
    expect(engine.operator({ type: 'reset_round_score' })).toEqual({ ok: true });
    expect(score('gelin')).toBe(0);
  });

  it('triggers only configured celebrations', () => {
    const { engine, presentation } = createTestEngine();
    expect(engine.operator({ type: 'trigger_celebration', effect: 'big_celebration' })).toEqual({ ok: true });
    expect(engine.operator({ type: 'trigger_celebration', effect: 'nuke' })).toEqual({ ok: false, reason: 'unknown_effect' });
    expect(presentation).toEqual([{ type: 'celebration', effect: 'big_celebration' }]);
  });

  it('removes, ignores and reassigns players', () => {
    const { engine, say } = createTestEngine();
    say('a', 'gelin');
    say('b', 'gelin');
    say('c', 'gelin');

    expect(engine.operator({ type: 'reassign_player', playerId: 'test:a', teamId: 'damat' })).toEqual({ ok: true });
    expect(engine.state.players.get('test:a')?.teamId).toBe('damat');
    expect(engine.operator({ type: 'reassign_player', playerId: 'test:a', teamId: 'nope' })).toEqual({ ok: false, reason: 'unknown_team' });
    expect(engine.operator({ type: 'reassign_player', playerId: 'ghost', teamId: 'damat' })).toEqual({ ok: false, reason: 'unknown_player' });

    expect(engine.operator({ type: 'remove_player', playerId: 'test:b' })).toEqual({ ok: true });
    expect(engine.state.players.get('test:b')).toBeUndefined();
    say('b', 'damat'); // a removed viewer can come back
    expect(engine.state.players.get('test:b')?.teamId).toBe('damat');

    expect(engine.operator({ type: 'ignore_player', playerId: 'test:c' })).toEqual({ ok: true });
    say('c', 'damat'); // an ignored viewer cannot
    expect(engine.state.players.get('test:c')?.teamId).toBeNull();
    expect(engine.snapshot().players.map((p) => p.id)).not.toContain('test:c');
  });

  it('can reassign during an active round even though viewers cannot switch', () => {
    const { engine, say, startActiveRound } = createTestEngine();
    say('a', 'gelin');
    startActiveRound();
    expect(engine.operator({ type: 'reassign_player', playerId: 'test:a', teamId: 'damat' })).toEqual({ ok: true });
  });
});

describe('automatic round flow', () => {
  it('runs lobby → countdown → active → results → next countdown and decides the winner on the server', () => {
    const { engine, clock, say, score } = createTestEngine();
    say('g', 'gelin');
    say('d', 'damat');
    engine.operator({ type: 'start_game' });
    expect(engine.snapshot().phase).toBe('countdown');

    clock.advance(15_000);
    engine.tick();
    expect(engine.snapshot().phase).toBe('active');
    say('g', 'halay');
    clock.advance(5_000);
    say('g', 'halay');
    say('d', 'halay');
    expect(score('gelin')).toBe(2);

    clock.advance(180_000);
    engine.tick();
    expect(engine.snapshot().phase).toBe('results');
    expect(engine.snapshot().lastResult).toMatchObject({ round: 1, winner: 'gelin' });

    clock.advance(15_000);
    engine.tick();
    expect(engine.snapshot()).toMatchObject({ phase: 'countdown', round: 2 });
    expect(score('gelin')).toBe(0);
  });
});

describe('construction', () => {
  it('rejects a mode whose command words collide after normalization', () => {
    const real = createMahalleHalayiMode();
    const mode: GameMode = {
      ...real,
      config: { ...real.config, commands: { zıpla: { droppable: true }, ZIPLA: { droppable: true } } },
    };
    expect(() => createTestEngine({ mode })).toThrow(/duplicate/i);
  });
});

describe('latency instrumentation', () => {
  it('records ingest-to-processed latency and tells presentation cues when their input arrived', () => {
    const clock = new ManualClock();
    const seen: { type: string; ingestedAt: number }[] = [];
    const engine = new GameEngine({
      mode: createMahalleHalayiMode(),
      clock,
      onPresentation: (event, meta) => seen.push({ type: event.type, ingestedAt: meta.ingestedAt }),
    });

    const ingestTime = clock.now();
    engine.ingest({ kind: 'comment.received', eventId: 'e1', provider: 'test', userId: 'u', displayName: 'U', receivedAt: 1, payload: { text: 'gelin' } });
    clock.advance(40); // the event waits in the queue
    engine.drain();

    expect(seen).toEqual([{ type: 'player_joined', ingestedAt: ingestTime }]);
    const latency = engine.latency.summary();
    expect(latency.count).toBe(1);
    expect(latency.max).toBeGreaterThanOrEqual(0);

    engine.operator({ type: 'trigger_celebration', effect: 'gg' });
    expect(seen.at(-1)).toEqual({ type: 'celebration', ingestedAt: clock.now() });
  });
});
