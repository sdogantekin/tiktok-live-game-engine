import { describe, expect, it } from 'vitest';
import { normalizeComment } from '../../core/events/comment-normalizer';
import type { ModeContext } from '../../core/mode';
import type { Player } from '../../core/players/player-service';
import { createTestEngine } from '../../../test/helpers';
import { takiTakmaConfig } from './config';
import { createTakiTakmaMode } from './rules';

const mode = createTakiTakmaMode();

function player(teamId: string | null): Player {
  return { id: 'sim:1', name: 'A', teamId, joinedAt: 0, lastActiveAt: 0, ignored: false, stats: { actions: 0, energy: 0 } };
}
function ctx(overrides: Partial<ModeContext> & { blocked?: string[] } = {}): ModeContext {
  const { blocked = [], ...rest } = overrides;
  return {
    now: 0,
    phase: 'active',
    paused: false,
    isScoring: true,
    player: player('gelin'),
    tryCooldown: (key) => !blocked.includes(key),
    tryGlobalCooldown: (key) => !blocked.includes(key),
    ...rest,
  };
}
const command = (word: string) => ({ type: 'command' as const, playerId: 'sim:1', command: normalizeComment(word) ?? word }); // the engine hands over normalized words
const gift = (giftKey: string) => ({ type: 'gift' as const, playerId: 'sim:1', giftKey, count: 1 });

describe('Takı Takma Töreni rules', () => {
  it('joins a side', () => {
    expect(mode.handleCommand(ctx({ player: player(null) }), command('damat'))).toEqual([{ type: 'join_team', teamId: 'damat' }]);
  });

  it('`tak` pins a takı and adds one point in a scoring round, once per cooldown', () => {
    expect(mode.handleCommand(ctx(), command('tak'))).toEqual([
      { type: 'present', event: { type: 'player_action', playerId: 'sim:1', animation: 'pin' } },
      { type: 'score', points: 1 },
    ]);
    expect(mode.handleCommand(ctx({ blocked: ['score'] }), command('tak'))).toEqual([]);
  });

  it('`tak` outside a scoring round is only for show', () => {
    const effects = mode.handleCommand(ctx({ isScoring: false }), command('tak'));
    expect(effects).toEqual([{ type: 'present', event: { type: 'player_action', playerId: 'sim:1', animation: 'pin' } }]);
  });

  it('`alkış` is visual only', () => {
    expect(mode.handleCommand(ctx(), command('alkış'))).toEqual([
      { type: 'present', event: { type: 'player_action', playerId: 'sim:1', animation: 'clap' } },
    ]);
  });

  it('asks a viewer who has no side to join first', () => {
    expect(mode.handleCommand(ctx({ player: player(null) }), command('tak'))).toEqual([
      { type: 'present', event: { type: 'hint', playerId: 'sim:1', reason: 'no_team' } },
    ]);
  });

  it('a bigger gift gives a more expensive takı and more points; the visual limit never holds points back', () => {
    const pointsOf = (key: string, blocked: string[] = []) =>
      mode.handleGift(ctx({ blocked }), gift(key)).filter((e) => e.type === 'score').reduce((sum, e) => sum + (e.type === 'score' ? e.points : 0), 0);
    expect(pointsOf('rose')).toBe(3);
    expect(pointsOf('gg')).toBe(10);
    expect(pointsOf('big_celebration')).toBe(30);
    expect(pointsOf('big_celebration', ['big_item'])).toBe(30);
    expect(mode.handleGift(ctx(), gift('big_celebration')).some((e) => e.type === 'present' && e.event.type === 'celebration' && e.event.effect === 'ev_anahtari')).toBe(true);
    expect(mode.handleGift(ctx({ blocked: ['big_item'] }), gift('big_celebration')).some((e) => e.type === 'present')).toBe(false);
  });

  it('ignores unknown words and gifts, including prototype-ish keys', () => {
    expect(mode.handleCommand(ctx(), command('constructor'))).toEqual([]);
    expect(mode.handleGift(ctx(), gift('__proto__'))).toEqual([]);
    expect(mode.handleGift(ctx(), gift('toString'))).toEqual([]);
  });

  it('rejects a config whose join command names an unknown side', () => {
    const bad = { ...takiTakmaConfig, commands: { x: { droppable: false, behavior: { kind: 'join' as const, teamId: 'nobody' } } } };
    expect(() => createTakiTakmaMode(bad)).toThrow();
  });
});

describe('Takı Takma Töreni in the engine', () => {
  const taki = () => createTestEngine({ mode: createTakiTakmaMode() });

  it('gifts add bonus points for the sender\'s side, only for a joined player in an active round', () => {
    const { engine, say, give, score, startActiveRound } = taki();
    say('a', 'gelin');
    say('b', 'damat');
    startActiveRound();
    give('a', 'gg');
    give('b', 'rose');
    give('stranger', 'big_celebration');
    expect(score('gelin')).toBe(10);
    expect(score('damat')).toBe(3);
    expect(engine.stats.giftScoreRefused).toBe(1);
  });

  it('a gift before the round adds nothing', () => {
    const { say, give, score } = taki();
    say('a', 'gelin');
    give('a', 'big_celebration');
    expect(score('gelin')).toBe(0);
  });

  it('tak scores one point per cooldown and comments are shown', () => {
    const { engine, clock, say, score, startActiveRound, presentation } = taki();
    say('a', 'damat');
    startActiveRound();
    say('a', 'tak');
    clock.advance(1_000);
    say('a', 'tak');
    expect(score('damat')).toBe(1);
    clock.advance(takiTakmaConfig.cooldowns.score!);
    say('a', 'tak');
    expect(score('damat')).toBe(2);
    say('a', 'hayırlı olsun');
    expect(presentation.some((e) => e.type === 'chat')).toBe(true);
    expect(engine.state.hud().modeId).toBe('taki-takma');
  });
});
