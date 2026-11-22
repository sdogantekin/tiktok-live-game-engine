import {
  NormalizedEventSchema,
  type OperatorCommand,
  OperatorCommandSchema,
  type PresentationEvent,
  type PublicSnapshot,
} from '@live-game/contracts';
import { type Clock, systemClock } from './clock';
import { normalizeComment } from './events/comment-normalizer';
import { KeyedRateLimiter, type RateSpec, TokenBucket } from './events/rate-limit';
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
  /** Receives transient visual cues; best-effort, never required for state correctness. */
  onPresentation?: (event: PresentationEvent) => void;
  /** Receives unexpected errors thrown while processing a single queued item. */
  onError?: (error: unknown) => void;
}

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
}

type ViewerItem =
  | { type: 'comment'; playerId: string; displayName: string; command: string; droppable: boolean }
  | { type: 'gift'; playerId: string; giftKey: string; count: number; droppable: true };
type OperatorItem = { type: 'operator'; command: OperatorCommand; result?: OperatorResult; droppable: false };
type QueueItem = ViewerItem | OperatorItem;

/**
 * Single serialized dispatch loop: validate → classify → dedupe → rate-limit → bounded queue →
 * game mode → authoritative state. Viewer events and operator commands share one queue so their
 * relative order is deterministic. Call `drain()` after `ingest()` (or let the runtime schedule it).
 */
export class GameEngine {
  readonly state: GameState;
  private readonly mode: GameMode;
  private readonly clock: Clock;
  private readonly config: EngineConfig;
  private readonly commands = new Map<string, CommandConfig>();
  private readonly celebrations: ReadonlySet<string>;
  private readonly dedupe: RecentIdCache;
  private readonly userLimiter: KeyedRateLimiter;
  private readonly globalLimiter: TokenBucket;
  private readonly globalCooldowns = new Map<string, number>();
  private readonly queue: QueueItem[] = [];
  private draining = false;
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
  };

  constructor(private readonly options: EngineOptions) {
    this.mode = options.mode;
    this.clock = options.clock ?? systemClock;
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...options.config };
    this.celebrations = new Set(this.mode.config.celebrations);

    for (const [word, config] of Object.entries(this.mode.config.commands)) {
      const key = normalizeComment(word);
      if (key === null || this.commands.has(key)) throw new Error(`Invalid or duplicate command word: ${word}`);
      this.commands.set(key, config);
    }

    this.state = new GameState({
      modeId: this.mode.id,
      teams: this.mode.config.teams,
      timings: this.mode.config.timings,
      clock: this.clock,
      maxPlayers: this.config.maxPlayers,
    });
    this.dedupe = new RecentIdCache(this.config.dedupeCapacity);
    this.userLimiter = new KeyedRateLimiter(this.config.userRate);
    this.globalLimiter = new TokenBucket(this.config.globalRate, this.clock.now());
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
      if (command === null || !config) {
        this._stats.ignored++;
        return 'ignored';
      }
      item = { type: 'comment', playerId, displayName: event.displayName, command, droppable: config.droppable };
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

    return this.enqueueViewerItem(item);
  }

  /**
   * Validates and runs an operator command in queue order, returning its result. Operator commands
   * bypass dedupe, rate limits and the queue capacity, and are never dropped.
   */
  operator(raw: unknown): OperatorResult {
    const parsed = OperatorCommandSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: 'invalid_command' };

    const item: OperatorItem = { type: 'operator', command: parsed.data, droppable: false };
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
          this.process(item);
          this._stats.processed++;
        } catch (error) {
          this._stats.errors++;
          this.options.onError?.(error);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private enqueueViewerItem(item: ViewerItem): IngestOutcome {
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
        for (const effect of effects) this.emit(effect.event);
        return;
      }
    }
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
    this.options.onPresentation?.(event);
  }
}
