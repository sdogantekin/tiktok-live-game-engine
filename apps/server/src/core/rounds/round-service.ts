import type { Phase } from '@live-game/contracts';
import type { Clock } from '../clock';

export interface RoundTimings {
  countdownMs: number;
  roundMs: number;
  resultsMs: number;
  /** When true, entering the lobby immediately starts the next countdown. */
  autoNext: boolean;
}

export const DEFAULT_ROUND_TIMINGS: RoundTimings = {
  countdownMs: 15_000,
  roundMs: 180_000,
  resultsMs: 15_000,
  autoNext: true,
};

export type TransitionResult = { ok: true } | { ok: false; reason: string };

export interface PhaseTransition {
  from: Phase;
  to: Phase;
  /** Round number after the transition (incremented when leaving the lobby). */
  round: number;
}

const ok: TransitionResult = { ok: true };
const fail = (reason: string): TransitionResult => ({ ok: false, reason });

/**
 * Round lifecycle: stopped → lobby → countdown → active → results → lobby …
 *
 * `paused` is a flag over the current timed phase. The service has no timers of its own: the engine
 * calls `tick()` (and may use `nextDeadline()` to schedule it), which keeps it deterministic.
 */
export class RoundService {
  private _phase: Phase = 'stopped';
  private _paused = false;
  private _round = 0;
  private _endsAt: number | null = null;
  private _remainingMs: number | null = null;

  constructor(
    private readonly timings: RoundTimings,
    private readonly clock: Clock,
    private readonly onTransition: (transition: PhaseTransition) => void = () => {},
  ) {
    for (const value of [timings.countdownMs, timings.roundMs, timings.resultsMs]) {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError('Round timings must be positive');
    }
  }

  get phase(): Phase {
    return this._phase;
  }
  get paused(): boolean {
    return this._paused;
  }
  get round(): number {
    return this._round;
  }
  /** Epoch ms when the current timed phase ends; null when untimed or paused. */
  get phaseEndsAt(): number | null {
    return this._endsAt;
  }
  /** Time left in the frozen phase while paused; null otherwise. */
  get remainingMs(): number | null {
    return this._remainingMs;
  }
  /** Score-bearing actions are accepted only during an unpaused active round. */
  get isScoring(): boolean {
    return this._phase === 'active' && !this._paused;
  }

  startGame(): TransitionResult {
    if (this._phase !== 'stopped') return fail('already_running');
    this.enter('lobby', this.clock.now());
    return ok;
  }

  stopGame(): TransitionResult {
    if (this._phase === 'stopped') return fail('not_running');
    this.enter('stopped', this.clock.now());
    return ok;
  }

  /** Starts the round immediately, skipping any remaining countdown. */
  startRound(): TransitionResult {
    if (this._phase !== 'lobby' && this._phase !== 'countdown') return fail('invalid_phase');
    this.enter('active', this.clock.now());
    return ok;
  }

  endRound(): TransitionResult {
    if (this._phase !== 'active') return fail('invalid_phase');
    this.enter('results', this.clock.now());
    return ok;
  }

  pause(): TransitionResult {
    if (this._paused) return fail('already_paused');
    if (this._endsAt === null) return fail('not_timed');
    this._remainingMs = Math.max(0, this._endsAt - this.clock.now());
    this._endsAt = null;
    this._paused = true;
    return ok;
  }

  resume(): TransitionResult {
    if (!this._paused || this._remainingMs === null) return fail('not_paused');
    this._endsAt = this.clock.now() + this._remainingMs;
    this._remainingMs = null;
    this._paused = false;
    return ok;
  }

  /** Applies any timer-driven transitions that are due. Safe to call at any frequency. */
  tick(): void {
    const now = this.clock.now();
    while (!this._paused && this._endsAt !== null && now >= this._endsAt) {
      const deadline = this._endsAt; // chain from the deadline, not `now`, so late ticks do not drift
      switch (this._phase) {
        case 'countdown':
          this.enter('active', deadline);
          break;
        case 'active':
          this.enter('results', deadline);
          break;
        case 'results':
          this.enter('lobby', deadline);
          break;
        default:
          return;
      }
    }
  }

  nextDeadline(): number | null {
    return this._endsAt;
  }

  private enter(to: Phase, at: number): void {
    const from = this._phase;
    if (from === 'lobby' && (to === 'countdown' || to === 'active')) this._round++;

    this._phase = to;
    this._paused = false;
    this._remainingMs = null;
    this._endsAt =
      to === 'countdown'
        ? at + this.timings.countdownMs
        : to === 'active'
          ? at + this.timings.roundMs
          : to === 'results'
            ? at + this.timings.resultsMs
            : null;

    this.onTransition({ from, to, round: this._round });

    if (to === 'lobby' && this.timings.autoNext) this.enter('countdown', at);
  }
}
