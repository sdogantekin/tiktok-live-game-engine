import type { ProviderStatus, SimulatorCommand } from '@live-game/contracts';
import { Rng } from './rng';
import {
  chaosScenario,
  MALFORMED_PAYLOADS,
  MAHALLE_VOCABULARY,
  steadyScenario,
  type Vocabulary,
} from './scenarios';
import { createViewers, EventFactory, type ScheduledEvent, type SimViewer } from './simulator';

export type SimulatorResult = { ok: true } | { ok: false; reason: string };

export interface SimulatorProviderOptions {
  /** Delivers one untrusted payload to the engine. */
  emit: (raw: unknown) => void;
  now?: () => number;
  seed?: number;
  vocabulary?: Vocabulary;
  /** Window over which newly added viewers send their join comment. */
  joinSpreadMs?: number;
  pumpIntervalMs?: number;
  onStatusChange?: (status: ProviderStatus) => void;
}

const MAX_VIEWERS = 1000;

interface Playback {
  startedAt: number;
  schedule: readonly ScheduledEvent[];
  index: number;
}

/**
 * The local event provider: operator-driven synthetic viewers, bursts, scenarios and fault injection.
 * It only ever calls `emit`, exactly like a future real provider would.
 */
export class SimulatorProvider {
  private _status: ProviderStatus = 'connected';
  private readonly rng: Rng;
  private readonly now: () => number;
  private readonly vocabulary: Vocabulary;
  private readonly joinSpreadMs: number;
  private readonly pumpIntervalMs: number;
  private readonly manual = new EventFactory('manual');
  private readonly pool: SimViewer[] = [];
  private readonly playbacks: Playback[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private runCount = 0;
  private lastEvent: unknown = null;

  constructor(private readonly options: SimulatorProviderOptions) {
    this.rng = new Rng(options.seed ?? Date.now());
    this.now = options.now ?? Date.now;
    this.vocabulary = options.vocabulary ?? MAHALLE_VOCABULARY;
    this.joinSpreadMs = options.joinSpreadMs ?? 2_000;
    this.pumpIntervalMs = options.pumpIntervalMs ?? 25;
  }

  get status(): ProviderStatus {
    return this._status;
  }

  get viewerCount(): number {
    return this.pool.length;
  }

  handle(command: SimulatorCommand): SimulatorResult {
    switch (command.type) {
      case 'sim_connect':
        return this.connect();
      case 'sim_disconnect':
        return this.disconnect();
      case 'sim_stop':
        this.stop();
        return { ok: true };
    }
    if (this._status !== 'connected') return { ok: false, reason: 'provider_disconnected' };

    switch (command.type) {
      case 'sim_add_viewers':
        return this.addViewers(command.count);
      case 'sim_comment':
        return this.sendAs(command.viewerId, (viewer) => this.manual.comment(viewer, command.text, this.now()));
      case 'sim_gift':
        return this.sendAs(command.viewerId, (viewer) => this.manual.gift(viewer, command.giftKey, this.now()));
      case 'sim_burst':
        return this.burst(command.text, command.count, command.spreadMs);
      case 'sim_scenario':
        return this.runScenario(command.name, command.viewers, command.durationMs);
      case 'sim_inject':
        return this.inject(command.fault);
    }
  }

  connect(): SimulatorResult {
    this.setStatus('connected');
    return { ok: true };
  }

  /** Simulates a provider outage: playback stops and nothing more is emitted until reconnect. */
  disconnect(): SimulatorResult {
    this.stop();
    this.setStatus('disconnected');
    return { ok: true };
  }

  /** Cancels all running playback. Safe to call at any time. */
  stop(): void {
    this.playbacks.length = 0;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private addViewers(count: number): SimulatorResult {
    if (this.pool.length + count > MAX_VIEWERS) return { ok: false, reason: 'viewer_limit' };
    const added = createViewers(count, this.rng, this.pool.length + 1);
    this.pool.push(...added);

    const startedAt = this.now();
    this.play(
      added.map((viewer) => {
        const atMs = this.rng.int(this.joinSpreadMs + 1);
        return {
          atMs,
          raw: this.manual.comment(viewer, this.rng.pick(this.vocabulary.joinWords), startedAt + atMs),
        };
      }),
    );
    return { ok: true };
  }

  private sendAs(viewerId: string | undefined, build: (viewer: SimViewer) => unknown): SimulatorResult {
    const viewer = viewerId ? { userId: viewerId, displayName: viewerId } : this.pool[this.rng.int(this.pool.length)];
    if (!viewer) return { ok: false, reason: 'no_viewers' };
    this.deliver(build(viewer));
    return { ok: true };
  }

  private burst(text: string, count: number, spreadMs: number): SimulatorResult {
    if (this.pool.length === 0) return { ok: false, reason: 'no_viewers' };
    if (count > this.pool.length) return { ok: false, reason: 'not_enough_viewers' };

    const startedAt = this.now();
    this.play(
      this.pool.slice(0, count).map((viewer) => {
        const atMs = this.rng.int(spreadMs + 1);
        return { atMs, raw: this.manual.comment(viewer, text, startedAt + atMs) };
      }),
    );
    return { ok: true };
  }

  private runScenario(name: 'steady' | 'chaos', viewers: number, durationMs: number): SimulatorResult {
    const options = {
      seed: this.rng.int(2 ** 31),
      viewers,
      startAt: this.now(),
      vocabulary: this.vocabulary,
      idPrefix: `run${++this.runCount}`,
    };
    this.play(
      name === 'steady'
        ? steadyScenario({
            ...options,
            joinWindowMs: Math.min(20_000, Math.floor(durationMs / 5)),
            durationMs,
            eventsPerSecond: Math.max(1, Math.round(viewers / 8)),
            giftRate: 0.02,
          })
        : chaosScenario({ ...options, durationMs, episodes: Math.max(10, Math.floor(durationMs / 100)) }),
    );
    return { ok: true };
  }

  private inject(fault: 'duplicate' | 'malformed'): SimulatorResult {
    if (fault === 'malformed') {
      this.options.emit(this.rng.pick(MALFORMED_PAYLOADS));
      return { ok: true };
    }
    if (this.lastEvent === null) return { ok: false, reason: 'nothing_to_duplicate' };
    this.options.emit(this.lastEvent); // same event id again
    return { ok: true };
  }

  private play(schedule: readonly ScheduledEvent[]): void {
    if (schedule.length === 0) return;
    const sorted = [...schedule].sort((a, b) => a.atMs - b.atMs);
    this.playbacks.push({ startedAt: this.now(), schedule: sorted, index: 0 });
    this.timer ??= setInterval(() => this.pump(), this.pumpIntervalMs);
    this.pump();
  }

  private pump(): void {
    const now = this.now();
    for (const playback of this.playbacks) {
      while (playback.index < playback.schedule.length) {
        const next = playback.schedule[playback.index];
        if (!next || next.atMs > now - playback.startedAt) break;
        playback.index++;
        this.deliver(next.raw);
      }
    }
    for (let i = this.playbacks.length - 1; i >= 0; i--) {
      const playback = this.playbacks[i];
      if (playback && playback.index >= playback.schedule.length) this.playbacks.splice(i, 1);
    }
    if (this.playbacks.length === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private deliver(raw: unknown): void {
    if (this._status !== 'connected') return;
    this.lastEvent = raw;
    this.options.emit(raw);
  }

  private setStatus(status: ProviderStatus): void {
    if (status === this._status) return;
    this._status = status;
    this.options.onStatusChange?.(status);
  }
}
