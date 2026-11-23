import type { PresentationEvent } from '@live-game/contracts';
import { describe, expect, it } from 'vitest';
import { createTestEngine } from '../../../test/helpers';
import { atYarisiConfig } from './config';
import { seededRandom } from './race';
import { createAtYarisiMode } from './rules';

/** A small, quick race: 3 places, one lap of 100 m (about 6 s). */
const quick = { ...atYarisiConfig, race: { ...atYarisiConfig.race, capacity: 3, laps: 1, lapLengthM: 100 } };

function setup(config = quick) {
  const harness = createTestEngine({ mode: createAtYarisiMode(config, seededRandom(1)) });
  const { engine, clock } = harness;
  const run = (seconds: number) => {
    for (let t = 0; t < seconds * 1000; t += 100) {
      clock.advance(100);
      engine.tick();
      engine.step();
    }
  };
  const like = (user: string, count: number) =>
    engine.ingest({ eventId: `l${Math.random()}`, provider: 'test', userId: user, displayName: user, receivedAt: clock.now(), kind: 'like.received', payload: { count } });
  const view = () => engine.liveView()!;
  const racers = () => (view().kind === 'race' ? view().racers.map((r) => r.id.replace('test:', '')).sort() : []);
  const waiting = () => (view().kind === 'race' ? view().waiting : -1);
  const hints = () => harness.presentation.filter((e): e is Extract<PresentationEvent, { type: 'hint' }> => e.type === 'hint');
  /** Starts the game and the round, and runs the countdown out, so the race is on. */
  const startRace = () => {
    engine.operator({ type: 'start_game' });
    engine.step();
    engine.operator({ type: 'start_round' });
    engine.step();
  };
  return { ...harness, run, like, view, racers, waiting, hints, startRace };
}

describe('joining and waiting', () => {
  it('lets the first viewers onto the grid and makes the rest wait, telling them so once in a while', () => {
    const s = setup();
    s.engine.step();
    for (const user of ['a', 'b', 'c', 'd', 'e']) s.say(user, '1');
    s.engine.step();
    expect(s.racers()).toEqual(['a', 'b', 'c']);
    expect(s.waiting()).toBe(2);
    expect(s.hints().map((h) => h.playerId)).toEqual(['test:d', 'test:e']);
    s.say('d', '1'); // already waiting: nothing new
    expect(s.waiting()).toBe(2);
    expect(s.hints()).toHaveLength(2);
  });

  it('puts everyone who joined on the one team, and understands the friendly aliases in any case', () => {
    const s = setup();
    for (const [user, word] of [['a', 'AT'], ['b', ' Yarış '], ['c', 'KATIL']] as const) s.say(user, word);
    expect([...s.engine.state.players.list()].map((p) => p.teamId)).toEqual(['yarisci', 'yarisci', 'yarisci']);
    expect(s.racers()).toEqual(['a', 'b', 'c']);
  });

  it('ignores other words, and a viewer who has not joined cannot help anyone', () => {
    const s = setup();
    s.say('a', 'merhaba');
    s.say('a', 'constructor');
    expect(s.racers()).toEqual([]);
    expect(s.like('stranger', 10)).toBe('ignored');
  });

  it('removing or ignoring a viewer frees their place for the next in line', () => {
    const s = setup();
    for (const user of ['a', 'b', 'c', 'd']) s.say(user, '1');
    s.engine.step();
    expect(s.racers()).toEqual(['a', 'b', 'c']);
    s.engine.operator({ type: 'ignore_player', playerId: 'test:a' });
    s.engine.step();
    expect(s.racers()).toEqual(['b', 'c', 'd']);
    expect(s.waiting()).toBe(0);
    s.engine.operator({ type: 'remove_player', playerId: 'test:b' });
    s.engine.step();
    expect(s.racers()).toEqual(['c', 'd']);
  });

  it('takes nobody onto the grid once the race has started; latecomers wait for the next one', () => {
    const s = setup();
    s.say('a', '1');
    s.startRace();
    s.say('b', '1');
    s.engine.step();
    expect(s.racers()).toEqual(['a']);
    expect(s.waiting()).toBe(1);
  });
});

