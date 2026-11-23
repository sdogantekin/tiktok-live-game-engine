import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type OperatorAck,
  PresentationBatchSchema,
  PublicSnapshotSchema,
  RosterDeltaSchema,
  SOCKET_EVENTS,
  SOCKET_NAMESPACES,
} from '@live-game/contracts';
import { mahalleHalayiConfig } from '../src/game-modes/mahalle-halayi/config';
import { createMahalleHalayiMode } from '../src/game-modes/mahalle-halayi/rules';
import { createGameServer, type GameServer, type GameServerOptions } from '../src/realtime/socket-server';

const TOKEN = 'integration-test-token';

interface Message {
  event: string;
  payload: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** A socket.io client that records everything it receives. */
class TestClient {
  readonly messages: Message[] = [];
  constructor(readonly socket: Socket) {
    socket.onAny((event: string, payload: unknown) => this.messages.push({ event, payload }));
  }

  of(event: string): Message['payload'][] {
    return this.messages.filter((m) => m.event === event).map((m) => m.payload);
  }

  async waitFor(event: string, predicate: (payload: Message['payload']) => boolean = () => true, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.of(event).find(predicate);
      if (found !== undefined) return found;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`Timed out waiting for "${event}"; saw: ${this.messages.map((m) => m.event).join(', ')}`);
  }

  command(payload: unknown): Promise<OperatorAck> {
    return this.socket.timeout(2000).emitWithAck(SOCKET_EVENTS.operatorCommand, payload);
  }

  async waitUntil(condition: () => boolean, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
    if (!condition()) throw new Error('Timed out waiting for condition');
  }

