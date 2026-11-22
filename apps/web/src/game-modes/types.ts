import type { ModeId, Phase } from '@live-game/contracts';

/** Everything the web app needs to present a game mode. Visual style and wording live here, not in shared UI. */
export interface ModePresentation {
  id: ModeId;
  title: string;
  /** Team accent colours by team id. */
  teamColors: Readonly<Record<string, string>>;
  text: {
    phase: Readonly<Record<Phase, string>>;
    round: (round: number) => string;
    players: (count: number) => string;
    paused: string;
    winner: string;
    draw: string;
    /** Instruction chips shown while viewers can still play. */
    commands: readonly string[];
    commandsTitle: string;
    joined: (name: string, teamName: string) => string;
    connecting: string;
    providerDown: string;
  };
}
