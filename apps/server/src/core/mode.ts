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
  /**
   * Whether this game lets gifts add points to the sender's team. Default `false`: gifts are then purely cosmetic and the
   * engine drops any score a gift handler returns. A game opts in by setting this to `true` (a product decision made per
   * game, never by default). Even then the engine applies a gift score only for a registered player on a team during an
   * actively scoring round.
   */
  giftsMayScore?: boolean;
  /**
   * Whether this game shows viewers' conversational (non-command) comments on screen, and how. Omit it and the game never
   * shows any. Only comments from registered players on a team are ever shown, after moderation and rate limiting.
   */
  chat?: ChatConfig;
}

export interface ChatConfig {
  /** Longest text shown, in characters. Default 60. */
  maxLength?: number;
  /** Minimum time between two shown comments from the same player. Default 6000. */
  cooldownMs?: number;
  /** Extra blocked words on top of the engine's moderation, in the format of `moderation/blocklist-tr.ts`. */
  blocklist?: readonly string[];
  /** Whether it starts switched on. Default true (the operator can switch it off). */
  defaultEnabled?: boolean;
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

/**
 * What a gift handler may return: presentation effects, and (only in a game that declares `giftsMayScore`) team points.
 * The engine enforces the capability, so a game that did not opt in cannot score from gifts by accident.
 */
export type GiftEffect = Extract<ModeEffect, { type: 'present' | 'score' }>;

export interface GameMode {
  id: ModeId;
  config: GameModeConfig;
  handleCommand(ctx: ModeContext, action: CommandAction): ModeEffect[];
  handleGift(ctx: ModeContext, action: GiftAction): GiftEffect[];
}
