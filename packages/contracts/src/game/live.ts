import { z } from 'zod';
import { PlayerIdSchema } from './game';

/**
 * The continuously changing view of a game that simulates something on the server every moment (a race). It is sent to
 * the broadcast about ten times a second, separately from the snapshot, and describes only what the screen needs to
 * draw. Positions are the server's: the browser interpolates between views, it never decides anything.
 */
export const RacerViewSchema = z.object({
  id: PlayerIdSchema,
  name: z.string().max(64),
  /** Metres along the track since the start line (laps included). */
  distance: z.number().nonnegative().max(1_000_000),
  /** Current speed in metres per second. */
  speed: z.number().nonnegative().max(1000),
  /** 0..1: how much the racer is boosted right now (for the glow and sound). */
  boost: z.number().min(0).max(1),
  /** The finishing place, or null while still racing. */
  place: z.number().int().positive().nullable(),
  /** Seconds from the start of the race when it crossed the line, or null while still racing (for the gaps between finishers). */
  finishTime: z.number().nonnegative().max(100_000).nullable(),
});
export type RacerView = z.infer<typeof RacerViewSchema>;

export const RaceViewSchema = z.object({
  kind: z.literal('race'),
  /** Counts up with every view sent; lets the client drop views that arrive late or out of order. */
  seq: z.number().int().nonnegative(),
  serverNow: z.number().int().nonnegative(),
  /** `grid`: lining up. `racing`: under way. `finished`: everyone is in or time ran out. */
  stage: z.enum(['grid', 'racing', 'finished']),
  laps: z.number().int().positive().max(100),
  /** Length of one lap in metres. */
  lapLength: z.number().positive().max(100_000),
  racers: z.array(RacerViewSchema).max(32),
  /** Viewers waiting for a free place in the next race. */
  waiting: z.number().int().nonnegative(),
  /** How many racers a race takes. */
  capacity: z.number().int().positive().max(32),
});
export type RaceView = z.infer<typeof RaceViewSchema>;

export const LiveViewSchema = z.discriminatedUnion('kind', [RaceViewSchema]);
export type LiveView = z.infer<typeof LiveViewSchema>;

/** What a game's live part describes; the engine adds the sequence number and the server time when it sends it. */
export type LiveViewBody = LiveView extends infer V ? (V extends LiveView ? Omit<V, 'seq' | 'serverNow'> : never) : never;
