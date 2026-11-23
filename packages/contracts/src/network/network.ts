import { z } from 'zod';
import { PlayerIdSchema, PresentationEventSchema, PublicPlayerSchema, TeamIdSchema } from '../game/game';

export const SOCKET_NAMESPACES = {
  broadcast: '/broadcast',
  operator: '/operator',
} as const;

export type SocketNamespace = (typeof SOCKET_NAMESPACES)[keyof typeof SOCKET_NAMESPACES];

export const SOCKET_EVENTS = {
  /** Sent first on every connection. */
  hello: 'hello',
  /** Full authoritative state; sent on every (re)connect. */
  snapshot: 'state:snapshot',
  /** HUD state (no roster); re-sent whole when it changes, at most ~10 Hz. */
  hud: 'state:hud',
  /** Roster changes since the previous delta. */
  roster: 'state:roster',
  /** Batched transient visual cues; best-effort. */
  presentation: 'presentation:batch',
  /** Client → server, operator namespace only. Acknowledged with an `OperatorAck`. */
  operatorCommand: 'operator:command',
} as const;

/** Step 1.0 handshake payload. */
export const HelloSchema = z.object({
  status: z.literal('ok'),
  namespace: z.enum([SOCKET_NAMESPACES.broadcast, SOCKET_NAMESPACES.operator]),
  serverTime: z.number().int().nonnegative(),
});
export type Hello = z.infer<typeof HelloSchema>;

export const RosterDeltaSchema = z.object({
  /** New players, and players whose team or name changed. */
  upsert: z.array(PublicPlayerSchema),
  remove: z.array(PlayerIdSchema),
});
export type RosterDelta = z.infer<typeof RosterDeltaSchema>;

export const PresentationBatchSchema = z.object({
  events: z.array(PresentationEventSchema).max(2000),
  /** Per-team count of `player_action` events beyond the per-batch cap, folded into crowd energy. */
  crowd: z.array(z.object({ teamId: TeamIdSchema, actions: z.number().int().positive() })),
  /** Server clock time (epoch ms) at which the oldest input behind this batch was ingested; lets clients measure latency to the screen. */
  oldestIngestedAt: z.number().int().nonnegative().optional(),
});
export type PresentationBatch = z.infer<typeof PresentationBatchSchema>;

/** Operator-only commands for the game; validated server-side and never accepted from viewers or the broadcast namespace. */
export const OperatorCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start_game') }),
  z.object({ type: z.literal('stop_game') }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('start_round') }),
  z.object({ type: z.literal('end_round') }),
  z.object({ type: z.literal('reset_round_score') }),
  /** Sets the broadcast sound; send `muted`, `volume`, or both. */
  z.object({ type: z.literal('set_sound'), muted: z.boolean().optional(), volume: z.number().min(0).max(1).optional() }),
  z.object({ type: z.literal('trigger_celebration'), effect: z.string().min(1).max(64) }),
  z.object({ type: z.literal('remove_player'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('ignore_player'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('reassign_player'), playerId: PlayerIdSchema, teamId: TeamIdSchema }),
]);
export type OperatorCommand = z.infer<typeof OperatorCommandSchema>;

const ViewerRefSchema = z.string().min(1).max(64);

/**
 * Operator commands addressed to the TikTok LIVE provider. Only the operator can send them; the provider is read-only
 * (it never posts, never uses a session) and the server must be started with it enabled.
 */
export const TikTokCommandSchema = z.discriminatedUnion('type', [
  /** Starts reading a creator's LIVE (the simulator is switched off first: one provider per run). */
  z.object({ type: z.literal('tiktok_connect'), username: z.string().min(1).max(200) }),
  /** The kill switch: stops reading at once and cancels any retry. */
  z.object({ type: z.literal('tiktok_disconnect') }),
]);
export type TikTokCommand = z.infer<typeof TikTokCommandSchema>;

/** Operator commands addressed to the local simulator provider (not the game engine). */
export const SimulatorCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sim_connect') }),
  z.object({ type: z.literal('sim_disconnect') }),
  /** Stops any running scenario or burst playback. */
  z.object({ type: z.literal('sim_stop') }),
  /** Adds synthetic viewers, each of whom then joins a random team. */
  z.object({ type: z.literal('sim_add_viewers'), count: z.number().int().min(1).max(200) }),
  z.object({ type: z.literal('sim_comment'), viewerId: ViewerRefSchema.optional(), text: z.string().max(1000) }),
  z.object({ type: z.literal('sim_gift'), viewerId: ViewerRefSchema.optional(), giftKey: z.string().min(1).max(64) }),
  /** `count` existing viewers send `text` within `spreadMs`. */
  z.object({
    type: z.literal('sim_burst'),
    text: z.string().min(1).max(100),
    count: z.number().int().min(1).max(200),
    spreadMs: z.number().int().min(0).max(10_000),
  }),
  z.object({
    type: z.literal('sim_scenario'),
    name: z.enum(['steady', 'chaos']),
    viewers: z.number().int().min(1).max(200),
    durationMs: z.number().int().min(1_000).max(600_000),
  }),
  z.object({ type: z.literal('sim_inject'), fault: z.enum(['duplicate', 'malformed']) }),
]);
export type SimulatorCommand = z.infer<typeof SimulatorCommandSchema>;

export const OperatorAckSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type OperatorAck = z.infer<typeof OperatorAckSchema>;
