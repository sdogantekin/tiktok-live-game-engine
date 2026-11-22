import { describe, expect, it } from 'vitest';
import type { ModeContext } from '../../core/mode';
import type { Player } from '../../core/players/player-service';
import { mahalleHalayiConfig } from './config';
import { createMahalleHalayiMode } from './rules';

const mode = createMahalleHalayiMode();

function player(teamId: string | null): Player {
  return { id: 'sim:1', name: 'A', teamId, joinedAt: 0, lastActiveAt: 0, ignored: false, stats: { actions: 0, energy: 0 } };
}

/** Fake context: every cooldown succeeds unless its key is listed in `blocked`. */
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

const command = (word: string) => ({ type: 'command' as const, playerId: 'sim:1', command: word });
const gift = (giftKey: string) => ({ type: 'gift' as const, playerId: 'sim:1', giftKey, count: 1 });

describe('configuration', () => {
  it('matches the agreed teams, commands and gifts', () => {
    expect(mahalleHalayiConfig.teams.map((t) => t.id)).toEqual(['gelin', 'damat']);
    expect(Object.keys(mahalleHalayiConfig.commands)).toEqual(['gelin', 'damat', 'halay', 'zıpla', 'oyna']);
    expect(Object.keys(mahalleHalayiConfig.gifts)).toEqual(['rose', 'gg', 'big_celebration']);
    expect(mahalleHalayiConfig.timings).toMatchObject({ countdownMs: 15_000, roundMs: 180_000, resultsMs: 15_000 });
  });

  it('rejects a join command that points at an unknown team', () => {
    expect(() =>
      createMahalleHalayiMode({
        ...mahalleHalayiConfig,
        commands: { x: { droppable: false, behavior: { kind: 'join', teamId: 'nope' } } },
      }),
    ).toThrow(/unknown team/);
  });
});

describe('join commands', () => {
  it('ask the core to join the named team', () => {
    expect(mode.handleCommand(ctx({ player: player(null) }), command('gelin'))).toEqual([{ type: 'join_team', teamId: 'gelin' }]);
    expect(mode.handleCommand(ctx({ player: player(null) }), command('damat'))).toEqual([{ type: 'join_team', teamId: 'damat' }]);
  });
});

describe('halay', () => {
  it('animates and scores one point when scoring is open and cooldowns allow', () => {
    expect(mode.handleCommand(ctx(), command('halay'))).toEqual([
      { type: 'present', event: { type: 'player_action', playerId: 'sim:1', animation: 'halay' } },
      { type: 'score', points: 1 },
    ]);
  });

  it('animates without scoring while the score cooldown runs', () => {
    const effects = mode.handleCommand(ctx({ blocked: ['score'] }), command('halay'));
    expect(effects).toEqual([{ type: 'present', event: { type: 'player_action', playerId: 'sim:1', animation: 'halay' } }]);
  });

  it('animates without scoring outside an active round or while paused', () => {
    for (const overrides of [{ phase: 'countdown' as const, isScoring: false }, { paused: true, isScoring: false }]) {
      const effects = mode.handleCommand(ctx(overrides), command('halay'));
      expect(effects.map((e) => e.type)).toEqual(['present']);
    }
  });

  it('does nothing while the visual cooldown runs', () => {
    expect(mode.handleCommand(ctx({ blocked: ['visual'] }), command('halay'))).toEqual([]);
  });

  it('shows a "join a team" hint to unassigned viewers, limited by the hint cooldown', () => {
    expect(mode.handleCommand(ctx({ player: player(null) }), command('halay'))).toEqual([
      { type: 'present', event: { type: 'hint', playerId: 'sim:1', reason: 'no_team' } },
    ]);
    expect(mode.handleCommand(ctx({ player: player(null), blocked: ['hint'] }), command('halay'))).toEqual([]);
  });
});

describe('zıpla and oyna', () => {
  it.each([
    ['zipla', 'zipla'],
    ['oyna', 'oyna'],
  ])('%s is a visual-only action', (word, animation) => {
    expect(mode.handleCommand(ctx(), command(word))).toEqual([
      { type: 'present', event: { type: 'player_action', playerId: 'sim:1', animation } },
    ]);
  });
});

describe('unknown input', () => {
  it('ignores unknown commands and missing players', () => {
    expect(mode.handleCommand(ctx(), command('bogus'))).toEqual([]);
    expect(mode.handleCommand(ctx({ player: null }), command('halay'))).toEqual([]);
  });
});

describe('gifts', () => {
  it('rose plays on the sender when they are a participant', () => {
    expect(mode.handleGift(ctx(), gift('rose'))).toEqual([
      { type: 'present', event: { type: 'celebration', effect: 'rose', playerId: 'sim:1' } },
    ]);
  });

  it('rose from a non-participant becomes a crowd flourish', () => {
    expect(mode.handleGift(ctx({ player: null }), gift('rose'))).toEqual([
      { type: 'present', event: { type: 'celebration', effect: 'rose' } },
    ]);
  });

  it('gg and big_celebration are crowd-wide and respect their global cooldowns', () => {
    expect(mode.handleGift(ctx(), gift('gg'))).toEqual([{ type: 'present', event: { type: 'celebration', effect: 'gg' } }]);
    expect(mode.handleGift(ctx({ blocked: ['gg'] }), gift('gg'))).toEqual([]);
    expect(mode.handleGift(ctx({ blocked: ['big_celebration'] }), gift('big_celebration'))).toEqual([]);
  });

  it('ignores unknown and prototype-ish gift keys', () => {
    for (const key of ['unknown', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(mode.handleGift(ctx(), gift(key))).toEqual([]);
    }
  });

  it('only ever returns presentation effects', () => {
    for (const key of Object.keys(mahalleHalayiConfig.gifts)) {
      expect(mode.handleGift(ctx(), gift(key)).every((effect) => effect.type === 'present')).toBe(true);
    }
  });
});
