import type { CommandConfig, GameModeConfig } from '../../core/mode';

export type MahalleBehavior =
  | { kind: 'join'; teamId: string }
  /** `points` > 0 adds team energy (cooldown-limited); 0 is a visual-only action. */
  | { kind: 'dance'; animation: string; points: number };

export interface MahalleCommandConfig extends CommandConfig {
  behavior: MahalleBehavior;
}

export interface GiftConfig {
  /** Presentation effect id. Gifts are cosmetic: there is deliberately no score field. */
  effect: string;
  /** `sender` plays on the sender's avatar (crowd-wide if they are not a participant). */
  target: 'sender' | 'crowd';
  /** Optional session-wide cooldown key from `cooldowns`. */
  globalCooldown?: string;
}

export interface MahalleHalayiConfig extends GameModeConfig {
  commands: Readonly<Record<string, MahalleCommandConfig>>;
  /** Simulator gift keys → effects. Not tied to any real platform's gift names or prices. */
  gifts: Readonly<Record<string, GiftConfig>>;
}

export const mahalleHalayiConfig: MahalleHalayiConfig = {
  teams: [
    { id: 'gelin', name: 'Gelin Tarafı' },
    { id: 'damat', name: 'Damat Tarafı' },
  ],
  timings: { countdownMs: 15_000, roundMs: 180_000, resultsMs: 15_000, autoNext: true },
  commands: {
    gelin: { droppable: false, behavior: { kind: 'join', teamId: 'gelin' } },
    damat: { droppable: false, behavior: { kind: 'join', teamId: 'damat' } },
    halay: { droppable: false, behavior: { kind: 'dance', animation: 'halay', points: 1 } },
    zıpla: { droppable: true, behavior: { kind: 'dance', animation: 'zipla', points: 0 } },
    oyna: { droppable: true, behavior: { kind: 'dance', animation: 'oyna', points: 0 } },
  },
  cooldowns: {
    /** Per player: how often a `halay` may add energy. */
    score: 5_000,
    /** Per player: how often any dance animation may play. */
    visual: 2_000,
    /** Per player: how often the "join a team first" hint may show. */
    hint: 5_000,
    /** Session-wide gift effect cooldowns. */
    gg: 5_000,
    big_celebration: 10_000,
  },
  celebrations: ['gg', 'big_celebration'],
  // Viewers who joined may chat: short, moderated comments appear as speech bubbles. No game-specific blocked words.
  chat: { maxLength: 60, cooldownMs: 6_000 },
  gifts: {
    rose: { effect: 'rose', target: 'sender' },
    gg: { effect: 'gg', target: 'crowd', globalCooldown: 'gg' },
    big_celebration: { effect: 'big_celebration', target: 'crowd', globalCooldown: 'big_celebration' },
  },
};
