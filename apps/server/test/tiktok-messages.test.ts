import { NormalizedEventSchema } from '@live-game/contracts';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GIFT_MAP, giftKeyLookup } from '../src/providers/tiktok/gift-map';
import { parseChat, parseGift } from '../src/providers/tiktok/messages';
import { normalizeUsername } from '../src/providers/tiktok/username';

const NOW = 1_700_000_000_000;
const user = { id: '6884100200', nickname: 'Ayşe', displayId: 'ayse.halay' };
const chat = (over: Record<string, unknown> = {}) => ({ common: { msgId: '7300000000000000001', createTime: '1700000000' }, user, content: 'gelin', ...over });
const giftMessage = (over: Record<string, unknown> = {}) => ({
  common: { msgId: '7300000000000000002' },
  user,
  giftId: '5655',
  groupId: '99',
  repeatCount: 1,
  repeatEnd: 0,
  gift: { type: 2, name: 'Rose', diamondCount: 1 },
  ...over,
});
const keyFor = giftKeyLookup();

describe('normalizeUsername', () => {
  it('accepts a name, an @name, and a profile or live URL', () => {
    expect(normalizeUsername('halay.kanali')).toBe('halay.kanali');
    expect(normalizeUsername('  @halay_kanali  ')).toBe('halay_kanali');
    expect(normalizeUsername('https://www.tiktok.com/@halay.kanali')).toBe('halay.kanali');
    expect(normalizeUsername('https://www.tiktok.com/@halay.kanali/live?lang=tr')).toBe('halay.kanali');
    expect(normalizeUsername('tiktok.com/@abc')).toBe('abc');
  });

  it('rejects what cannot be a username: display names, spaces, odd characters, wrong length, a trailing dot', () => {
    for (const bad of ['', ' ', 'a', 'Halay Kanalı', 'ayşe', 'name!', 'x'.repeat(25), 'abc.', '@@abc', '../etc/passwd', 'a b', '<script>']) {
      expect(normalizeUsername(bad), bad).toBeNull();
    }
  });
});

describe('parseChat', () => {
  it('turns a chat message into a comment event with the message id as the event id', () => {
    const event = parseChat(chat(), NOW)!;
    expect(NormalizedEventSchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({
      kind: 'comment.received',
      provider: 'tiktok',
      eventId: 'chat-7300000000000000001',
      userId: '6884100200',
      displayName: 'Ayşe',
      receivedAt: NOW,
      payload: { text: 'gelin' },
    });
  });

  it('reads ids and numbers whatever form TikTok sends them in (string, number, bigint)', () => {
    expect(parseChat(chat({ user: { id: 42n, nickname: 'n' }, common: { msgId: 7n } }), NOW)).toMatchObject({ userId: '42', eventId: 'chat-7' });
    expect(parseChat(chat({ user: { id: 42, nickname: 'n' } }), NOW)).toMatchObject({ userId: '42' });
  });

  it('builds a stable event id from the content when TikTok sent no message id, so a replay is recognised', () => {
    const noId = chat({ common: { createTime: '1700000000' } });
    const first = parseChat(noId, NOW)!;
    const again = parseChat(noId, NOW + 5_000)!;
    expect(first.eventId).toBe(again.eventId);
    expect(first.eventId).not.toBe(parseChat(chat({ common: { createTime: '1700000000' }, content: 'damat' }), NOW)!.eventId);
  });

  it('drops anything it cannot understand instead of guessing', () => {
    for (const bad of [null, undefined, 42, 'text', [], {}, chat({ user: undefined }), chat({ user: {} }), chat({ content: '' }), chat({ content: '   ' }), chat({ content: 5 })]) {
      expect(parseChat(bad, NOW), JSON.stringify(bad)).toBeNull();
    }
  });

  it('treats a hostile comment and name as plain text: clamped, control characters removed, never interpreted', () => {
    const hostile = parseChat(chat({ content: `<img src=x onerror=alert(1)>${'x'.repeat(5000)}`, user: { id: '1', nickname: `Evil\u0000\u0007<b>name</b>${'n'.repeat(1000)}` } }), NOW)!;
    expect(NormalizedEventSchema.safeParse(hostile).success).toBe(true); // still within the contract's limits
    if (hostile.kind !== 'comment.received') throw new Error('expected a comment');
    expect(hostile.payload.text.length).toBeLessThanOrEqual(1000);
    expect(hostile.payload.text.startsWith('<img')).toBe(true); // kept as text; rendering is the views' job (React text nodes)
    expect([...hostile.displayName].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)).toBe(false); // no control characters
    expect(hostile.displayName.length).toBeLessThanOrEqual(256);
    expect(hostile.eventId.length).toBeLessThanOrEqual(128);
  });

  it('falls back to the profile name when there is no nickname', () => {
    expect(parseChat(chat({ user: { id: '1', displayId: 'only.id' } }), NOW)).toMatchObject({ displayName: 'only.id' });
    expect(parseChat(chat({ user: { id: '1' } }), NOW)).toMatchObject({ displayName: 'viewer' });
  });
});

