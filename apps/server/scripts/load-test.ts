/**
 * Headless load test for the game server: runs the simulator scenarios against a real server with real
 * Socket.IO clients and reports latency, queue, memory, event-loop and bandwidth numbers.
 *
 *   pnpm --filter @live-game/server load-test -- [--scenarios s1,s2,s3,s4,s5] [--seconds 60] [--heartbeat 50] [--json out.json]
 *
 * The load generator, the server and the clients share one Node process on purpose (no network, one machine),
 * so numbers include generator overhead and are, if anything, pessimistic for the server.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { AddressInfo } from 'node:net';
import { writeFileSync } from 'node:fs';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS, SOCKET_NAMESPACES } from '@live-game/contracts';
import { getGameMode } from '../src/game-modes/registry';
import { createGameServer, type GameServer } from '../src/realtime/socket-server';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};
const SECONDS = Number(option('seconds', '60'));
const HEARTBEAT = Number(option('heartbeat', '50'));
const SCENARIOS = option('scenarios', 's1,s2,s3,s4,s5').split(',');
const JSON_OUT = option('json', '');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ClientStats {
  bytes: Record<string, number>;
  messages: Record<string, number>;
  snapshotAt: number[];
}

async function connectClients(url: string, count: number) {
  const stats: ClientStats[] = [];
  const sockets = [];
  for (let i = 0; i < count; i++) {
    const s: ClientStats = { bytes: {}, messages: {}, snapshotAt: [] };
    const socket = io(`${url}${SOCKET_NAMESPACES.broadcast}`, { transports: ['websocket'], reconnection: false });
    socket.onAny((event: string, payload: unknown) => {
      s.bytes[event] = (s.bytes[event] ?? 0) + JSON.stringify(payload).length;
      s.messages[event] = (s.messages[event] ?? 0) + 1;
      if (event === SOCKET_EVENTS.snapshot) s.snapshotAt.push(Date.now());
    });
    await new Promise<void>((resolve, reject) => {
      socket.once(SOCKET_EVENTS.snapshot, () => resolve());
      socket.once('connect_error', reject);
    });
    stats.push(s);
    sockets.push(socket);
  }
  return { stats, sockets };
}

const mb = (bytes: number) => bytes / 1048576;
const r = (n: number, d = 2) => Number(n.toFixed(d));

async function run(name: string, body: (ctx: { server: GameServer; url: string; sockets: ReturnType<typeof io>[] }) => Promise<void>) {
  const server = createGameServer({
    mode: getGameMode('mahalle-halayi'),
    operatorToken: 'load-test-token',
    heartbeatMs: HEARTBEAT,
    stateMs: 100,
    simulator: { seed: 42, joinSpreadMs: 3000 },
    onError: (error) => console.error('[load-test] server error', error),
  });
  await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  const { stats, sockets } = await connectClients(url, 3);

  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const startedAt = Date.now();
  const cpuStart = process.cpuUsage();
  const memory = { rssStart: process.memoryUsage().rss, rssMax: 0, heapMax: 0 };
  const sampler = setInterval(() => {
    const m = process.memoryUsage();
    memory.rssMax = Math.max(memory.rssMax, m.rss);
    memory.heapMax = Math.max(memory.heapMax, m.heapUsed);
  }, 500);

  await body({ server, url, sockets });
  await sleep(300); // let queued work and the last batches go out

  clearInterval(sampler);
  loop.disable();
  const seconds = (Date.now() - startedAt) / 1000;
  const cpu = process.cpuUsage(cpuStart);
  const e = server.engine.stats;
  const result = {
    scenario: name,
    seconds: r(seconds, 1),
    events: { received: e.received, processed: e.processed, invalid: e.invalid, ignored: e.ignored, duplicate: e.duplicate, rateLimited: e.rateLimited, overflowDropped: e.overflowDropped, errors: e.errors, maxQueueDepth: e.maxQueueDepth },
    ingestToProcessedMs: server.engine.latency.summary(),
    heartbeatMs: { tick: server.metrics.tickMs.summary(), flush: server.metrics.flushMs.summary(), publish: server.metrics.publishMs.summary() },
    eventLoopDelayMs: { mean: r(loop.mean / 1e6), p95: r(loop.percentile(95) / 1e6), p99: r(loop.percentile(99) / 1e6), max: r(loop.max / 1e6) },
    memoryMB: { rssStart: r(mb(memory.rssStart), 0), rssMax: r(mb(memory.rssMax), 0), heapMax: r(mb(memory.heapMax), 0) },
    cpuPercentOfOneCore: r(((cpu.user + cpu.system) / 1000 / (seconds * 1000)) * 100, 1),
    perClient: {
      kilobytesPerSecond: r(Object.values(stats[0]!.bytes).reduce((a, b) => a + b, 0) / 1024 / seconds, 1),
      bytesByMessage: stats[0]!.bytes,
      messages: stats[0]!.messages,
    },
    players: server.engine.snapshot().players.length,
    /** Size of the full state snapshot a (re)connecting client receives. */
    snapshotKB: r(JSON.stringify(server.engine.snapshot()).length / 1024, 1),
  };
  for (const socket of sockets) socket.close();
  await server.close();
  return result;
}

