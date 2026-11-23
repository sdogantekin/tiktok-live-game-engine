import { NormalizedEventSchema, type NormalizedEvent } from '@live-game/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionHandlers, LiveConnection } from '../src/providers/tiktok/connection';
import { ConnectFailureError, classifyFailure, redactSecrets, retryDelayMs } from '../src/providers/tiktok/failures';
import { TikTokProvider, type TikTokProviderOptions } from '../src/providers/tiktok/provider';

describe('failure classification and retry delays', () => {
  it('names each kind of failure from the error alone', () => {
    const named = (name: string, message: string) => Object.assign(new Error(message), { constructor: { name } });
    expect(classifyFailure(named('UserOfflineError', 'User is not live')).kind).toBe('offline');
    expect(classifyFailure(new Error('The user is currently offline')).kind).toBe('offline');
    expect(classifyFailure(named('InvalidUniqueIdError', 'bad id')).kind).toBe('invalid_username');
    expect(classifyFailure(Object.assign(new Error('Rate Limited'), { retryAfter: 42_000 }))).toMatchObject({ kind: 'rate_limited', retryAfterMs: 42_000 });
    expect(classifyFailure(new Error('Sign API error from the signing service')).kind).toBe('signing');
    expect(classifyFailure(new Error('connect ETIMEDOUT 1.2.3.4:443')).kind).toBe('timeout');
    expect(classifyFailure(new Error('Request failed with 403 Forbidden')).kind).toBe('blocked');
    expect(classifyFailure(new Error('getaddrinfo ENOTFOUND www.tiktok.com')).kind).toBe('network');
    expect(classifyFailure(new Error('something odd')).kind).toBe('unknown');
    expect(classifyFailure('a string, not an error').kind).toBe('unknown');
    expect(classifyFailure(undefined).kind).toBe('unknown');
  });

  it('trusts an already classified failure', () => {
    expect(classifyFailure(new ConnectFailureError({ kind: 'blocked', detail: 'x' })).kind).toBe('blocked');
  });

  it('removes keys, tokens and sessions from anything that could reach a log or the operator screen', () => {
    expect(redactSecrets('GET https://sign.example/v1?apiKey=SECRET123&uniqueId=abc failed')).toBe('GET https://sign.example/v1?apiKey=[redacted]&uniqueId=abc failed');
    expect(redactSecrets('headers: {"x-api-key": "SECRET123", "accept": "json"}')).not.toContain('SECRET123');
    expect(redactSecrets('Cookie: sessionid=abcdef123456; other=1')).not.toContain('abcdef123456');
    expect(redactSecrets('Authorization: Bearer SECRETTOKEN')).not.toContain('SECRETTOKEN');
    expect(classifyFailure(new Error('request to https://x/y?signApiKey=SECRET123 failed with 403')).detail).not.toContain('SECRET123');
    expect(redactSecrets('plain message with no secrets')).toBe('plain message with no secrets');
  });

  it('never leaks anything but a short, bounded detail', () => {
    expect(classifyFailure(new Error('x'.repeat(5000))).detail.length).toBeLessThanOrEqual(200);
  });

  it('waits by reason: steady while offline, doubling with a cap for other failures, never for a bad username', () => {
    const d = (kind: Parameters<typeof retryDelayMs>[0]['kind'], n: number, retryAfterMs?: number) => retryDelayMs({ kind, detail: '', retryAfterMs }, n);
    expect([1, 2, 3].map((n) => d('offline', n))).toEqual([30_000, 30_000, 30_000]);
    expect([1, 2, 3, 4, 5, 6].map((n) => d('network', n))).toEqual([10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
    expect(d('blocked', 1)).toBe(120_000);
    expect(d('blocked', 10)).toBe(600_000);
    expect(d('rate_limited', 1, 150_000)).toBe(150_000); // the service's own request wins when it is longer
    expect(d('rate_limited', 1, 5_000)).toBe(60_000);
    expect(d('invalid_username', 1)).toBeNull();
  });
});

/** A stand-in for a TikTok connection that the test controls: it succeeds or fails when told, and records its fate. */
function fakeConnections() {
  const connections: { username: string; handlers: ConnectionHandlers; resolve(): void; reject(error: unknown): void; disconnected: boolean }[] = [];
  const factory: TikTokProviderOptions['connect'] = (username, handlers) => {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const record = { username, handlers, resolve: () => resolve(), reject: (e: unknown) => reject(e), disconnected: false };
    connections.push(record);
    const connection: LiveConnection = {
      connect: () => promise,
      disconnect: async () => {
        record.disconnected = true;
      },
    };
    return connection;
  };
  return { factory, connections, last: () => connections[connections.length - 1]! };
}

const message = (text: string) => ({ common: { msgId: `m-${text}-${Math.random()}` }, user: { id: '7', nickname: 'Can' }, content: text });
const rose = (msgId: string) => ({ common: { msgId }, user: { id: '7', nickname: 'Can' }, giftId: '1', groupId: 'g', repeatCount: 1, repeatEnd: 1, gift: { type: 2, name: 'Rose', diamondCount: 1 } });
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('TikTokProvider', () => {
  let events: NormalizedEvent[];
  let changes: number;
  let logs: string[];
  let conn: ReturnType<typeof fakeConnections>;
  const make = (over: Partial<TikTokProviderOptions> = {}) =>
    new TikTokProvider({ enabled: true, connect: conn.factory, emit: (e) => events.push(e), onChange: () => changes++, log: (l) => logs.push(l), now: () => 1000, ...over });

  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    changes = 0;
    logs = [];
    conn = fakeConnections();
  });
  afterEach(() => vi.useRealTimers());

  it('is off unless enabled, and rejects a username that cannot exist before doing anything', () => {
    expect(make({ enabled: false }).start('halay.kanali')).toEqual({ ok: false, reason: 'tiktok_disabled' });
    const provider = make();
    expect(provider.start('Halay Kanalı')).toEqual({ ok: false, reason: 'invalid_username' });
    expect(conn.connections).toHaveLength(0);
    expect(provider.state).toBe('idle');
  });

  it('connects, reports connected only once events can flow, and hands comments and finished gifts to the engine', async () => {
    const provider = make();
    expect(provider.start('@halay.kanali')).toEqual({ ok: true });
    await flush();
    expect(provider.state).toBe('connecting');
    expect(provider.status).toBe('disconnected');
    expect(conn.last().username).toBe('halay.kanali');

    conn.last().resolve();
    await flush();
    expect(provider.state).toBe('connected');
    expect(provider.status).toBe('connected');
    expect(provider.info()).toMatchObject({ kind: 'tiktok', state: 'connected', username: 'halay.kanali', comments: 0, gifts: 0 });

    conn.last().handlers.onChat(message('gelin'));
    conn.last().handlers.onGift(rose('g1'));
    conn.last().handlers.onChat({ not: 'a chat' }); // unusable: dropped
    expect(events.map((e) => e.kind)).toEqual(['comment.received', 'gift.received']);
    for (const event of events) expect(NormalizedEventSchema.safeParse(event).success).toBe(true);
    expect(provider.info()).toMatchObject({ comments: 1, gifts: 1 });
  });

  it('keeps retrying while the creator is offline, steadily, and connects when the stream starts', async () => {
    const provider = make();
    provider.start('halay.kanali');
    await flush();
    conn.last().reject(new Error('The user is currently offline'));
    await flush();
    expect(provider.state).toBe('waiting');
    expect(provider.info().message).toMatch(/not live/i);
    expect(provider.info().message).toMatch(/30 s/);
    expect(provider.active).toBe(true); // the simulator must stay off while it waits

    await vi.advanceTimersByTimeAsync(29_000);
    expect(conn.connections).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(conn.connections).toHaveLength(2);
    conn.last().reject(new Error('The user is currently offline'));
    await flush();
    await vi.advanceTimersByTimeAsync(30_500); // still 30 s, not growing
    expect(conn.connections).toHaveLength(3);
    conn.last().resolve();
    await flush();
    expect(provider.state).toBe('connected');
  });

  it('does not retry a username TikTok does not know, and says so in plain words', async () => {
    const provider = make();
    provider.start('nobody.here');
    await flush();
    conn.last().reject(new ConnectFailureError({ kind: 'invalid_username', detail: 'x' }));
    await flush();
    expect(provider.state).toBe('failed');
    expect(provider.info().message).toMatch(/username/i);
    expect(provider.active).toBe(false);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(conn.connections).toHaveLength(1);
  });

  it('backs off for other failures, honours the service\'s retry-after, and starts over after a success', async () => {
    const provider = make();
    provider.start('halay.kanali');
    await flush();
    conn.last().reject(new Error('getaddrinfo ENOTFOUND www.tiktok.com'));
    await flush();
    expect(provider.info().message).toMatch(/10 s/);
    await vi.advanceTimersByTimeAsync(10_100);
    conn.last().reject(new Error('getaddrinfo ENOTFOUND www.tiktok.com'));
    await flush();
    expect(provider.info().message).toMatch(/20 s/); // doubled
    await vi.advanceTimersByTimeAsync(20_100);
    conn.last().reject(Object.assign(new Error('Rate Limited'), { retryAfter: 90_000 }));
    await flush();
    expect(provider.info().message).toMatch(/90 s/);
    await vi.advanceTimersByTimeAsync(90_100);
    conn.last().resolve();
    await flush();
    expect(provider.state).toBe('connected');

    conn.last().handlers.onDisconnected(); // a drop after a success starts the schedule from the beginning
    expect(provider.state).toBe('waiting');
    expect(provider.info().message).toMatch(/10 s/);
  });

  it('retries after the connection drops or the stream ends, and tells the two apart', async () => {
    const provider = make();
    provider.start('halay.kanali');
    await flush();
    conn.last().resolve();
    await flush();
    const first = conn.last();
    first.handlers.onStreamEnd();
    first.handlers.onDisconnected(); // the second signal for the same loss changes nothing
    expect(provider.state).toBe('waiting');
    expect(provider.status).toBe('disconnected');
    expect(provider.info().message).toMatch(/not live|waiting/i);
    expect(first.disconnected).toBe(true);
    await vi.advanceTimersByTimeAsync(30_500);
    expect(conn.connections).toHaveLength(2);
    conn.last().resolve();
    await flush();
    conn.last().handlers.onDisconnected();
    expect(provider.info().message).toMatch(/internet|reached/i);
  });

  it('is stoppable at any moment, and a stopped provider does nothing more', async () => {
    const provider = make();
    provider.start('halay.kanali');
    await flush();
    conn.last().resolve();
    await flush();
    const open = conn.last();

    expect(provider.stop()).toEqual({ ok: true });
    expect(provider.state).toBe('stopped');
    expect(provider.active).toBe(false);
    expect(open.disconnected).toBe(true);
    open.handlers.onChat(message('late')); // an event that was already on its way
    expect(events).toHaveLength(0);

    // Stopping while waiting to retry cancels the retry.
    const waiting = make();
    waiting.start('halay.kanali');
    await flush();
    conn.last().reject(new Error('The user is currently offline'));
    await flush();
    waiting.stop();
    const attempts = conn.connections.length;
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(conn.connections).toHaveLength(attempts);

    // Stopping while still connecting: a slow connection that succeeds afterwards must not bring it back to life.
    const slow = make();
    slow.start('halay.kanali');
    await flush();
    const pending = conn.last();
    slow.stop();
    pending.resolve();
    await flush();
    expect(slow.state).toBe('stopped');
    expect(pending.disconnected).toBe(true);
  });

  it('switching to another stream closes the first and ignores anything still arriving from it', async () => {
    const provider = make();
    provider.start('first.stream');
    await flush();
    conn.last().resolve();
    await flush();
    const first = conn.last();

    provider.start('second.stream');
    await flush();
    expect(first.disconnected).toBe(true);
    first.handlers.onChat(message('from the old stream'));
    expect(events).toHaveLength(0);
    conn.last().resolve();
    await flush();
    conn.last().handlers.onChat(message('gelin'));
    expect(events).toHaveLength(1);
    expect(provider.info()).toMatchObject({ username: 'second.stream', comments: 1 });
  });

  it('logs what happened without ever putting a username-less secret in the log', async () => {
    const provider = make();
    provider.start('halay.kanali');
    await flush();
    conn.last().reject(new Error('Sign API error'));
    await flush();
    expect(logs.join('\n')).toMatch(/signing/);
    expect(changes).toBeGreaterThan(0); // the hub is told about every change
  });
});
