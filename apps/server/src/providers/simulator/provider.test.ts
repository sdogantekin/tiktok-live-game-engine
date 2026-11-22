import { NormalizedEventSchema, type ProviderStatus } from '@live-game/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulatorProvider } from './provider';

function setup() {
  const emitted: unknown[] = [];
  const statuses: ProviderStatus[] = [];
  const provider = new SimulatorProvider({
    emit: (raw) => emitted.push(raw),
    seed: 1,
    joinSpreadMs: 100,
    onStatusChange: (status) => statuses.push(status),
  });
  return { provider, emitted, statuses };
}

const textOf = (raw: unknown) => (raw as { payload: { text: string } }).payload.text;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('adding viewers', () => {
  it('has each new viewer send one valid join comment within the spread, then stops its timer', () => {
    const { provider, emitted } = setup();
    expect(provider.handle({ type: 'sim_add_viewers', count: 20 })).toEqual({ ok: true });
    expect(provider.viewerCount).toBe(20);

    vi.advanceTimersByTime(150);
    expect(emitted).toHaveLength(20);
    expect(emitted.every((e) => NormalizedEventSchema.safeParse(e).success)).toBe(true);
    expect(emitted.every((e) => ['gelin', 'damat'].includes(textOf(e)))).toBe(true);
    expect(new Set(emitted.map((e) => (e as { userId: string }).userId)).size).toBe(20);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps numbering unique across calls and enforces a pool limit', () => {
    const { provider, emitted } = setup();
    provider.handle({ type: 'sim_add_viewers', count: 5 });
    provider.handle({ type: 'sim_add_viewers', count: 5 });
    vi.advanceTimersByTime(150);
    expect(new Set(emitted.map((e) => (e as { userId: string }).userId)).size).toBe(10);

    for (let i = 0; i < 4; i++) provider.handle({ type: 'sim_add_viewers', count: 200 });
    expect(provider.handle({ type: 'sim_add_viewers', count: 200 })).toEqual({ ok: false, reason: 'viewer_limit' });
  });
});

describe('manual comments and gifts', () => {
  it('sends as a named viewer, even one outside the pool', () => {
    const { provider, emitted } = setup();
    expect(provider.handle({ type: 'sim_comment', viewerId: 'someone', text: 'halay' })).toEqual({ ok: true });
    expect(provider.handle({ type: 'sim_gift', viewerId: 'someone', giftKey: 'rose' })).toEqual({ ok: true });
    expect(emitted).toMatchObject([
      { kind: 'comment.received', userId: 'someone', payload: { text: 'halay' } },
      { kind: 'gift.received', userId: 'someone', payload: { giftKey: 'rose', count: 1 } },
    ]);
  });

  it('needs a pool to pick a random viewer', () => {
    const { provider, emitted } = setup();
    expect(provider.handle({ type: 'sim_comment', text: 'halay' })).toEqual({ ok: false, reason: 'no_viewers' });
    provider.handle({ type: 'sim_add_viewers', count: 3 });
    vi.advanceTimersByTime(150);
    emitted.length = 0;
    expect(provider.handle({ type: 'sim_comment', text: 'halay' })).toEqual({ ok: true });
    expect(emitted).toHaveLength(1);
  });

  it('gives every manual event a unique id', () => {
    const { provider, emitted } = setup();
    for (let i = 0; i < 5; i++) provider.handle({ type: 'sim_comment', viewerId: 'v', text: 'x' });
    expect(new Set(emitted.map((e) => (e as { eventId: string }).eventId)).size).toBe(5);
  });
});

