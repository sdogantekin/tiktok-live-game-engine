import type { NormalizedEvent, ProviderInfo, ProviderStatus } from '@live-game/contracts';
import type { ConnectionFactory, ConnectionHandlers, LiveConnection } from './connection';
import { type ConnectFailure, classifyFailure, FAILURE_MESSAGE, retryDelayMs } from './failures';
import { giftKeyLookup, type GiftMap } from './gift-map';
import { parseChat, parseGift } from './messages';
import { normalizeUsername } from './username';

export type TikTokResult = { ok: true } | { ok: false; reason: string };

export type TikTokState = 'idle' | 'connecting' | 'connected' | 'waiting' | 'failed' | 'stopped';

export interface TikTokProviderOptions {
  /** Delivers one normalized event to the engine (the only way this provider affects the game). */
  emit: (event: NormalizedEvent) => void;
  connect: ConnectionFactory;
  /** Whether the operator may start it at all (`TIKTOK_LIVE=on` on the server). Off by default. */
  enabled: boolean;
  giftMap?: GiftMap;
  now?: () => number;
  onChange?: () => void;
  /** Where technical details go (never a credential). */
  log?: (line: string) => void;
}

/**
 * Reads a creator's TikTok LIVE and hands comments and finished gifts to the engine as normalized events, exactly like the
 * simulator does. Read-only, one stream at a time, and always stoppable: `stop()` is the kill switch. While the stream is
 * offline or the connection fails it retries on its own, with a wait that depends on the reason, and tells the operator
 * in plain words what it is doing.
 */
export class TikTokProvider {
  private _state: TikTokState = 'idle';
  private message = 'Not connected.';
  private username: string | null = null;
  private connection: LiveConnection | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0; // bumps on every start/stop so a slow, stale connection attempt can do no harm
  private consecutiveFailures = 0;
  private lastFailureKind: string | null = null;
  private comments = 0;
  private gifts = 0;
  private readonly giftKeyFor;
  private readonly now: () => number;

  constructor(private readonly options: TikTokProviderOptions) {
    this.giftKeyFor = giftKeyLookup(options.giftMap);
    this.now = options.now ?? Date.now;
  }

  get state(): TikTokState {
    return this._state;
  }

  /** `connected` only while events can really flow. */
  get status(): ProviderStatus {
    return this._state === 'idle' ? 'none' : this._state === 'connected' ? 'connected' : 'disconnected';
  }

  /** True from `start` until `stop`, including while it waits to retry: the simulator must stay off for all of it. */
  get active(): boolean {
    return this._state === 'connecting' || this._state === 'connected' || this._state === 'waiting';
  }

  info(): ProviderInfo {
    return {
      kind: 'tiktok',
      state: this._state,
      message: this.message,
      ...(this.username ? { username: this.username } : {}),
      comments: this.comments,
      gifts: this.gifts,
    };
  }

  /** Whether `start(input)` would be accepted, without doing anything (so a caller can check before switching anything off). */
  canStart(input: string): TikTokResult {
    if (!this.options.enabled) return { ok: false, reason: 'tiktok_disabled' };
    return normalizeUsername(input) === null ? { ok: false, reason: 'invalid_username' } : { ok: true };
  }

  /** Starts reading `input` (a username, `@name` or a profile URL). Replaces any stream already being read. */
  start(input: string): TikTokResult {
    const allowed = this.canStart(input);
    if (!allowed.ok) return allowed;
    const username = normalizeUsername(input)!;

    this.cancel();
    this.username = username;
    this.comments = 0;
    this.gifts = 0;
    this.consecutiveFailures = 0;
    this.lastFailureKind = null;
    void this.attempt(this.generation);
    return { ok: true };
  }

  /** The kill switch: stops reading at once and cancels every retry. Safe to call at any time. */
  stop(): TikTokResult {
    const wasActive = this._state !== 'idle' && this._state !== 'stopped';
    this.cancel();
    if (wasActive) this.set('stopped', 'Stopped by the operator.');
    return { ok: true };
  }

  private cancel(): void {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const connection = this.connection;
    this.connection = null;
    if (connection) void connection.disconnect();
  }

  private set(state: TikTokState, message: string): void {
    this._state = state;
    this.message = message;
    this.options.onChange?.();
  }

  private async attempt(generation: number): Promise<void> {
    if (generation !== this.generation || this.username === null) return;
    this.set('connecting', `Connecting to @${this.username}…`);

    const handlers = this.handlersFor(generation);
    const connection = this.options.connect(this.username, handlers);
    this.connection = connection;
    try {
      await connection.connect();
    } catch (error) {
      if (generation !== this.generation) return; // stopped or replaced meanwhile
      this.connection = null;
      void connection.disconnect();
      this.failed(error);
      return;
    }
    if (generation !== this.generation) {
      void connection.disconnect();
      return;
    }
    this.consecutiveFailures = 0;
    this.lastFailureKind = null;
    this.set('connected', `Reading @${this.username}.`);
    this.options.log?.(`[tiktok] connected to @${this.username}`);
  }

  private failed(error: unknown): void {
    this.failedWith(classifyFailure(error));
  }

  private failedWith(failure: ConnectFailure): void {
    this.options.log?.(`[tiktok] ${failure.kind}: ${failure.detail}`);
    this.consecutiveFailures = failure.kind === this.lastFailureKind ? this.consecutiveFailures + 1 : 1;
    this.lastFailureKind = failure.kind;

    const delay = retryDelayMs(failure, this.consecutiveFailures);
    if (delay === null) {
      this.set('failed', FAILURE_MESSAGE[failure.kind]);
      return;
    }
    this.set('waiting', `${FAILURE_MESSAGE[failure.kind]} Next try in ${Math.round(delay / 1000)} s.`);
    const generation = this.generation;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.attempt(generation);
    }, delay);
  }

  /** The connection dropped or the stream ended while we were reading: wait, then look for the stream again. */
  private lost(generation: number, note: string, kind: 'offline' | 'network'): void {
    if (generation !== this.generation || this._state !== 'connected') return;
    const connection = this.connection;
    this.connection = null;
    if (connection) void connection.disconnect();
    this.options.log?.(`[tiktok] ${note}`);
    this.failedWith({ kind, detail: note });
  }

  private handlersFor(generation: number): ConnectionHandlers {
    const live = () => generation === this.generation && this._state !== 'stopped';
    return {
      onChat: (raw) => {
        if (!live()) return;
        const event = parseChat(raw, this.now());
        if (!event) return;
        this.comments++;
        this.options.emit(event);
      },
      onGift: (raw) => {
        if (!live()) return;
        const event = parseGift(raw, this.now(), this.giftKeyFor);
        if (!event) return;
        this.gifts++;
        this.options.emit(event);
      },
      onDisconnected: () => this.lost(generation, 'The connection to TikTok closed.', 'network'),
      onStreamEnd: () => this.lost(generation, 'The stream ended.', 'offline'),
      onError: (error) => this.options.log?.(`[tiktok] connection error: ${classifyFailure(error).detail}`),
    };
  }
}
