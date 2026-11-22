import { describe, expect, it } from 'vitest';
import { PlayerService } from '../players/player-service';
import { TeamService } from './team-service';

const DEFS = [
  { id: 'gelin', name: 'Gelin Takımı' },
  { id: 'damat', name: 'Damat Takımı' },
];

describe('TeamService', () => {
  it('lists teams and reports live membership from players', () => {
    const players = new PlayerService(['gelin', 'damat']);
    const teams = new TeamService(DEFS, players);
    players.register('a', 'A', 1);
    players.assignTeam('a', 'damat', { allowSwitch: false });

    expect(teams.ids()).toEqual(['gelin', 'damat']);
    expect(teams.has('gelin')).toBe(true);
    expect(teams.has('x')).toBe(false);
    expect(teams.memberCount('damat')).toBe(1);
    expect(teams.memberCount('gelin')).toBe(0);
  });

  it('rejects empty or duplicate team definitions', () => {
    const players = new PlayerService([]);
    expect(() => new TeamService([], players)).toThrow();
    expect(() => new TeamService([DEFS[0]!, DEFS[0]!], players)).toThrow();
  });
});
