import { z } from 'zod';
import { PlayerIdSchema, TeamIdSchema } from '../game/game';

export const SOCKET_NAMESPACES = {
  broadcast: '/broadcast',
  operator: '/operator',
} as const;

export type SocketNamespace = (typeof SOCKET_NAMESPACES)[keyof typeof SOCKET_NAMESPACES];

export const SOCKET_EVENTS = {
  hello: 'hello',
  snapshot: 'state:snapshot',
  presentation: 'presentation:batch',
  operatorCommand: 'operator:command',
} as const;

/** Phase 0 handshake payload. */
export const HelloSchema = z.object({
  status: z.literal('ok'),
  namespace: z.enum([SOCKET_NAMESPACES.broadcast, SOCKET_NAMESPACES.operator]),
  serverTime: z.number().int().nonnegative(),
});
export type Hello = z.infer<typeof HelloSchema>;

/** Operator-only commands; validated server-side and never accepted from viewers or the broadcast namespace. */
export const OperatorCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start_game') }),
  z.object({ type: z.literal('stop_game') }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('start_round') }),
  z.object({ type: z.literal('end_round') }),
  z.object({ type: z.literal('reset_round_score') }),
  z.object({ type: z.literal('trigger_celebration'), effect: z.string().min(1).max(64) }),
  z.object({ type: z.literal('remove_player'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('ignore_player'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('reassign_player'), playerId: PlayerIdSchema, teamId: TeamIdSchema }),
]);
export type OperatorCommand = z.infer<typeof OperatorCommandSchema>;
