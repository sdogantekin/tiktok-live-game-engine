import { z } from 'zod';

const eventBase = {
  /** Provider event id when available, otherwise an adapter-generated session-scoped id. */
  eventId: z.string().min(1).max(128),
  provider: z.string().min(1).max(32),
  userId: z.string().min(1).max(128),
  /** Adapters pass a sanitized name; the core sanitizes again before storing. */
  displayName: z.string().max(256),
  receivedAt: z.number().int().nonnegative(),
};

export const NormalizedEventSchema = z.discriminatedUnion('kind', [
  z.object({
    ...eventBase,
    kind: z.literal('comment.received'),
    payload: z.object({ text: z.string().max(1000) }),
  }),
  z.object({
    ...eventBase,
    kind: z.literal('gift.received'),
    payload: z.object({
      /** Semantic gift key mapped by the adapter; never a price or coin value. */
      giftKey: z.string().min(1).max(64),
      count: z.number().int().min(1).max(999),
    }),
  }),
  z.object({
    ...eventBase,
    kind: z.literal('like.received'),
    payload: z.object({
      /** How many likes this event stands for: a viewer tapping the screen sends many at once. */
      count: z.number().int().min(1).max(10_000),
    }),
  }),
]);
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;
