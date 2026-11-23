import type { CommandConfig, GameModeConfig } from '../../core/mode';

export type TakiBehavior =
  | { kind: 'join'; teamId: string }
  /** `tak`: the guest walks up and pins a takı on their side's person; it adds one point (cooldown-limited). */
  | { kind: 'pin'; animation: string; points: number }
  /** Applause, visual only. */
  | { kind: 'applaud'; animation: string };

export interface TakiCommandConfig extends CommandConfig {
  behavior: TakiBehavior;
}

export interface TakiGiftConfig {
  /** The takı the guest gives (presentation effect id); a bigger gift is a more expensive item. */
  item: string;
  /** Bonus points for the sender's side. Counted only because this game sets `giftsMayScore`. */
  points: number;
  /** Optional session-wide cooldown key from `cooldowns` for the visual moment (points are never cooldown-limited). */
  globalCooldown?: string;
}

export interface TakiTakmaConfig extends GameModeConfig {
  commands: Readonly<Record<string, TakiCommandConfig>>;
  /** Simulator gift keys → takı and bonus points. Placeholder values to tune; real platform gift tiers are a Phase 2 mapping. */
  gifts: Readonly<Record<string, TakiGiftConfig>>;
}

export const takiTakmaConfig: TakiTakmaConfig = {
  teams: [
    { id: 'gelin', name: 'Gelin Tarafı' },
    { id: 'damat', name: 'Damat Tarafı' },
  ],
  timings: { countdownMs: 15_000, roundMs: 180_000, resultsMs: 15_000, autoNext: true },
  commands: {
    gelin: { droppable: false, behavior: { kind: 'join', teamId: 'gelin' } },
    damat: { droppable: false, behavior: { kind: 'join', teamId: 'damat' } },
    tak: { droppable: false, behavior: { kind: 'pin', animation: 'pin', points: 1 } },
    alkış: { droppable: true, behavior: { kind: 'applaud', animation: 'clap' } },
  },
  cooldowns: {
    /** Per player: how often a `tak` may be pinned (the walk to the couple takes a while). */
    score: 8_000,
    /** Per player: how often the pin or applause animation may play outside a scoring round, and applause in a round. */
    visual: 3_000,
    /** Per player: how often the "join a side first" hint may show. */
    hint: 5_000,
    /** Session-wide limits on the big takı moments. */
    big_item: 4_000,
  },
  celebrations: ['bilezik', 'kolye_seti', 'ev_anahtari'],
  // A gift is a game-level decision: here a gift adds bonus points for the sender's side (never in Mahalle Halayı).
  giftsMayScore: true,
  chat: { maxLength: 60, cooldownMs: 6_000 },
  gifts: {
    rose: { item: 'bilezik', points: 3 },
    gg: { item: 'kolye_seti', points: 10, globalCooldown: 'big_item' },
    big_celebration: { item: 'ev_anahtari', points: 30, globalCooldown: 'big_item' },
  },
};