describe('parseGift', () => {
  it('turns a single gift into one gift event with a semantic key, never a price', () => {
    const event = parseGift(giftMessage(), NOW, keyFor)!;
    expect(NormalizedEventSchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({ kind: 'gift.received', provider: 'tiktok', eventId: 'gift-7300000000000000002', userId: '6884100200', payload: { giftKey: 'rose', count: 1 } });
    expect(JSON.stringify(event)).not.toMatch(/diamond/i);
  });

  it('counts a streak once: intermediate updates are skipped and the final one carries the cumulative total', () => {
    const streak = (repeatCount: number, repeatEnd: number, msgId: string) => giftMessage({ gift: { type: 1, name: 'Rose', diamondCount: 1 }, repeatCount, repeatEnd, common: { msgId } });
    expect(parseGift(streak(1, 0, 'a'), NOW, keyFor)).toBeNull();
    expect(parseGift(streak(2, 0, 'b'), NOW, keyFor)).toBeNull();
    expect(parseGift(streak(3, 0, 'c'), NOW, keyFor)).toBeNull();
    const done = parseGift(streak(7, 1, 'd'), NOW, keyFor)!;
    expect(done).toMatchObject({ kind: 'gift.received', payload: { giftKey: 'rose', count: 7 } });

    // Feeding the whole stream yields exactly one event, with the cumulative count, not 1+2+3+7.
    const events = [streak(1, 0, 'a'), streak(2, 0, 'b'), streak(3, 0, 'c'), streak(7, 1, 'd')].map((m) => parseGift(m, NOW, keyFor)).filter(Boolean);
    expect(events).toHaveLength(1);
  });

  it('counts a non-streakable gift once, whatever its repeat fields say', () => {
    expect(parseGift(giftMessage({ gift: { type: 2, name: 'Rose', diamondCount: 1 }, repeatCount: 1, repeatEnd: 0 }), NOW, keyFor)).not.toBeNull();
  });

  it('keeps the count inside the contract and ignores nonsense', () => {
    const final = (repeatCount: unknown) => giftMessage({ gift: { type: 1, name: 'Rose', diamondCount: 1 }, repeatEnd: 1, repeatCount });
    expect((parseGift(final(100_000), NOW, keyFor) as { payload: { count: number } }).payload.count).toBe(999);
    expect((parseGift(final(0), NOW, keyFor) as { payload: { count: number } }).payload.count).toBe(1);
    expect((parseGift(final(-5), NOW, keyFor) as { payload: { count: number } }).payload.count).toBe(1);
    expect((parseGift(final('abc'), NOW, keyFor) as { payload: { count: number } }).payload.count).toBe(1);
  });

  it('drops gifts with no sender, no mapping, or a malformed body', () => {
    expect(parseGift(giftMessage({ user: undefined }), NOW, keyFor)).toBeNull();
    expect(parseGift(giftMessage({ gift: { type: 2, name: 'Mystery', diamondCount: 0 } }), NOW, keyFor)).toBeNull(); // worth nothing: no key
    expect(parseGift(null, NOW, keyFor)).toBeNull();
    expect(parseGift('gift', NOW, keyFor)).toBeNull();
    expect(parseGift({}, NOW, keyFor)).toBeNull();
  });

  it('builds a stable id from the stream group when there is no message id', () => {
    const noId = giftMessage({ common: {} });
    expect(parseGift(noId, NOW, keyFor)!.eventId).toBe(parseGift(noId, NOW + 1, keyFor)!.eventId);
  });
});

describe('gift map', () => {
  it('maps named gifts first (case-insensitive), then by value tier, and nothing for a worthless unknown gift', () => {
    expect(keyFor({ name: 'ROSE', diamondCount: 1 })).toBe('rose');
    expect(keyFor({ name: ' gg ', diamondCount: 1 })).toBe('gg');
    expect(keyFor({ name: 'Galaxy', diamondCount: 1000 })).toBe('big_celebration');
    expect(keyFor({ name: 'Heart', diamondCount: 99 })).toBe('gg');
    expect(keyFor({ name: 'Heart', diamondCount: 5 })).toBe('rose');
    expect(keyFor({ name: 'Free', diamondCount: 0 })).toBeNull();
  });

  it('only ever returns keys the game knows (the placeholder tiers use the Halay keys)', () => {
    const keys = new Set(['rose', 'gg', 'big_celebration']);
    for (const key of [...Object.values(DEFAULT_GIFT_MAP.byName), ...DEFAULT_GIFT_MAP.tiers.map((t) => t.key)]) expect(keys.has(key)).toBe(true);
  });
});
