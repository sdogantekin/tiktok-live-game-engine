import { afterEach, describe, expect, it } from 'vitest';
import { handleOperatorMessage } from '../src/operator/commands';
import { classifyLibraryError, createLibraryConnectionFactory, type ConnectionHandlers, type LiveConnection } from '../src/providers/tiktok/connection';
import { createGameServer, type GameServer } from '../src/realtime/socket-server';
import { createMahalleHalayiMode } from '../src/game-modes/mahalle-halayi/rules';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function fakeConnections() {
  const list: { username: string; handlers: ConnectionHandlers; ok: () => void; fail: (e: unknown) => void; closed: boolean }[] = [];
  const connect = (username: string, handlers: ConnectionHandlers): LiveConnection => {
    let ok!: () => void;
    let fail!: (e: unknown) => void;
    const promise = new Promise<void>((resolve, reject) => {
      ok = resolve;
      fail = reject;
    });
    const record = { username, handlers, ok: () => ok(), fail: (e: unknown) => fail(e), closed: false };
    list.push(record);
    return { connect: () => promise, disconnect: async () => void (record.closed = true) };
  };
  return { connect, list, last: () => list[list.length - 1]! };
}

describe('TikTok provider wired into the server', () => {
  let server: GameServer | null = null;
  afterEach(async () => {
    await server?.close();
    server = null;
  });
  const start = (enabled: boolean) => {
    const fake = fakeConnections();
    server = createGameServer({ mode: createMahalleHalayiMode(), operatorToken: 'test-token-123', tiktok: { enabled, connect: fake.connect } });
    const send = (raw: unknown) => handleOperatorMessage(raw, { engine: server!.engine, hub: server!.hub });
    return { fake, send, hud: () => server!.engine.state.hud(), engine: server!.engine };
  };

  it('starts on the simulator and refuses TikTok unless the server was started with it on', () => {
    const { send, hud, fake } = start(false);
    expect(hud()).toMatchObject({ providerStatus: 'connected', providerInfo: { kind: 'simulator', state: 'connected' } });
    expect(send({ type: 'tiktok_connect', username: 'halay.kanali' })).toEqual({ ok: false, reason: 'tiktok_disabled' });
    expect(hud().providerInfo?.kind).toBe('simulator'); // nothing changed
    expect(send({ type: 'sim_add_viewers', count: 1 }).ok).toBe(true); // and the simulator still works
    expect(fake.list).toHaveLength(0);
  });

  it('a typo does not switch the simulator off; a good username does, and one provider is in charge', async () => {
    const { send, hud, fake } = start(true);
    expect(send({ type: 'tiktok_connect', username: 'Halay Kanalı' })).toEqual({ ok: false, reason: 'invalid_username' });
    expect(hud().providerInfo?.kind).toBe('simulator');

    expect(send({ type: 'tiktok_connect', username: 'https://www.tiktok.com/@halay.kanali' })).toEqual({ ok: true });
    await tick();
    expect(hud()).toMatchObject({ providerStatus: 'disconnected', providerInfo: { kind: 'tiktok', state: 'connecting', username: 'halay.kanali' } });
    expect(send({ type: 'sim_add_viewers', count: 5 })).toEqual({ ok: false, reason: 'tiktok_active' }); // never mixed
    expect(send({ type: 'sim_connect' })).toEqual({ ok: false, reason: 'tiktok_active' });

    fake.last().ok();
    await tick();
    expect(hud()).toMatchObject({ providerStatus: 'connected', providerInfo: { kind: 'tiktok', state: 'connected', username: 'halay.kanali' } });
  });

  it('real comments become players and are not duplicated, gifts reach the engine, and counters show on the HUD', async () => {
    const { send, hud, fake, engine } = start(true);
    send({ type: 'tiktok_connect', username: 'halay.kanali' });
    await tick();
    fake.last().ok();
    await tick();

    const chat = (msgId: string, id: string, content: string) => ({ common: { msgId }, user: { id, nickname: `Viewer ${id}` }, content });
    fake.last().handlers.onChat(chat('m1', '100', 'gelin'));
    fake.last().handlers.onChat(chat('m2', '101', 'damat'));
    fake.last().handlers.onChat(chat('m1', '100', 'gelin')); // the same message again (a replay)
    await tick();
    await tick();

    expect(engine.state.players.get('tiktok:100')).toMatchObject({ teamId: 'gelin', name: 'Viewer 100' });
    expect(engine.state.players.get('tiktok:101')).toMatchObject({ teamId: 'damat' });
    expect(engine.state.players.count).toBe(2);

    const gift = { common: { msgId: 'g1' }, user: { id: '100', nickname: 'Viewer 100' }, giftId: '1', groupId: 'g', repeatCount: 1, repeatEnd: 1, gift: { type: 2, name: 'Rose', diamondCount: 1 } };
    fake.last().handlers.onGift(gift);
    await tick();
    expect(engine.stats.invalid).toBe(0);
    expect(hud().providerInfo).toMatchObject({ comments: 3, gifts: 1 });
  });

  it('the operator can stop it at once; the simulator may then be switched back on', async () => {
    const { send, hud, fake } = start(true);
    send({ type: 'tiktok_connect', username: 'halay.kanali' });
    await tick();
    fake.last().ok();
    await tick();

    expect(send({ type: 'tiktok_disconnect' })).toEqual({ ok: true });
    expect(fake.last().closed).toBe(true);
    expect(hud()).toMatchObject({ providerStatus: 'disconnected', providerInfo: { kind: 'tiktok', state: 'stopped' } });
    fake.last().handlers.onChat({ common: { msgId: 'late' }, user: { id: '9' }, content: 'gelin' }); // in flight when stopped
    await tick();
    expect(server!.engine.state.players.count).toBe(0);

    expect(send({ type: 'sim_connect' })).toEqual({ ok: true });
    expect(hud()).toMatchObject({ providerStatus: 'connected', providerInfo: { kind: 'simulator', state: 'connected' } });
  });

  it('shows the operator why it is waiting, in plain words', async () => {
    const { send, hud, fake } = start(true);
    send({ type: 'tiktok_connect', username: 'halay.kanali' });
    await tick();
    fake.last().fail(new Error('The user is currently offline'));
    await tick();
    expect(hud().providerInfo).toMatchObject({ kind: 'tiktok', state: 'waiting' });
    expect(hud().providerInfo?.message).toMatch(/not live/i);
    expect(hud().providerStatus).toBe('disconnected'); // the broadcast shows its "no comment connection" banner
  });

  it('rejects malformed TikTok commands without touching anything', () => {
    const { send, hud } = start(true);
    for (const bad of [{ type: 'tiktok_connect' }, { type: 'tiktok_connect', username: 42 }, { type: 'tiktok_connect', username: '' }, { type: 'tiktok_connect', username: 'x'.repeat(500) }]) {
      expect(send(bad).ok).toBe(false);
    }
    expect(hud().providerInfo?.kind).toBe('simulator');
  });
});