describe('burst', () => {
  it('has existing viewers send the text within the spread', () => {
    const { provider, emitted } = setup();
    provider.handle({ type: 'sim_add_viewers', count: 30 });
    vi.advanceTimersByTime(150);
    emitted.length = 0;

    expect(provider.handle({ type: 'sim_burst', text: 'halay', count: 30, spreadMs: 500 })).toEqual({ ok: true });
    vi.advanceTimersByTime(499);
    const early = emitted.length;
    vi.advanceTimersByTime(10);
    expect(early).toBeLessThanOrEqual(30);
    expect(emitted).toHaveLength(30);
    expect(emitted.every((e) => textOf(e) === 'halay')).toBe(true);
  });

  it('refuses without enough viewers', () => {
    const { provider } = setup();
    expect(provider.handle({ type: 'sim_burst', text: 'halay', count: 5, spreadMs: 0 })).toEqual({ ok: false, reason: 'no_viewers' });
    provider.handle({ type: 'sim_add_viewers', count: 3 });
    expect(provider.handle({ type: 'sim_burst', text: 'halay', count: 5, spreadMs: 0 })).toEqual({
      ok: false,
      reason: 'not_enough_viewers',
    });
  });
});

describe('scenarios', () => {
  it('plays over time and can be stopped', () => {
    const { provider, emitted } = setup();
    expect(provider.handle({ type: 'sim_scenario', name: 'steady', viewers: 50, durationMs: 20_000 })).toEqual({ ok: true });

    vi.advanceTimersByTime(5_000);
    const afterFive = emitted.length;
    expect(afterFive).toBeGreaterThan(0);

    provider.handle({ type: 'sim_stop' });
    vi.advanceTimersByTime(15_000);
    expect(emitted).toHaveLength(afterFive);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('runs a chaos scenario that includes junk payloads', () => {
    const { provider, emitted } = setup();
    provider.handle({ type: 'sim_scenario', name: 'chaos', viewers: 20, durationMs: 10_000 });
    vi.advanceTimersByTime(11_000);
    expect(emitted.some((e) => !NormalizedEventSchema.safeParse(e).success)).toBe(true);
    expect(emitted.some((e) => NormalizedEventSchema.safeParse(e).success)).toBe(true);
  });
});

describe('connection state', () => {
  it('disconnect stops playback, blocks commands, and reconnect restores them', () => {
    const { provider, emitted, statuses } = setup();
    provider.handle({ type: 'sim_scenario', name: 'steady', viewers: 50, durationMs: 20_000 });
    vi.advanceTimersByTime(2_000);
    const before = emitted.length;

    expect(provider.handle({ type: 'sim_disconnect' })).toEqual({ ok: true });
    expect(provider.status).toBe('disconnected');
    vi.advanceTimersByTime(10_000);
    expect(emitted).toHaveLength(before);
    expect(provider.handle({ type: 'sim_comment', viewerId: 'v', text: 'x' })).toEqual({
      ok: false,
      reason: 'provider_disconnected',
    });
    expect(provider.handle({ type: 'sim_stop' })).toEqual({ ok: true }); // always allowed

    expect(provider.handle({ type: 'sim_connect' })).toEqual({ ok: true });
    expect(provider.handle({ type: 'sim_comment', viewerId: 'v', text: 'x' })).toEqual({ ok: true });
    expect(statuses).toEqual(['disconnected', 'connected']);
  });

  it('does not report a status change when nothing changed', () => {
    const { provider, statuses } = setup();
    provider.handle({ type: 'sim_connect' });
    expect(statuses).toEqual([]);
  });
});

describe('fault injection', () => {
  it('re-sends the last event unchanged (same event id)', () => {
    const { provider, emitted } = setup();
    expect(provider.handle({ type: 'sim_inject', fault: 'duplicate' })).toEqual({ ok: false, reason: 'nothing_to_duplicate' });
    provider.handle({ type: 'sim_comment', viewerId: 'v', text: 'gelin' });
    expect(provider.handle({ type: 'sim_inject', fault: 'duplicate' })).toEqual({ ok: true });
    expect(emitted).toHaveLength(2);
    expect(emitted[1]).toBe(emitted[0]);
  });

  it('emits a malformed payload that fails validation', () => {
    const { provider, emitted } = setup();
    expect(provider.handle({ type: 'sim_inject', fault: 'malformed' })).toEqual({ ok: true });
    expect(emitted).toHaveLength(1);
    expect(NormalizedEventSchema.safeParse(emitted[0]).success).toBe(false);
  });
});
