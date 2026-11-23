import {
  type LiveView,
  type ModeId,
  NormalizedEventSchema,
  type OperatorCommand,
  OperatorCommandSchema,
  type PresentationEvent,
  type PublicSnapshot,
} from '@live-game/contracts';
import { type Clock, systemClock } from './clock';
import { type ChatVerdict, createChatFilter } from './events/chat-filter';
import { normalizeComment } from './events/comment-normalizer';
import { KeyedRateLimiter, type RateSpec, TokenBucket } from './events/rate-limit';
import { BLOCKLIST_TR } from '../moderation/blocklist-tr';
import { Histogram } from './metrics';
import { RecentIdCache } from './events/recent-ids';
import type { CommandConfig, GameMode, ModeContext, ModeEffect } from './mode';
import type { Player } from './players/player-service';
import type { TransitionResult } from './rounds/round-service';
import { GameState } from './state/game-state';

export interface EngineConfig {
  queueCapacity: number;
  dedupeCapacity: number;
  userRate: RateSpec;
  globalRate: RateSpec;
  maxPlayers?: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  queueCapacity: 1000,
  dedupeCapacity: 5000,
  userRate: { capacity: 3, perSecond: 3 },
  globalRate: { capacity: 100, perSecond: 100 },
};

export interface EngineOptions {
  mode: GameMode;
  clock?: Clock;
  config?: Partial<EngineConfig>;
  /**
   * Receives transient visual cues; best-effort, never required for state correctness. `ingestedAt` is the engine
   * clock time of the input that caused the cue, so latency to the screen can be measured end to end.
   */
  onPresentation?: (event: PresentationEvent, meta: { ingestedAt: number }) => void;
  /** Receives unexpected errors thrown while processing a single queued item. */
  onError?: (error: unknown) => void;
  /**
   * Builds a game mode by id, for the operator's `select_game`. The runtime supplies it (the core must not know the games);
   * without it, game selection is unavailable.
   */
  modes?: (id: ModeId) => GameMode;
  /** Called after the game was switched, so the runtime can send every client a fresh snapshot. */
  onModeChanged?: () => void;
}

/** Likes counted per viewer per second when a game does not say, and how many seconds of them one viewer may have waiting. */
const DEFAULT_LIKES_PER_SECOND = 20;
const LIKE_BUFFER_SECONDS = 2;
/** A step never advances the simulation by more than this, so a stalled process does not make a huge jump. */
const MAX_STEP_MS = 250;

export type IngestOutcome = 'queued' | 'invalid' | 'ignored' | 'duplicate' | 'rate_limited' | 'queue_full';
export type OperatorResult = TransitionResult;

export interface EngineStats {
  received: number;
  invalid: number;
  /** Chatter that is not a command, plus events from ignored players or a full session. */
  ignored: number;
  duplicate: number;
  rateLimited: number;
  /** Items shed because the queue was full. */
  overflowDropped: number;
  processed: number;
  cooldownBlocked: number;
  errors: number;
  maxQueueDepth: number;
  /** Gift scores dropped: the game did not opt in, or the sender was not a team member in a scoring round. */
  giftScoreRefused: number;
  /** Conversational comments handed to the screen / refused by moderation / refused by the chat rate limits. */
  chatShown: number;
  chatRejected: number;
  chatRateLimited: number;
  /** Likes handed to the game / likes dropped because the game does not use them, the viewer is unknown, or the buffer was full. */
  likesApplied: number;
  likesDropped: number;
}

type ViewerItem =
  | { type: 'comment'; playerId: string; displayName: string; command: string; droppable: boolean }
  | { type: 'gift'; playerId: string; giftKey: string; count: number; droppable: true }
  | { type: 'chat'; playerId: string; text: string; droppable: true };
type OperatorItem = { type: 'operator'; command: OperatorCommand; result?: OperatorResult; droppable: false };
type QueueItem = (ViewerItem | OperatorItem) & { ingestedAt: number; enqueuedPerf: number };

/**
 * Single serialized dispatch loop: validate → classify → dedupe → rate-limit → bounded queue →
 * game mode → authoritative state. Viewer events and operator commands share one queue so their
 * relative order is deterministic. Call `drain()` after `ingest()` (or let the runtime schedule it).
 */