describe('a race', () => {
  it('runs only while the round is active and not paused', () => {
    const s = setup();
    s.say('a', '1');
    s.engine.operator({ type: 'start_game' });
    s.run(2);
    expect(s.view().racers[0]!.distance).toBe(0); // the countdown: still on the grid
    s.engine.operator({ type: 'start_round' });
    s.run(2);
    const moved = s.view().racers[0]!.distance;
    expect(moved).toBeGreaterThan(20);
    s.engine.operator({ type: 'pause' });
    s.run(3);
    expect(s.view().racers[0]!.distance).toBe(moved);
    s.engine.operator({ type: 'resume' });
    s.run(1);
    expect(s.view().racers[0]!.distance).toBeGreaterThan(moved);
  });

  it('ends the round by itself when everyone is home, with an individual ranking in the results', () => {
    const s = setup();
    for (const user of ['a', 'b', 'c']) s.say(user, '1');
    s.startRace();
    s.run(15);
    expect(s.engine.state.rounds.phase).toBe('results');
    const result = s.engine.state.lastResult!;
    expect(result.ranking!.map((r) => r.place)).toEqual([1, 2, 3]);
    expect(result.ranking!.map((r) => r.playerId).sort()).toEqual(['test:a', 'test:b', 'test:c']);
    expect(result.winner).toBeNull(); // no team scores in this game
    expect(s.view().stage).toBe('finished');
  });

  it('ranks by distance when time runs out before everyone finishes', () => {
    const slow = { ...quick, timings: { ...quick.timings, roundMs: 3_000 }, race: { ...quick.race, lapLengthM: 10_000 } };
    const s = setup(slow);
    for (const user of ['a', 'b']) s.say(user, '1');
    s.startRace();
    s.like('a', 100);
    s.run(1);
    s.like('a', 100);
    s.run(5);
    expect(s.engine.state.rounds.phase).toBe('results');
    const ranking = s.engine.state.lastResult!.ranking!;
    expect(ranking.map((r) => r.place)).toEqual([1, 2]);
    expect(ranking[0]!.playerId).toBe('test:a'); // the one who got likes is ahead
  });

  it('gives the next race to those who waited, and sends last race\'s horses to the back of the queue', () => {
    const s = setup();
    for (const user of ['a', 'b', 'c', 'd', 'e']) s.say(user, '1');
    s.startRace();
    s.run(15); // race over
    expect(s.engine.state.rounds.phase).toBe('results');
    s.run(25); // results, then the next countdown
    expect(s.engine.state.rounds.phase).not.toBe('results');
    expect(s.racers()).toEqual(expect.arrayContaining(['d', 'e']));
    expect(s.racers()).toHaveLength(3);
    expect(s.waiting()).toBe(2);
  });
});

describe('likes and gifts', () => {
  it('a racer\'s likes speed their own horse up and show a boost cue at most once a second', () => {
    const s = setup();
    for (const user of ['a', 'b']) s.say(user, '1');
    s.startRace();
    s.run(1);
    s.presentation.length = 0;
    s.like('a', 200);
    s.run(1);
    const [a, b] = ['a', 'b'].map((n) => s.view().racers.find((r) => r.id === `test:${n}`)!);
    expect(a!.boost).toBeGreaterThan(b!.boost);
    expect(s.presentation.filter((e) => e.type === 'player_action')).toHaveLength(1);
  });

  it('a racer\'s gift boosts only their horse and shows a celebration for them', () => {
    const s = setup();
    for (const user of ['a', 'b']) s.say(user, '1');
    s.startRace();
    s.run(1);
    s.presentation.length = 0;
    s.give('a', 'rose');
    expect(s.presentation).toEqual([{ type: 'celebration', effect: 'surge_rose', playerId: 'test:a' }]);
    s.run(1);
    const [a, b] = ['a', 'b'].map((n) => s.view().racers.find((r) => r.id === `test:${n}`)!);
    expect(a!.boost).toBeGreaterThan(0);
    expect(b!.boost).toBe(0);
    expect(s.engine.stats.giftScoreRefused).toBe(0); // gifts never score in this game
  });

  it('a gift from someone who is not racing is a cheer from the stands and helps nobody', () => {
    const s = setup();
    for (const user of ['a', 'b', 'c', 'd']) s.say(user, '1');
    s.startRace();
    s.run(1);
    s.presentation.length = 0;
    s.give('d', 'gg'); // d is waiting
    s.give('stranger', 'big_celebration');
    expect(s.presentation).toEqual([{ type: 'celebration', effect: 'crowd_cheer' }]); // once: the cheer has a cooldown
    expect(s.view().racers.every((r) => r.boost === 0)).toBe(true);
  });

  it('an unknown gift does nothing', () => {
    const s = setup();
    s.say('a', '1');
    s.startRace();
    s.presentation.length = 0;
    s.give('a', 'constructor');
    s.give('a', '__proto__');
    expect(s.presentation).toEqual([]);
  });
});