const scenarios: Record<string, () => ReturnType<typeof run>> = {
  // 200 viewers join, then chat at ~25 events/s for SECONDS.
  s1: () =>
    run('S1 steady (200 viewers, ~25 ev/s)', async ({ server }) => {
      server.engine.operator({ type: 'start_game' });
      server.engine.operator({ type: 'start_round' });
      server.simulator.handle({ type: 'sim_scenario', name: 'steady', viewers: 200, durationMs: SECONDS * 1000 });
      await sleep(SECONDS * 1000 + 500);
    }),
  // 200 `halay` within 2 s, five times.
  s2: () =>
    run('S2 burst (200 halay in 2 s x5)', async ({ server }) => {
      server.engine.operator({ type: 'start_game' });
      server.engine.operator({ type: 'start_round' });
      server.simulator.handle({ type: 'sim_add_viewers', count: 200 });
      await sleep(4000);
      for (let i = 0; i < 5; i++) {
        server.simulator.handle({ type: 'sim_burst', text: 'halay', count: 200, spreadMs: 2000 });
        await sleep(8000);
      }
    }),
  // Duplicates, junk, oversized text, rapid repeats, invisible characters.
  s3: () =>
    run('S3 chaos (hostile traffic)', async ({ server }) => {
      server.engine.operator({ type: 'start_game' });
      server.engine.operator({ type: 'start_round' });
      server.simulator.handle({ type: 'sim_scenario', name: 'chaos', viewers: 100, durationMs: Math.min(SECONDS, 30) * 1000 });
      await sleep(Math.min(SECONDS, 30) * 1000 + 500);
    }),
  // 20 gifts in 5 s including three big celebrations.
  s4: () =>
    run('S4 gift storm (20 gifts in 5 s)', async ({ server }) => {
      server.engine.operator({ type: 'start_game' });
      server.engine.operator({ type: 'start_round' });
      server.simulator.handle({ type: 'sim_add_viewers', count: 100 });
      await sleep(4000);
      const gifts = ['rose', 'rose', 'rose', 'gg', 'rose', 'big_celebration', 'rose', 'gg', 'rose', 'rose', 'big_celebration', 'rose', 'rose', 'gg', 'rose', 'big_celebration', 'rose', 'rose', 'gg', 'rose'];
      for (const giftKey of gifts) {
        server.simulator.handle({ type: 'sim_gift', giftKey });
        await sleep(250);
      }
    }),
  // Three clients drop and come back in the middle of a busy round; each must get a fresh, correct snapshot.
  s5: () =>
    run('S5 reconnect (3 clients mid-round)', async ({ server, url, sockets }) => {
      server.engine.operator({ type: 'start_game' });
      server.engine.operator({ type: 'start_round' });
      server.simulator.handle({ type: 'sim_scenario', name: 'steady', viewers: 100, durationMs: 20_000 });
      await sleep(6000);

      const times: number[] = [];
      for (const socket of sockets) {
        socket.close();
        await sleep(200);
        const fresh = io(`${url}${SOCKET_NAMESPACES.broadcast}`, { transports: ['websocket'], reconnection: false });
        const t0 = Date.now();
        const snapshot = await new Promise<{ players: unknown[] }>((resolve) => fresh.once(SOCKET_EVENTS.snapshot, resolve));
        times.push(Date.now() - t0);
        const expected = server.engine.snapshot().players.length;
        if (Math.abs(snapshot.players.length - expected) > 5) console.error('[load-test] snapshot roster mismatch', snapshot.players.length, expected);
        fresh.close();
      }
      console.log(`  reconnect-to-snapshot ms: ${times.join(', ')}`);
      await sleep(8000);
    }),
};

const results = [];
for (const key of SCENARIOS) {
  const scenario = scenarios[key];
  if (!scenario) throw new Error(`Unknown scenario ${key}`);
  console.log(`\n=== ${key} ...`);
  const result = await scenario();
  results.push(result);
  console.log(JSON.stringify(result, null, 2));
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ seconds: SECONDS, heartbeatMs: HEARTBEAT, results }, null, 2));
process.exit(0);
