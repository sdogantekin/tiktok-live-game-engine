import { describe, expect, it } from 'vitest';
import { PlayerService } from './player-service';

const TEAMS = ['gelin', 'damat'];

function setup(maxPlayers?: number) {
  return new PlayerService(TEAMS, maxPlayers);
}

describe('registration', () => {
  it('registers once, refreshing name and activity on repeat', () => {
    const players = setup();
    const first = players.register('sim:1', ' Ayşe ', 100)!;
    expect(first).toMatchObject({ id: 'sim:1', name: 'Ayşe', teamId: null, joinedAt: 100, lastActiveAt: 100 });

    const again = players.register('sim:1', 'Ayşe K', 500)!;
    expect(again).toBe(first);
    expect(again).toMatchObject({ name: 'Ayşe K', joinedAt: 100, lastActiveAt: 500 });
    expect(players.count).toBe(1);
  });

  it('refuses registration beyond the player cap', () => {
    const players = setup(2);
    expect(players.register('a', 'A', 1)).not.toBeNull();
    expect(players.register('b', 'B', 1)).not.toBeNull();
    expect(players.register('c', 'C', 1)).toBeNull();
    expect(players.register('a', 'A2', 2)).not.toBeNull(); // existing players still update
  });
});

describe('team assignment', () => {
  it('assigns an unassigned player even when switching is locked', () => {
    const players = setup();
    players.register('a', 'A', 1);
    expect(players.assignTeam('a', 'gelin', { allowSwitch: false })).toEqual({ ok: true, changed: true });
    expect(players.countByTeam('gelin')).toBe(1);
  });

  it('rejects a switch unless allowed, and moves counts when allowed', () => {
    const players = setup();
    players.register('a', 'A', 1);
    players.assignTeam('a', 'gelin', { allowSwitch: false });

    expect(players.assignTeam('a', 'damat', { allowSwitch: false })).toEqual({ ok: false, reason: 'switch_locked' });
    expect(players.get('a')!.teamId).toBe('gelin');

    expect(players.assignTeam('a', 'damat', { allowSwitch: true })).toEqual({ ok: true, changed: true });
    expect(players.countByTeam('gelin')).toBe(0);
    expect(players.countByTeam('damat')).toBe(1);
  });

  it('treats re-joining the same team as a no-op even when locked', () => {
    const players = setup();
    players.register('a', 'A', 1);
    players.assignTeam('a', 'gelin', { allowSwitch: false });
    expect(players.assignTeam('a', 'gelin', { allowSwitch: false })).toEqual({ ok: true, changed: false });
    expect(players.countByTeam('gelin')).toBe(1);
  });

  it('rejects unknown players, unknown teams and ignored players', () => {
    const players = setup();
    players.register('a', 'A', 1);
    expect(players.assignTeam('zzz', 'gelin', { allowSwitch: true })).toEqual({ ok: false, reason: 'unknown_player' });
    expect(players.assignTeam('a', 'nope', { allowSwitch: true })).toEqual({ ok: false, reason: 'unknown_team' });
    players.ignore('a');
    expect(players.assignTeam('a', 'gelin', { allowSwitch: true })).toEqual({ ok: false, reason: 'ignored' });
  });
});

describe('remove and ignore', () => {
  it('remove deletes the record, frees the team slot and allows re-registration', () => {
    const players = setup();
    players.register('a', 'A', 1);
    players.assignTeam('a', 'gelin', { allowSwitch: false });
    expect(players.remove('a')).toBe(true);
    expect(players.get('a')).toBeUndefined();
    expect(players.countByTeam('gelin')).toBe(0);
    expect(players.register('a', 'A', 2)).not.toBeNull();
    expect(players.remove('missing')).toBe(false);
  });

  it('ignore keeps a tombstone: hidden from lists and counts, and blocks re-registration', () => {
    const players = setup();
    players.register('a', 'A', 1);
    players.register('b', 'B', 1);
    players.assignTeam('a', 'damat', { allowSwitch: false });

    expect(players.ignore('a')).toBe(true);
    expect(players.ignore('a')).toBe(false);
    expect(players.countByTeam('damat')).toBe(0);
    expect(players.count).toBe(1);
    expect(players.list().map((p) => p.id)).toEqual(['b']);
    expect(players.register('a', 'A again', 5)).toBeNull();
    expect(players.tryStartCooldown('a', 'score', 1000, 5)).toBe(false);
  });

  it('removing an ignored player keeps counts consistent', () => {
    const players = setup();
    players.register('a', 'A', 1);
    players.ignore('a');
    players.remove('a');
    expect(players.count).toBe(0);
  });
});

describe('cooldowns', () => {
  it('allows the first use, blocks until the cooldown elapses, then allows again', () => {
    const players = setup();
    players.register('a', 'A', 0);
    expect(players.tryStartCooldown('a', 'score', 5000, 1000)).toBe(true);
    expect(players.tryStartCooldown('a', 'score', 5000, 5999)).toBe(false);
    expect(players.tryStartCooldown('a', 'score', 5000, 6000)).toBe(true);
  });

  it('a blocked attempt does not extend the cooldown', () => {
    const players = setup();
    players.register('a', 'A', 0);
    players.tryStartCooldown('a', 'score', 5000, 1000);
    players.tryStartCooldown('a', 'score', 5000, 4000); // blocked
    expect(players.tryStartCooldown('a', 'score', 5000, 6000)).toBe(true);
  });

  it('keeps keys and players independent', () => {
    const players = setup();
    players.register('a', 'A', 0);
    players.register('b', 'B', 0);
    expect(players.tryStartCooldown('a', 'score', 5000, 1000)).toBe(true);
    expect(players.tryStartCooldown('a', 'visual', 2000, 1000)).toBe(true);
    expect(players.tryStartCooldown('b', 'score', 5000, 1000)).toBe(true);
  });

  it('returns false for unknown players', () => {
    expect(setup().tryStartCooldown('nobody', 'score', 1, 1)).toBe(false);
  });
});

describe('recordAction', () => {
  it('updates activity and stats', () => {
    const players = setup();
    players.register('a', 'A', 1);
    players.recordAction('a', 50, 1);
    players.recordAction('a', 60);
    expect(players.get('a')).toMatchObject({ lastActiveAt: 60, stats: { actions: 2, energy: 1 } });
  });
});
