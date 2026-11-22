import type { TeamDefinition } from '@live-game/contracts';
import type { PlayerService } from '../players/player-service';

/** Team definitions from the active mode's configuration plus live membership counts. */
export class TeamService {
  private readonly definitions: readonly TeamDefinition[];

  constructor(
    definitions: readonly TeamDefinition[],
    private readonly players: PlayerService,
  ) {
    if (definitions.length === 0) throw new Error('At least one team is required');
    if (new Set(definitions.map((team) => team.id)).size !== definitions.length) {
      throw new Error('Team ids must be unique');
    }
    this.definitions = definitions;
  }

  list(): readonly TeamDefinition[] {
    return this.definitions;
  }

  ids(): string[] {
    return this.definitions.map((team) => team.id);
  }

  has(teamId: string): boolean {
    return this.definitions.some((team) => team.id === teamId);
  }

  memberCount(teamId: string): number {
    return this.players.countByTeam(teamId);
  }
}
