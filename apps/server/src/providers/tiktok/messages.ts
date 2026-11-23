import type { NormalizedEvent } from '@live-game/contracts';

/**
 * Parsing of TikTok LIVE messages into the engine's normalized events. Everything that arrives from TikTok is untrusted:
 * the shapes below are read defensively (numbers may be strings or bigints, any field may be missing), nothing is
 * trusted to be well formed, and a message that cannot be understood is dropped rather than guessed at.
 */
export const TIKTOK_PROVIDER = 'tiktok';

const MAX_ID = 128;

/** A scalar that identifies something (TikTok sends ids as strings, numbers or bigints). */
function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  return null;
}

function intOf(value: unknown): number | null {
  const n = typeof value === 'bigint' ? Number(value) : typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : null;
}

const record = (value: unknown): Record<string, unknown> | null => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null);

/** Strips control characters and clamps length; the core sanitizes again before storing. */
function cleanName(value: unknown): string {
  const text = typeof value === 'string' ? value : '';
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 256);
}

/** A small stable hash, to make an event id out of content when TikTok sent no message id. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function senderOf(user: unknown): { userId: string; displayName: string } | null {
  const u = record(user);
  if (!u) return null;
  const userId = idOf(u.id) ?? idOf(u.userId) ?? idOf(u.displayId) ?? idOf(u.uniqueId);
  if (userId === null) return null;
  const displayName = cleanName(u.nickname) || cleanName(u.displayId) || cleanName(u.uniqueId) || 'viewer';
  return { userId: userId.slice(0, MAX_ID), displayName };
}

const clampId = (id: string) => id.slice(0, MAX_ID);

/** A chat message becomes a `comment.received` event, or null if it has no sender or no text. */
export function parseChat(raw: unknown, receivedAt: number): NormalizedEvent | null {
  const message = record(raw);
  if (!message) return null;
  const sender = senderOf(message.user);
  const text = typeof message.content === 'string' ? message.content : typeof message.comment === 'string' ? message.comment : '';
  const trimmed = text.trim();
  if (!sender || trimmed === '') return null;

  const common = record(message.common);
  const msgId = idOf(common?.msgId);
  const eventId = msgId !== null ? `chat-${msgId}` : `chat-${sender.userId}-${idOf(common?.createTime) ?? ''}-${hash(trimmed)}`;
  return {
    kind: 'comment.received',
    eventId: clampId(eventId),
    provider: TIKTOK_PROVIDER,
    userId: sender.userId,
    displayName: sender.displayName,
    receivedAt,
    payload: { text: trimmed.slice(0, 1000) },
  };
}

/** How the provider turns a TikTok gift into one of the game's semantic gift keys (never a price). */
export type GiftKeyFor = (gift: { name: string; diamondCount: number }) => string | null;

/**
 * A gift becomes a `gift.received` event, once per gift. TikTok sends a streak of the same gift as several updates while
 * the sender keeps tapping (`gift.type === 1` marks a streakable gift); only the final update (`repeatEnd === 1`) is the
 * finished streak, and its `repeatCount` is the cumulative total, so counting every update would overcount.
 * Returns null for intermediate streak updates, gifts the game has no key for, and malformed messages.
 */
export function parseGift(raw: unknown, receivedAt: number, giftKeyFor: GiftKeyFor): NormalizedEvent | null {
  const message = record(raw);
  if (!message) return null;
  const sender = senderOf(message.user);
  if (!sender) return null;

  const gift = record(message.gift);
  const streakable = intOf(gift?.type) === 1;
  if (streakable && intOf(message.repeatEnd) !== 1) return null; // the streak is still growing

  const giftKey = giftKeyFor({ name: typeof gift?.name === 'string' ? gift.name : '', diamondCount: intOf(gift?.diamondCount) ?? 0 });
  if (giftKey === null) return null;

  const count = Math.min(999, Math.max(1, intOf(message.repeatCount) ?? 1));
  const common = record(message.common);
  const msgId = idOf(common?.msgId);
  const eventId =
    msgId !== null
      ? `gift-${msgId}`
      : `gift-${idOf(message.groupId) ?? idOf(message.giftId) ?? 'x'}-${sender.userId}-${count}-${idOf(common?.createTime) ?? ''}`;
  return {
    kind: 'gift.received',
    eventId: clampId(eventId),
    provider: TIKTOK_PROVIDER,
    userId: sender.userId,
    displayName: sender.displayName,
    receivedAt,
    payload: { giftKey, count },
  };
}
