import type { GameAction, ModeId, Phase, PresentationEvent, TeamDefinition } from '@live-game/contracts';
import type { Player } from './players/player-service';
import type { RoundTimings } from './rounds/round-service';

export type CommandAction = Extract<GameAction, { type: 'command' }>;
export type GiftAction = Extract<GameAction, { type: 'gift' }>;

export interface CommandConfig {
  /** When the queue overflows, droppable (purely visual) commands are shed first. */
  droppable: boolean;
}

/** Plain data a game mode supplies to the engine. */
export interface GameModeConfig {
  teams: readonly TeamDefinition[];
  timings: RoundTimings;
  /** Viewer-facing command words. The core normalizes them (Turkish-aware) when it indexes them. */
  commands: Readonly<Record<string, CommandConfig>>;
  /** Cooldown durations in ms by key, used through `ModeContext.tryCooldown` / `tryGlobalCooldown`. */
  cooldowns: Readonly<Record<string, number>>;
  /** Celebration effects the operator may trigger manually. */
  celebrations: readonly string[];
}

/** Read-only facts and cooldown helpers the engine gives a mode for one action. */
export interface ModeContext {
  now: number;
  phase: Phase;
  paused: boolean;
  /** True only during an unpaused active round. */
  isScoring: boolean;
  /** The acting player; null for a gift from someone who is not a registered participant. */
  player: Readonly<Player> | null;
  /** Per-player cooldown. Starts it and returns true if it has elapsed; false otherwise. */
  tryCooldown(key: string): boolean;
  /** Session-wide cooldown, same semantics. */
  tryGlobalCooldown(key: string): boolean;
}

/** Decisions a mode returns; the core applies them to the acting player. */
export type ModeEffect =
  | { type: 'join_team'; teamId: string }
  | { type: 'score'; points: number }
  | { type: 'present'; event: PresentationEvent };

/** Gift handlers can only return presentation effects, so a gift can never change a score. */
export type GiftEffect = Extract<ModeEffect, { type: 'present' }>;

export interface GameMode {
  id: ModeId;
  config: GameModeConfig;
  handleCommand(ctx: ModeContext, action: CommandAction): ModeEffect[];
  handleGift(ctx: ModeContext, action: GiftAction): GiftEffect[];
}
