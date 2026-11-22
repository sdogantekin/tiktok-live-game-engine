import { createServer } from 'node:http';
import { Server } from 'socket.io';
import {
  HelloSchema,
  type PresentationEvent,
  SOCKET_EVENTS,
  SOCKET_NAMESPACES,
  type SocketNamespace,
} from '@live-game/contracts';
import { type Clock, systemClock } from '../core/clock';
import { GameEngine } from '../core/engine';
import type { GameMode } from '../core/mode';
import { isValidOperatorToken } from '../operator/auth';
import { handleOperatorMessage } from '../operator/commands';
import { SimulatorProvider, type SimulatorProviderOptions } from '../providers/simulator/provider';
import { Histogram } from '../core/metrics';
import { Publisher } from './publisher';

export interface GameServerOptions {
  mode: GameMode;
  operatorToken: string;
  clock?: Clock;
  /** Engine tick and presentation flush interval. */
  heartbeatMs?: number;
  /** Minimum interval between HUD/roster publications (≈ 10 Hz by default). */
  stateMs?: number;
  maxActionsPerBatch?: number;
  simulator?: Pick<SimulatorProviderOptions, 'seed' | 'joinSpreadMs'>;
  onError?: (error: unknown) => void;
}

/** Operator commands are tiny; refuse anything larger than this per message. */
const MAX_MESSAGE_BYTES = 64 * 1024;

export function createGameServer(options: GameServerOptions) {
  const clock = options.clock ?? systemClock;
  const heartbeatMs = options.heartbeatMs ?? 50;
  const stateMs = options.stateMs ?? 100;
  const onError = options.onError ?? ((error: unknown) => console.error('[server]', error));

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404).end();
  });
  const io = new Server(http, { maxHttpBufferSize: MAX_MESSAGE_BYTES });
  const broadcast = io.of(SOCKET_NAMESPACES.broadcast);
  const operator = io.of(SOCKET_NAMESPACES.operator);

  // The engine and publisher reference each other; this indirection breaks the construction cycle.
  const cues: { forward?: (event: PresentationEvent, ingestedAt: number) => void } = {};
  const engine = new GameEngine({
    mode: options.mode,
    clock,
    onPresentation: (event, meta) => cues.forward?.(event, meta.ingestedAt),
    onError,
  });
  const publisher = new Publisher({
    engine,
    maxActionsPerBatch: options.maxActionsPerBatch,
    send: (event, payload) => {
      broadcast.emit(event, payload);
      operator.emit(event, payload); // only authenticated sockets ever join this namespace
    },
  });
  cues.forward = (event, ingestedAt) => publisher.onPresentation(event, ingestedAt);

  // Provider events are queued immediately and drained once per macrotask, so a burst is one drain pass.
  let drainScheduled = false;
  const simulator = new SimulatorProvider({
    ...options.simulator,
    now: () => clock.now(),
    emit: (raw) => {
      engine.ingest(raw);
      if (!drainScheduled) {
        drainScheduled = true;
        setImmediate(() => {
          drainScheduled = false;
          engine.drain();
        });
      }
    },
    onStatusChange: (status) => engine.state.setProviderStatus(status),
  });
  engine.state.setProviderStatus(simulator.status);

  const greet = (socket: { emit: (event: string, payload: unknown) => void }, namespace: SocketNamespace) => {
    socket.emit(SOCKET_EVENTS.hello, HelloSchema.parse({ status: 'ok', namespace, serverTime: clock.now() }));
    socket.emit(SOCKET_EVENTS.snapshot, engine.snapshot()); // fresh authoritative state on every (re)connect
  };

  // Broadcast is strictly read-only: any client-to-server message ends the connection.
  broadcast.on('connection', (socket) => {
    socket.onAny(() => socket.disconnect(true));
    greet(socket, SOCKET_NAMESPACES.broadcast);
  });

  operator.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    next(isValidOperatorToken(token, options.operatorToken) ? undefined : new Error('unauthorized'));
  });
  operator.on('connection', (socket) => {
    socket.on(SOCKET_EVENTS.operatorCommand, (raw: unknown, ack?: unknown) => {
      const result = handleOperatorMessage(raw, { engine, simulator });
      if (typeof ack === 'function') ack(result);
    });
    greet(socket, SOCKET_NAMESPACES.operator);
  });

  // How long each heartbeat's work takes (ms); read by the load test.
  const metrics = { tickMs: new Histogram(), flushMs: new Histogram(), publishMs: new Histogram() };

  let lastStatePublish = 0;
  const heartbeat = setInterval(() => {
    try {
      let t = performance.now();
      engine.tick();
      metrics.tickMs.record(performance.now() - t);
      t = performance.now();
      publisher.flushPresentation();
      metrics.flushMs.record(performance.now() - t);
      const now = clock.now();
      if (now - lastStatePublish >= stateMs) {
        lastStatePublish = now;
        t = performance.now();
        publisher.publishState();
        metrics.publishMs.record(performance.now() - t);
      }
    } catch (error) {
      onError(error);
    }
  }, heartbeatMs);

  return {
    http,
    io,
    engine,
    simulator,
    metrics,
    async close() {
      clearInterval(heartbeat);
      simulator.stop();
      await io.close();
    },
  };
}

export type GameServer = ReturnType<typeof createGameServer>;