describe('the pinned connector library', () => {
  it('exports everything the adapter relies on (guards against a version change)', async () => {
    const lib = await import('tiktok-live-connector');
    expect(typeof lib.TikTokLiveConnection).toBe('function');
    expect(lib.WebcastEvent.CHAT).toBe('chat');
    expect(lib.WebcastEvent.GIFT).toBe('gift');
    expect(lib.WebcastEvent.STREAM_END).toBe('streamEnd');
    expect(lib.ControlEvent.DISCONNECTED).toBe('disconnected');
    expect(lib.ControlEvent.ERROR).toBe('error');
    for (const name of ['UserOfflineError', 'InvalidUniqueIdError', 'SignatureRateLimitError', 'SignAPIError', 'ConnectTimeoutError'] as const) expect(typeof lib[name], name).toBe('function');
  });

  it('classifies the library\'s own errors by class, the reliable way', async () => {
    const lib = await import('tiktok-live-connector');
    const make = (Class: { prototype: object }, extra: object = {}) => Object.assign(Object.create(Class.prototype), { message: 'x', ...extra });
    expect(classifyLibraryError(make(lib.UserOfflineError), lib).kind).toBe('offline');
    expect(classifyLibraryError(make(lib.InvalidUniqueIdError), lib).kind).toBe('invalid_username');
    expect(classifyLibraryError(make(lib.SignatureRateLimitError, { retryAfter: 12_000 }), lib)).toMatchObject({ kind: 'rate_limited', retryAfterMs: 12_000 });
    expect(classifyLibraryError(make(lib.SignAPIError, { reason: 'Sign Error' }), lib).kind).toBe('signing');
    expect(classifyLibraryError(make(lib.ConnectTimeoutError), lib).kind).toBe('timeout');
    expect(classifyLibraryError(new Error('getaddrinfo ENOTFOUND'), lib).kind).toBe('network');
  });

  it('the adapter does nothing until connect(), and closing a never-opened connection is harmless', async () => {
    const connection = createLibraryConnectionFactory({ signApiKey: 'never-logged-secret' })('halay.kanali', {
      onChat: () => undefined,
      onGift: () => undefined,
      onLike: () => undefined,
      onDisconnected: () => undefined,
      onStreamEnd: () => undefined,
      onError: () => undefined,
    });
    await expect(connection.disconnect()).resolves.toBeUndefined();
  });
});
