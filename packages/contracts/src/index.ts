import { z } from 'zod';

export const SOCKET_NAMESPACES = {
  broadcast: '/broadcast',
  operator: '/operator',
} as const;

export type SocketNamespace = (typeof SOCKET_NAMESPACES)[keyof typeof SOCKET_NAMESPACES];

/** Phase 0 handshake payload; replaced by the real snapshot contract in later phases. */
export const HelloSchema = z.object({
  status: z.literal('ok'),
  namespace: z.enum([SOCKET_NAMESPACES.broadcast, SOCKET_NAMESPACES.operator]),
  serverTime: z.number().int().nonnegative(),
});

export type Hello = z.infer<typeof HelloSchema>;