  async untilDisconnected(timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    while (this.socket.connected && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
    return !this.socket.connected;
  }
}

describe('realtime server', () => {
  const servers: GameServer[] = [];
  const clients: TestClient[] = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) client.socket.close();
    for (const server of servers.splice(0)) await server.close();
  });

  async function start(overrides: Partial<GameServerOptions> = {}) {
    const server = createGameServer({
      mode: createMahalleHalayiMode(),
      operatorToken: TOKEN,
      heartbeatMs: 10,
      stateMs: 20,
      simulator: { seed: 1, joinSpreadMs: 30 },
      onError: (error) => {
        throw error;
      },
      ...overrides,
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;

    const connect = (namespace: string, auth?: Record<string, unknown>) => {
      const client = new TestClient(io(`${url}${namespace}`, { auth, transports: ['websocket'], reconnection: false }));
      clients.push(client);
      return client;
    };
    const viewer = async () => {
      const client = connect(SOCKET_NAMESPACES.broadcast);
      await client.waitFor(SOCKET_EVENTS.snapshot);
      return client;
    };
    const operator = async () => {
      const client = connect(SOCKET_NAMESPACES.operator, { token: TOKEN });
      await client.waitFor(SOCKET_EVENTS.snapshot);
      return client;
    };
    return { server, url, connect, viewer, operator };
  }

  it('greets a broadcast client with hello, then a valid full snapshot', async () => {
    const { viewer } = await start();
    const client = await viewer();
    expect(client.messages.map((m) => m.event).slice(0, 2)).toEqual([SOCKET_EVENTS.hello, SOCKET_EVENTS.snapshot]);

    const snapshot = PublicSnapshotSchema.parse(client.of(SOCKET_EVENTS.snapshot)[0]);
    expect(snapshot).toMatchObject({ phase: 'stopped', providerStatus: 'connected', players: [], lastResult: null });
    expect(snapshot.teams.map((t) => t.id)).toEqual(['gelin', 'damat']);
  });

  it('switching the game gives every client a fresh snapshot of the new game, and only while stopped', async () => {
    const other = () =>
      createMahalleHalayiMode({
        ...mahalleHalayiConfig,
        teams: [
          { id: 'a', name: 'A Tarafı' },
          { id: 'b', name: 'B Tarafı' },
        ],
        commands: { katıl: { droppable: false, behavior: { kind: 'join', teamId: 'a' } } },
        gifts: {},
      });
    const { viewer, operator } = await start({ modes: other });
    const watching = await viewer();
    const operating = await operator();
    const before = { viewer: watching.of(SOCKET_EVENTS.snapshot).length, operator: operating.of(SOCKET_EVENTS.snapshot).length };

    expect(await operating.command({ type: 'select_game', modeId: 'mahalle-halayi' })).toEqual({ ok: true });
    await watching.waitUntil(() => watching.of(SOCKET_EVENTS.snapshot).length > before.viewer);
    await operating.waitUntil(() => operating.of(SOCKET_EVENTS.snapshot).length > before.operator);
    for (const client of [watching, operating]) {
      const snapshot = PublicSnapshotSchema.parse(client.of(SOCKET_EVENTS.snapshot).at(-1));
      expect(snapshot.teams.map((team) => team.id)).toEqual(['a', 'b']);
      expect(snapshot.players).toEqual([]);
    }

    // Once a game runs, switching is refused and nothing is sent.
    expect(await operating.command({ type: 'start_game' })).toEqual({ ok: true });
    const seen = watching.of(SOCKET_EVENTS.snapshot).length;
    expect(await operating.command({ type: 'select_game', modeId: 'mahalle-halayi' })).toEqual({ ok: false, reason: 'game_running' });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(watching.of(SOCKET_EVENTS.snapshot)).toHaveLength(seen);
  });

  describe('operator authentication', () => {
    it.each([
      ['no token', undefined],
      ['a wrong token', { token: 'wrong-token' }],
      ['a non-string token', { token: 12345 }],
    ])('refuses a connection with %s', async (_name, auth) => {
      const { connect } = await start();
      const client = connect(SOCKET_NAMESPACES.operator, auth as Record<string, unknown> | undefined);
      await new Promise((resolve, reject) => {
        client.socket.on('connect_error', (error) => (error.message === 'unauthorized' ? resolve(null) : reject(error)));
        client.socket.on('connect', () => reject(new Error('connected without a valid token')));
      });
      expect(client.messages).toEqual([]); // never even received a snapshot
    });

    it('accepts the right token and acknowledges commands', async () => {
      const { operator } = await start();
      const client = await operator();
      expect(await client.command({ type: 'start_game' })).toEqual({ ok: true });
      expect(await client.command({ type: 'start_game' })).toEqual({ ok: false, reason: 'already_running' });
    });
  });

  describe('operator commands', () => {
    it('drive the game, and viewers see the result as HUD updates', async () => {
      const { operator, viewer } = await start();
      const [ops, watcher] = [await operator(), await viewer()];

      await ops.command({ type: 'start_game' });
      const countdown = await watcher.waitFor(SOCKET_EVENTS.hud, (hud) => hud.phase === 'countdown');
      expect(countdown).toMatchObject({ round: 1, remainingMs: null });
      expect(typeof countdown.phaseEndsAt).toBe('number');
      expect(countdown).not.toHaveProperty('players');

      await ops.command({ type: 'pause' });
      await watcher.waitFor(SOCKET_EVENTS.hud, (hud) => hud.paused === true && hud.phaseEndsAt === null);
      await ops.command({ type: 'resume' });
      await watcher.waitFor(SOCKET_EVENTS.hud, (hud) => hud.paused === false && hud.phaseEndsAt !== null);
    });

    it('reject invalid and unknown payloads without crashing the server', async () => {
      const { operator } = await start();
      const client = await operator();
      for (const bad of [null, 42, 'start_game', {}, { type: 'set_score', teamId: 'gelin', score: 99 }, { type: 'reassign_player' }]) {
        expect(await client.command(bad)).toEqual({ ok: false, reason: 'invalid_command' });
      }
      expect(await client.command({ type: 'start_game' })).toEqual({ ok: true }); // still healthy
    });

    it('cannot set scores or winners from the network', async () => {
      const { operator, server } = await start();
      const client = await operator();
      await client.command({ type: 'set_score', teamId: 'gelin', score: 999 });
      await client.command({ type: 'declare_winner', teamId: 'gelin' });
      expect(server.engine.snapshot().teams.every((t) => t.score === 0)).toBe(true);
    });

    it('disconnect a client that sends an oversized message', async () => {
      const { operator } = await start();
      const client = await operator();
      client.socket.emit(SOCKET_EVENTS.operatorCommand, { type: 'sim_comment', text: 'x'.repeat(200_000) });
      expect(await client.untilDisconnected()).toBe(true);
    });
  });

  describe('broadcast namespace is read-only', () => {
    it('drops any client that sends a message, and changes nothing', async () => {
      const { viewer, server } = await start();
      const client = await viewer();
      client.socket.emit(SOCKET_EVENTS.operatorCommand, { type: 'start_game' });
      expect(await client.untilDisconnected()).toBe(true);
      expect(server.engine.snapshot().phase).toBe('stopped');
    });
  });

  describe('simulator control through the operator namespace', () => {
    it('adds viewers who join teams, streaming roster deltas and updated team counts', async () => {
      const { operator, viewer } = await start();
      const [ops, watcher] = [await operator(), await viewer()];

      expect(await ops.command({ type: 'sim_add_viewers', count: 12 })).toEqual({ ok: true });
      const upserts = () => watcher.of(SOCKET_EVENTS.roster).flatMap((delta) => RosterDeltaSchema.parse(delta).upsert);
      await watcher.waitUntil(() => new Set(upserts().map((p) => p.id)).size === 12);
      await watcher.waitFor(SOCKET_EVENTS.hud, (hud) => hud.teams.reduce((n: number, t: { playerCount: number }) => n + t.playerCount, 0) === 12);

      expect(new Set(upserts().map((p) => p.id)).size).toBe(12);
      expect(upserts().every((p) => p.teamId === 'gelin' || p.teamId === 'damat')).toBe(true);
    });

    it('delivers presentation batches for viewer actions', async () => {
      const { operator, viewer } = await start();
      const [ops, watcher] = [await operator(), await viewer()];

      await ops.command({ type: 'sim_comment', viewerId: 'v1', text: 'gelin' });
      const batch = await watcher.waitFor(SOCKET_EVENTS.presentation, (b) => b.events.some((e: { type: string }) => e.type === 'player_joined'));
      expect(PresentationBatchSchema.parse(batch).events).toContainEqual({
        type: 'player_joined',
        playerId: 'simulator:v1',
        teamId: 'gelin',
      });

      await ops.command({ type: 'sim_comment', viewerId: 'v1', text: 'zıpla' });
      await watcher.waitFor(SOCKET_EVENTS.presentation, (b) => b.events.some((e: { animation?: string }) => e.animation === 'zipla'));
    });

    it('keeps gifts cosmetic end to end: celebrations play and scores do not move', async () => {
      const { operator, viewer, server } = await start();
      const [ops, watcher] = [await operator(), await viewer()];
      await ops.command({ type: 'start_game' });
      await ops.command({ type: 'start_round' });
      await ops.command({ type: 'sim_comment', viewerId: 'fan', text: 'damat' });
      await watcher.waitFor(SOCKET_EVENTS.hud, (hud) => hud.teams.some((t: { id: string; playerCount: number }) => t.id === 'damat' && t.playerCount === 1));

      await ops.command({ type: 'sim_gift', viewerId: 'fan', giftKey: 'big_celebration' });
      await watcher.waitFor(SOCKET_EVENTS.presentation, (b) => b.events.some((e: { effect?: string }) => e.effect === 'big_celebration'));
      expect(server.engine.snapshot().teams.every((t) => t.score === 0)).toBe(true);
    });

    it('reports provider outages and blocks provider commands until it reconnects', async () => {
      const { operator, viewer } = await start();
      const [ops, watcher] = [await operator(), await viewer()];

      await ops.command({ type: 'sim_disconnect' });
      await watcher.waitFor(SOCKET_EVENTS.hud, (hud) => hud.providerStatus === 'disconnected');
      expect(await ops.command({ type: 'sim_comment', viewerId: 'v', text: 'gelin' })).toEqual({
        ok: false,
        reason: 'provider_disconnected',
      });
      expect(await ops.command({ type: 'start_game' })).toEqual({ ok: true }); // the game itself keeps working

      await ops.command({ type: 'sim_connect' });
      await watcher.waitFor(SOCKET_EVENTS.hud, (hud) => hud.providerStatus === 'connected');
    });

    it('survives injected duplicates and malformed events', async () => {
      const { operator, server } = await start();
      const ops = await operator();
      await ops.command({ type: 'sim_comment', viewerId: 'v', text: 'gelin' });
      expect(await ops.command({ type: 'sim_inject', fault: 'duplicate' })).toEqual({ ok: true });
      expect(await ops.command({ type: 'sim_inject', fault: 'malformed' })).toEqual({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(server.engine.stats.duplicate).toBe(1);
      expect(server.engine.stats.invalid).toBe(1);
      expect(server.engine.stats.errors).toBe(0);
    });
  });

  describe('timer-driven rounds', () => {
    it('advance on their own and publish the result', async () => {
      const mode = createMahalleHalayiMode({
        ...mahalleHalayiConfig,
        timings: { countdownMs: 120, roundMs: 120, resultsMs: 120, autoNext: true },
      });
      const { operator, viewer } = await start({ mode });
      const [ops, watcher] = [await operator(), await viewer()];

      await ops.command({ type: 'start_game' });
      await watcher.waitFor(SOCKET_EVENTS.hud, (hud) => hud.phase === 'active');
      const results = await watcher.waitFor(SOCKET_EVENTS.hud, (hud) => hud.phase === 'results');
      expect(results.lastResult).toMatchObject({ round: 1, winner: null }); // nobody played: a draw
      await watcher.waitFor(SOCKET_EVENTS.hud, (hud) => hud.phase === 'countdown' && hud.round === 2);
    });
  });

  describe('reconnect', () => {
    it('sends a fresh, correct snapshot after a client reconnects', async () => {
      const { operator, viewer } = await start();
      const [ops, watcher] = [await operator(), await viewer()];
      expect(watcher.of(SOCKET_EVENTS.snapshot)).toHaveLength(1);

      watcher.socket.disconnect();
      await ops.command({ type: 'sim_comment', viewerId: 'while-away', text: 'damat' });
      await ops.command({ type: 'start_game' });

      watcher.socket.connect();
      const fresh = await watcher.waitFor(SOCKET_EVENTS.snapshot, (s) => s.phase === 'countdown');
      const snapshot = PublicSnapshotSchema.parse(fresh);
      expect(snapshot.players.map((p) => p.id)).toEqual(['simulator:while-away']);
      expect(watcher.of(SOCKET_EVENTS.snapshot)).toHaveLength(2);
    });
  });
});