export class GameEngine {
  private _state!: GameState;
  private mode!: GameMode;
  private readonly clock: Clock;
  private readonly config: EngineConfig;
  private readonly commands = new Map<string, CommandConfig>();
  private celebrations: ReadonlySet<string> = new Set();
  private dedupe!: RecentIdCache;
  private userLimiter!: KeyedRateLimiter;
  private globalLimiter!: TokenBucket;
  /** Conversational comments have their own filter, deduplication and rate limits, so chatter never eats the command budget. */
  private chatFilter: ((raw: string) => ChatVerdict) | null = null;
  private chatDedupe!: RecentIdCache;
  private chatUserLimiter!: KeyedRateLimiter;
  private chatGlobalLimiter!: TokenBucket;
  /** Likes wait here, summed per viewer, until the next `step()` hands them to the game at a limited rate. */
  private readonly pendingLikes = new Map<string, number>();
  private likeDedupe!: RecentIdCache;
  private lastStepAt: number | null = null;
  private liveSeq = 0;
  private readonly globalCooldowns = new Map<string, number>();
  private readonly queue: QueueItem[] = [];
  private draining = false;
  private currentIngestedAt = 0;
  /** Time from `ingest()` to the item being processed, in ms (queue wait plus processing). */
  readonly latency = new Histogram();
  private readonly _stats: EngineStats = {
    received: 0,
    invalid: 0,
    ignored: 0,
    duplicate: 0,
    rateLimited: 0,
    overflowDropped: 0,
    processed: 0,
    cooldownBlocked: 0,
    errors: 0,
    maxQueueDepth: 0,
    giftScoreRefused: 0,
    chatShown: 0,
    chatRejected: 0,
    chatRateLimited: 0,
    likesApplied: 0,
    likesDropped: 0,
  };

