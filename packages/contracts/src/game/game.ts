import { z } from 'zod';

export const MODE_IDS = ['mahalle-halayi'] as const;
export const ModeIdSchema = z.enum(MODE_IDS);
export type ModeId = z.infer<typeof ModeIdSchema>;

/** Round lifecycle phase. `paused` is a separate flag laid over the current phase. */
export const PhaseSchema = z.enum(['stopped', 'lobby', 'countdown', 'active', 'results']);
export type Phase = z.infer<typeof PhaseSchema>;

export const TeamIdSchema = z.string().min(1).max(32);
export type TeamId = z.infer<typeof TeamIdSchema>;

export const TeamDefinitionSchema = z.object({
  id: TeamIdSchema,
  name: z.string().min(1).max(48),
});
export type TeamDefinition = z.infer<typeof TeamDefinitionSchema>;

export const PlayerIdSchema = z.string().min(1).max(160);

export const PublicPlayerSchema = z.object({
  id: PlayerIdSchema,
  name: z.string().max(96),
  teamId: TeamIdSchema.nullable(),
  joinedAt: z.number().int().nonnegative(),
  lastActiveAt: z.number().int().nonnegative(),
});
export type PublicPlayer = z.infer<typeof PublicPlayerSchema>;

export const TeamStandingSchema = z.object({
  id: TeamIdSchema,
  name: z.string(),
  score: z.number().int().nonnegative(),
  playerCount: z.number().int().nonnegative(),
});
export type TeamStanding = z.infer<typeof TeamStandingSchema>;

export const RoundResultSchema = z.object({
  round: z.number().int().positive(),
  /** Winning team id, or null for a draw. */
  winner: TeamIdSchema.nullable(),
  teams: z.array(TeamStandingSchema),
});
export type RoundResult = z.infer<typeof RoundResultSchema>;

/** Complete authoritative state sent on connect/reconnect. Clients derive remaining time from `phaseEndsAt - serverNow`. */
export const PublicSnapshotSchema = z.object({
  modeId: ModeIdSchema,
  serverNow: z.number().int().nonnegative(),
  phase: PhaseSchema,
  paused: z.boolean(),
  round: z.number().int().nonnegative(),
  /** Server epoch ms when the current timed phase ends; null when untimed or paused. */
  phaseEndsAt: z.number().int().nonnegative().nullable(),
  /** Time left in the frozen phase while paused; null otherwise. */
  remainingMs: z.number().int().nonnegative().nullable(),
  teams: z.array(TeamStandingSchema),
  players: z.array(PublicPlayerSchema),
  lastResult: RoundResultSchema.nullable(),
});
export type PublicSnapshot = z.infer<typeof PublicSnapshotSchema>;

/** Input the core hands to the active game mode. `command` is a normalized command key from mode config. */
export const GameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('command'), playerId: PlayerIdSchema, command: z.string().min(1).max(64) }),
  z.object({
    type: z.literal('gift'),
    playerId: PlayerIdSchema.nullable(),
    giftKey: z.string().min(1).max(64),
    count: z.number().int().min(1).max(999),
  }),
]);
export type GameAction = z.infer<typeof GameActionSchema>;

/** Transient, best-effort visual cues. Never required for state correctness. */
export const PresentationEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('player_joined'), playerId: PlayerIdSchema, teamId: TeamIdSchema }),
  z.object({ type: z.literal('player_action'), playerId: PlayerIdSchema, animation: z.string().min(1).max(64) }),
  z.object({ type: z.literal('celebration'), effect: z.string().min(1).max(64), playerId: PlayerIdSchema.optional() }),
  z.object({ type: z.literal('hint'), playerId: PlayerIdSchema, reason: z.enum(['no_team', 'switch_locked']) }),
]);
export type PresentationEvent = z.infer<typeof PresentationEventSchema>;
