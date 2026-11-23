import type { CommandConfig, GameModeConfig } from '../../core/mode';

/** What a gift does for the racer who sent it. A gift never touches anyone else's horse. */
export type RaceGift =
  /** A short burst of extra speed. */
  | { kind: 'surge'; effect: string; durationMs: number; bonus: number }
  /** A jockey for the rest of the race: a small steady speed-up and a steadier pace. */
  | { kind: 'jockey'; effect: string; bonus: number };

export interface RaceTuning {
  /** Racers per race; others wait for the next one. */
  capacity: number;
  laps: number;
  lapLengthM: number;
  /** Speed of an average horse with no help, metres per second (a 400 m lap takes about 25 s). */
  baseSpeed: number;
  /** Each horse is a little faster or slower than average: speed is multiplied by 1 +/- this. */
  temperament: number;
  /** How much a horse's luck can add or take away at any moment (fraction of its speed). */
  luck: number;
  /** Likes: each one adds `perLike` of boost, shrinking as the boost nears `max`, and the boost fades with time constant `fadeSeconds`. */
  likes: { perLike: number; max: number; fadeSeconds: number };
  /** All gift help together can never add more than this (a fraction of speed), so likes alone can always match it. */
  giftBonusCap: number;
  /** Horses behind speed up and horses ahead slow down by at most this fraction, to keep the field together. */
  catchUp: number;
  /** No horse ever goes faster than this, whatever is sent. */
  maxSpeed: number;
}

export interface AtYarisiConfig extends GameModeConfig {
  race: RaceTuning;
  gifts: Readonly<Record<string, RaceGift>>;
}

export const RACE_TEAM_ID = 'yarisci';

const command = (): CommandConfig => ({ droppable: false });

/** All numbers are placeholders, tuned by the simulation test and playtesting. */
export const atYarisiConfig: AtYarisiConfig = {
  // One team: everyone who joined (racing or waiting). Results are individual, so no team scores are shown.
  teams: [{ id: RACE_TEAM_ID, name: 'Yarışçılar' }],
  timings: { countdownMs: 15_000, roundMs: 240_000, resultsMs: 20_000, autoNext: true },
  commands: { '1': command(), at: command(), yarış: command(), katıl: command() },
  cooldowns: {
    /** Per viewer: how often the "you are waiting for the next race" hint may show. */
    hint: 8_000,
    /** Per racer: how often a like burst may show a boost cue on screen. */
    boostCue: 1_000,
    /** Session-wide: how often a gift from someone who is not racing may cheer the crowd. */
    crowdCheer: 4_000,
  },
  celebrations: ['surge_rose', 'surge_gg', 'jockey', 'crowd_cheer'],
  chat: { maxLength: 60, cooldownMs: 6_000 },
  likes: { maxPerSecond: 20 },
  race: {
    capacity: 10,
    laps: 6,
    lapLengthM: 400,
    baseSpeed: 16,
    temperament: 0.08,
    luck: 0.06,
    likes: { perLike: 0.012, max: 0.3, fadeSeconds: 4 },
    giftBonusCap: 0.1,
    catchUp: 0.06,
    maxSpeed: 30,
  },
  gifts: {
    rose: { kind: 'surge', effect: 'surge_rose', durationMs: 4_000, bonus: 0.06 },
    gg: { kind: 'surge', effect: 'surge_gg', durationMs: 6_000, bonus: 0.09 },
    big_celebration: { kind: 'jockey', effect: 'jockey', bonus: 0.02 },
  },
};