  constructor(private readonly options: EngineOptions) {
    this.clock = options.clock ?? systemClock;
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...options.config };
    this.configureMode(options.mode);
  }

  /** The authoritative game state. Replaced as a whole when the game is switched, so always read it through the engine. */
  get state(): GameState {
    return this._state;
  }

  /**
   * (Re)builds everything that depends on the game mode: the command table, celebrations, state, deduplication, rate
   * limiters and the queue. Settings that belong to the running server (sound, provider) are carried over.
   */
  private configureMode(mode: GameMode): void {
    const previous = this._state as GameState | undefined;
    this.mode = mode;
    this.celebrations = new Set(mode.config.celebrations);
    this.commands.clear();
    for (const [word, config] of Object.entries(mode.config.commands)) {
      const key = normalizeComment(word);
      if (key === null || this.commands.has(key)) throw new Error(`Invalid or duplicate command word: ${word}`);
      this.commands.set(key, config);
    }
    this._state = new GameState({
      modeId: mode.id,
      teams: mode.config.teams,
      timings: mode.config.timings,
      clock: this.clock,
      maxPlayers: this.config.maxPlayers,
      chatSupported: mode.config.chat !== undefined,
      chatEnabled: mode.config.chat?.defaultEnabled ?? true,
    });
    if (previous) this._state.carryOverFrom(previous);
    this.dedupe = new RecentIdCache(this.config.dedupeCapacity);
    this.userLimiter = new KeyedRateLimiter(this.config.userRate);
    this.globalLimiter = new TokenBucket(this.config.globalRate, this.clock.now());
    this.globalCooldowns.clear();
    this.queue.length = 0;

    const chat = mode.config.chat;
    this.chatFilter = chat ? createChatFilter({ maxLength: chat.maxLength ?? 60, blocklist: [...BLOCKLIST_TR, ...(chat.blocklist ?? [])] }) : null;
    this.chatDedupe = new RecentIdCache(1000);
    this.chatUserLimiter = new KeyedRateLimiter({ capacity: 1, perSecond: 1000 / (chat?.cooldownMs ?? 6_000) });
    this.chatGlobalLimiter = new TokenBucket({ capacity: 5, perSecond: 3 }, this.clock.now());

    this.pendingLikes.clear();
    this.likeDedupe = new RecentIdCache(2000);
    this.lastStepAt = null;
    const live = mode.live;
    if (live) this._state.setRankingSource(() => live.ranking());
  }

  get stats(): Readonly<EngineStats> {
    return this._stats;
  }

  get queueDepth(): number {
    return this.queue.length;
  }

  snapshot(): PublicSnapshot {
    return this.state.snapshot();
  }

  /** Applies due timer transitions. The runtime calls this periodically (see `state.rounds.nextDeadline()`). */
  tick(): void {
    this.state.tick();
  }

  /** Accepts one untrusted provider payload. Never throws. */
  ingest(raw: unknown): IngestOutcome {
    this._stats.received++;

    const parsed = NormalizedEventSchema.safeParse(raw);
    if (!parsed.success) {
      this._stats.invalid++;
      return 'invalid';
    }
    const event = parsed.data;
    const playerId = `${event.provider}:${event.userId}`;

    // Classify first so non-command chatter never consumes dedupe or rate-limit budget.
    let item: ViewerItem;
    if (event.kind === 'comment.received') {
      const command = normalizeComment(event.payload.text);
      const config = command === null ? undefined : this.commands.get(command);
      if (command === null || !config) return this.ingestChat(event.eventId, event.provider, playerId, event.payload.text);
      item = { type: 'comment', playerId, displayName: event.displayName, command, droppable: config.droppable };
    } else if (event.kind === 'like.received') {
      return this.ingestLike(event.eventId, event.provider, playerId, event.payload.count);
    } else {
      item = { type: 'gift', playerId, giftKey: event.payload.giftKey, count: event.payload.count, droppable: true };
    }

    if (this.dedupe.checkAndAdd(`${event.provider}:${event.eventId}`)) {
      this._stats.duplicate++;
      return 'duplicate';
    }

    // Per-user first so a spammer is stopped before touching the shared global budget.
    const now = this.clock.now();
    if (!this.userLimiter.tryTake(playerId, now) || !this.globalLimiter.tryTake(now)) {
      this._stats.rateLimited++;
      return 'rate_limited';
    }

    return this.enqueueViewerItem(this.stamp(item));
  }

  /**
   * A comment that is not a command. Shown on screen only if the game supports it and the operator has it on, and only for a
   * registered player on a team (viewers who have not joined never reach the limiters). It is moderated first, so refused text
   * costs no budget, then deduplicated and rate limited on its own budget.
   */
  private ingestChat(eventId: string, provider: string, playerId: string, text: string): IngestOutcome {
    const known = this.state.players.get(playerId);
    if (!this.chatFilter || !this.state.chat.enabled || !known || known.teamId === null || known.ignored) {
      this._stats.ignored++;
      return 'ignored';
    }
    const verdict = this.chatFilter(text);
    if (!verdict.ok) {
      this._stats.chatRejected++;
      return 'ignored';
    }
    if (this.chatDedupe.checkAndAdd(`${provider}:${eventId}`)) {
      this._stats.duplicate++;
      return 'duplicate';
    }
    const now = this.clock.now();
    if (!this.chatUserLimiter.tryTake(playerId, now) || !this.chatGlobalLimiter.tryTake(now)) {
      this._stats.chatRateLimited++;
      return 'rate_limited';
    }
    return this.enqueueViewerItem(this.stamp({ type: 'chat', playerId, text: verdict.text, droppable: true }));
  }

  /**
   * Likes, for a game that uses them. Never queued one by one: a viewer's likes are summed and wait for the next `step()`,
   * which hands them to the game no faster than the game's `maxPerSecond` per viewer. Only viewers the engine already
   * knows (and has not ignored) count, and the buffer per viewer is bounded, so a flood costs nothing but the sum.
   */
  private ingestLike(eventId: string, provider: string, playerId: string, count: number): IngestOutcome {
    const likes = this.mode.config.likes;
    const known = this.state.players.get(playerId);
    if (!likes || !this.mode.handleLike || !known || known.ignored) {
      this._stats.likesDropped += count;
      this._stats.ignored++;
      return 'ignored';
    }
    if (this.likeDedupe.checkAndAdd(`${provider}:${eventId}`)) {
      this._stats.duplicate++;
      return 'duplicate';
    }
    const buffer = Math.max(1, (likes.maxPerSecond ?? DEFAULT_LIKES_PER_SECOND) * LIKE_BUFFER_SECONDS);
    const before = this.pendingLikes.get(playerId) ?? 0;
    const after = Math.min(buffer, before + count);
    this._stats.likesDropped += before + count - after;
    this.pendingLikes.set(playerId, after);
    return 'queued';
  }

  /**
   * Advances what runs on its own clock: hands buffered likes to the game, and steps the game's live simulation. The runtime
   * calls it about ten times a second. It does nothing for a game without likes or a live part. Never throws.
   */
  step(): void {
    const now = this.clock.now();
    const dtMs = this.lastStepAt === null ? 0 : Math.min(MAX_STEP_MS, Math.max(0, now - this.lastStepAt));
    this.lastStepAt = now;
    try {
      this.flushLikes(dtMs);
      const live = this.mode.live;
      if (!live) return;
      const { rounds, players } = this.state;
      const result = live.step(dtMs, { now, phase: rounds.phase, paused: rounds.paused, isScoring: rounds.isScoring, players: new Map(players.list().map((p) => [p.id, p])) });
      if (result?.endRound && rounds.phase === 'active') rounds.endRound();
    } catch (error) {
      this._stats.errors++;
      this.options.onError?.(error);
    }
  }

  private flushLikes(dtMs: number): void {
    if (this.pendingLikes.size === 0 || !this.mode.handleLike) return;
    const perSecond = this.mode.config.likes?.maxPerSecond ?? DEFAULT_LIKES_PER_SECOND;
    const perStep = Math.max(1, Math.round((perSecond * dtMs) / 1000));
    for (const [playerId, pending] of [...this.pendingLikes]) {
      const player = this.state.players.get(playerId);
      if (!player || player.ignored) {
        this.pendingLikes.delete(playerId);
        this._stats.likesDropped += pending;
        continue;
      }
      const take = Math.min(pending, perStep);
      if (pending > take) this.pendingLikes.set(playerId, pending - take);
      else this.pendingLikes.delete(playerId);
      const effects = this.mode.handleLike(this.context(player), { type: 'like', playerId, count: take });
      this._stats.likesApplied += take;
      for (const effect of effects) this.emit(effect.event);
    }
  }

  /** Whether the running game has a live part (a view to send to the broadcast). */
  get hasLive(): boolean {
    return this.mode.live !== undefined;
  }

  /** The current live view with its sequence number and server time, or null for a game without one. */
  liveView(): LiveView | null {
    const body = this.mode.live?.view();
    if (!body) return null;
    return { ...body, seq: ++this.liveSeq, serverNow: this.clock.now() } as LiveView;
  }

  /**
   * Validates and runs an operator command in queue order, returning its result. Operator commands
   * bypass dedupe, rate limits and the queue capacity, and are never dropped.
   */
  operator(raw: unknown): OperatorResult {
    const parsed = OperatorCommandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: 'invalid_command' };

    const item = this.stamp<OperatorItem>({ type: 'operator', command: parsed.data, droppable: false });
    this.push(item);
    this.drain();
    return item.result ?? { ok: false, reason: 'busy' };
  }

  /** Processes everything queued, in order. Errors in one item never stop the rest. */
  drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      for (let item = this.queue.shift(); item !== undefined; item = this.queue.shift()) {
        try {
          this.currentIngestedAt = item.ingestedAt;
          this.process(item);
          this._stats.processed++;
          this.latency.record(performance.now() - item.enqueuedPerf);
        } catch (error) {
          this._stats.errors++;
          this.options.onError?.(error);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private stamp<T extends ViewerItem | OperatorItem>(item: T): T & { ingestedAt: number; enqueuedPerf: number } {
    return { ...item, ingestedAt: this.clock.now(), enqueuedPerf: performance.now() };
  }

  private enqueueViewerItem(item: QueueItem): IngestOutcome {
    if (this.queue.length >= this.config.queueCapacity) {
      const oldestDroppable = this.queue.findIndex((queued) => queued.droppable);
      this._stats.overflowDropped++;
      if (oldestDroppable === -1) return 'queue_full'; // nothing sheddable: drop the newcomer
      this.queue.splice(oldestDroppable, 1);
    }
    this.push(item);
    return 'queued';
  }

  private push(item: QueueItem): void {
    this.queue.push(item);
    if (this.queue.length > this._stats.maxQueueDepth) this._stats.maxQueueDepth = this.queue.length;
  }

  private process(item: QueueItem): void {
    switch (item.type) {
      case 'operator':
        item.result = this.applyOperator(item.command);
        return;

      case 'comment': {
        const player = this.state.registerViewer(item.playerId, item.displayName);
        if (!player) {
          this._stats.ignored++; // ignored by the operator, or the session is full
          return;
        }
        const effects = this.mode.handleCommand(this.context(player), {
          type: 'command',
          playerId: player.id,
          command: item.command,
        });
        this.applyEffects(player, effects);
        return;
      }

      case 'chat': {
        const player = this.state.players.get(item.playerId);
        if (!player || player.teamId === null || player.ignored || !this.state.chat.enabled) return; // things changed while it queued
        this._stats.chatShown++;
        this.emit({ type: 'chat', playerId: player.id, text: item.text });
        return;
      }

      case 'gift': {
        const known = this.state.players.get(item.playerId);
        if (known?.ignored) {
          this._stats.ignored++;
          return;
        }
        const effects = this.mode.handleGift(this.context(known ?? null), {
          type: 'gift',
          playerId: known?.id ?? null,
          giftKey: item.giftKey,
          count: item.count,
        });
        for (const effect of effects) {
          if (effect.type === 'present') this.emit(effect.event);
          else this.applyGiftScore(known ?? null, effect.points);
        }
        return;
      }
    }
  }

  /**
   * A gift's team points. Applied only if the game declared `giftsMayScore`, and then only for a registered player on a team
   * during an actively scoring round (a gift from a stranger has nobody to credit). Anything else is dropped and counted.
   */
  private applyGiftScore(player: Player | null, points: number): void {
    if (!this.mode.config.giftsMayScore || !player || player.teamId === null || !Number.isFinite(points) || points <= 0) {
      this._stats.giftScoreRefused++;
      return;
    }
    if (!this.state.addEnergy(player.id, points).ok) this._stats.giftScoreRefused++;
  }

  private applyEffects(player: Player, effects: readonly ModeEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'join_team': {
          const result = this.state.joinTeam(player.id, effect.teamId);
          if (result.ok && result.changed) {
            this.emit({ type: 'player_joined', playerId: player.id, teamId: effect.teamId });
          } else if (!result.ok && result.reason === 'switch_locked') {
            this.emit({ type: 'hint', playerId: player.id, reason: 'switch_locked' });
          }
          break;
        }
        case 'score':
          this.state.addEnergy(player.id, effect.points); // refused outside an active round
          break;
        case 'present':
          this.emit(effect.event);
          break;
      }
    }
  }

  private applyOperator(command: OperatorCommand): OperatorResult {
    const { rounds, players } = this.state;
    switch (command.type) {
      case 'start_game':
        return rounds.startGame();
      case 'stop_game':
        return rounds.stopGame();
      case 'pause':
        return rounds.pause();
      case 'resume':
        return rounds.resume();
      case 'start_round':
        return rounds.startRound();
      case 'end_round':
        return rounds.endRound();
      case 'reset_round_score':
        return this.state.resetRoundScore();
      case 'set_chat':
        if (!this.state.chat.supported) return { ok: false, reason: 'chat_unsupported' };
        this.state.setChatEnabled(command.enabled);
        return { ok: true };
      case 'select_game': {
        if (!this.options.modes) return { ok: false, reason: 'game_selection_unavailable' };
        if (rounds.phase !== 'stopped') return { ok: false, reason: 'game_running' }; // switching resets everything: stop first
        let next: GameMode;
        try {
          next = this.options.modes(command.modeId);
        } catch {
          return { ok: false, reason: 'unknown_game' };
        }
        this.configureMode(next);
        this.options.onModeChanged?.();
        return { ok: true };
      }
      case 'set_sound':
        if (command.muted === undefined && command.volume === undefined) return { ok: false, reason: 'nothing_to_change' };
        this.state.setSound({ muted: command.muted, volume: command.volume });
        return { ok: true };
      case 'trigger_celebration':
        if (!this.celebrations.has(command.effect)) return { ok: false, reason: 'unknown_effect' };
        this.emit({ type: 'celebration', effect: command.effect });
        return { ok: true };
      case 'remove_player':
        return players.remove(command.playerId) ? { ok: true } : { ok: false, reason: 'unknown_player' };
      case 'ignore_player':
        return players.ignore(command.playerId) ? { ok: true } : { ok: false, reason: 'unknown_player' };
      case 'reassign_player': {
        const result = this.state.joinTeam(command.playerId, command.teamId, { force: true });
        if (!result.ok) return { ok: false, reason: result.reason };
        if (result.changed) this.emit({ type: 'player_joined', playerId: command.playerId, teamId: command.teamId });
        return { ok: true };
      }
    }
  }

  private context(player: Player | null): ModeContext {
    const now = this.clock.now();
    const { rounds, players } = this.state;
    const cooldownMs = (key: string): number => {
      const ms = this.mode.config.cooldowns[key];
      if (ms === undefined) throw new Error(`Unknown cooldown key: ${key}`);
      return ms;
    };

    return {
      now,
      phase: rounds.phase,
      paused: rounds.paused,
      isScoring: rounds.isScoring,
      player,
      tryCooldown: (key) => {
        const ok = player !== null && players.tryStartCooldown(player.id, key, cooldownMs(key), now);
        if (!ok) this._stats.cooldownBlocked++;
        return ok;
      },
      tryGlobalCooldown: (key) => {
        const last = this.globalCooldowns.get(key);
        if (last !== undefined && now - last < cooldownMs(key)) {
          this._stats.cooldownBlocked++;
          return false;
        }
        this.globalCooldowns.set(key, now);
        return true;
      },
    };
  }

  private emit(event: PresentationEvent): void {
    this.options.onPresentation?.(event, { ingestedAt: this.currentIngestedAt });
  }
}
