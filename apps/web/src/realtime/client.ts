import { io } from 'socket.io-client';
import {
  HudStateSchema,
  type LiveView,
  LiveViewSchema,
  type OperatorAck,
  OperatorAckSchema,
  type OperatorCommand,
  type PresentationBatch,
  PresentationBatchSchema,
  PublicSnapshotSchema,
  RosterDeltaSchema,
  SOCKET_EVENTS,
  type SimulatorCommand,
  type TikTokCommand,
  type SocketNamespace,
} from '@live-game/contracts';
import { createRealtimeStore, type RealtimeStore } from './store';

export interface RealtimeClient {
  store: RealtimeStore;
  /** Operator namespace only. Never rejects: failures come back as `{ ok: false }`. */
  send(command: OperatorCommand | SimulatorCommand | TikTokCommand): Promise<OperatorAck>;
  /** The live view of a game that simulates on the server, as it arrives (about ten a second during a race). */
  onLive(listener: (view: LiveView) => void): () => void;
  /** Raw presentation batches as they arrive, for the 3D scene (the store only keeps notable cues). */
  onPresentation(listener: (batch: PresentationBatch) => void): () => void;
  close(): void;
}

/** The operator token is passed in the URL fragment (`#token=…`), which browsers never send to a server. */
export function readOperatorToken(hash: string = window.location.hash): string | undefined {
  return new URLSearchParams(hash.slice(1)).get('token') || undefined;
}

/** Connects to one namespace and keeps a store in sync with the server's authoritative state. */
export function createRealtimeClient(options: { namespace: SocketNamespace; token?: string }): RealtimeClient {
  const store = createRealtimeStore();
  const state = () => store.getState();
  const socket = io(options.namespace, { auth: options.token ? { token: options.token } : undefined });

  socket.on('connect', () => state().setConnection('connected'));
  socket.on('disconnect', () => state().setConnection('disconnected'));
  socket.on('connect_error', (error) => state().setConnection(error.message === 'unauthorized' ? 'unauthorized' : 'disconnected'));

  // Messages are validated at the boundary; anything malformed is dropped rather than rendered.
  const listen = <T>(event: string, parse: (payload: unknown) => T | null, apply: (value: T) => void) => {
    socket.on(event, (payload: unknown) => {
      const value = parse(payload);
      if (value === null) console.warn(`[realtime] ignored malformed "${event}" message`);
      else apply(value);
    });
  };
  const parseWith =
    <T>(schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } }) =>
    (payload: unknown) => {
      const result = schema.safeParse(payload);
      return result.success ? result.data : null;
    };

  listen(SOCKET_EVENTS.snapshot, parseWith(PublicSnapshotSchema), (v) => state().applySnapshot(v));
  listen(SOCKET_EVENTS.hud, parseWith(HudStateSchema), (v) => state().applyHud(v));
  listen(SOCKET_EVENTS.roster, parseWith(RosterDeltaSchema), (v) => state().applyRoster(v));
  const batchListeners = new Set<(batch: PresentationBatch) => void>();
  listen(SOCKET_EVENTS.presentation, parseWith(PresentationBatchSchema), (v) => {
    state().applyPresentation(v);
    for (const listener of batchListeners) listener(v);
  });

  const liveListeners = new Set<(view: LiveView) => void>();
  listen(SOCKET_EVENTS.live, parseWith(LiveViewSchema), (v) => {
    for (const listener of liveListeners) listener(v);
  });

  return {
    store,
    async send(command) {
      try {
        const ack: unknown = await socket.timeout(3000).emitWithAck(SOCKET_EVENTS.operatorCommand, command);
        const parsed = OperatorAckSchema.safeParse(ack);
        return parsed.success ? parsed.data : { ok: false, reason: 'bad_response' };
      } catch {
        return { ok: false, reason: 'timeout' };
      }
    },
    onLive(listener) {
      liveListeners.add(listener);
      return () => {
        liveListeners.delete(listener);
      };
    },
    onPresentation(listener) {
      batchListeners.add(listener);
      return () => {
        batchListeners.delete(listener);
      };
    },
    close: () => {
      socket.close();
    },
  };
}
