import { describe, expect, it } from 'vitest';
import { ManualClock } from '../clock';
import { type PhaseTransition, RoundService, type RoundTimings } from './round-service';

const TIMINGS: RoundTimings = { countdownMs: 15_000, roundMs: 180_000, resultsMs: 15_000, autoNext: true };

function setup(overrides: Partial<RoundTimings> = {}) {
  const clock = new ManualClock();
  const transitions: PhaseTransition[] = [];
  const rounds = new RoundService({ ...TIMINGS, ...overrides }, clock, (t) => transitions.push(t));
  return { clock, rounds, transitions };
}

describe('lifecycle', () => {
  it('starts stopped and moves through the full loop on timers (autoNext)', () => {
    const { clock, rounds } = setup();
    expect(rounds.phase).toBe('stopped');

    expect(rounds.startGame()).toEqual({ ok: true });
    expect(rounds.phase).toBe('countdown'); // lobby is transient with autoNext
    expect(rounds.round).toBe(1);

    clock.advance(15_000);
    rounds.tick();
    expect(rounds.phase).toBe('active');
    expect(rounds.isScoring).toBe(true);

    clock.advance(180_000);
    rounds.tick();
    expect(rounds.phase).toBe('results');
    expect(rounds.isScoring).toBe(false);

    clock.advance(15_000);
    rounds.tick();
    expect(rounds.phase).toBe('countdown');
    expect(rounds.round).toBe(2);
  });

  it('reports every transition in order, including the transient lobby', () => {
    const { clock, rounds, transitions } = setup();
    rounds.startGame();
    clock.advance(15_000);
    rounds.tick();
    expect(transitions.map((t) => `${t.from}>${t.to}:${t.round}`)).toEqual([
      'stopped>lobby:0',
      'lobby>countdown:1',
      'countdown>active:1',
    ]);
  });

  it('waits in the lobby when autoNext is off, and a manual start skips the countdown', () => {
    const { clock, rounds } = setup({ autoNext: false });
    rounds.startGame();
    expect(rounds.phase).toBe('lobby');
    expect(rounds.phaseEndsAt).toBeNull();
    clock.advance(10 * 60_000);
    rounds.tick();
    expect(rounds.phase).toBe('lobby');

    expect(rounds.startRound()).toEqual({ ok: true });
    expect(rounds.phase).toBe('active');
    expect(rounds.round).toBe(1);
  });

  it('does not increment the round when starting early from the countdown', () => {
    const { rounds } = setup();
    rounds.startGame();
    rounds.startRound();
    expect(rounds.phase).toBe('active');
    expect(rounds.round).toBe(1);
  });

  it('chains from deadlines so a late tick catches up without drift', () => {
    const { clock, rounds } = setup();
    const start = clock.now();
    rounds.startGame();
    clock.advance(15_000 + 180_000 + 5_000); // tick is 5 s late, past two deadlines
    rounds.tick();
    expect(rounds.phase).toBe('results');
    expect(rounds.phaseEndsAt).toBe(start + 15_000 + 180_000 + 15_000);
  });

  it('ends a round early and returns to the loop', () => {
    const { rounds } = setup({ autoNext: false });
    rounds.startGame();
    rounds.startRound();
    expect(rounds.endRound()).toEqual({ ok: true });
    expect(rounds.phase).toBe('results');
  });

  it('stopGame returns to stopped from any phase', () => {
    const { rounds } = setup();
    rounds.startGame();
    rounds.startRound();
    rounds.pause();
    expect(rounds.stopGame()).toEqual({ ok: true });
    expect(rounds.phase).toBe('stopped');
    expect(rounds.paused).toBe(false);
    expect(rounds.phaseEndsAt).toBeNull();
  });
});

describe('illegal transitions', () => {
  it('rejects them without changing state', () => {
    const { rounds } = setup({ autoNext: false });
    expect(rounds.stopGame()).toEqual({ ok: false, reason: 'not_running' });
    expect(rounds.startRound()).toEqual({ ok: false, reason: 'invalid_phase' });
    expect(rounds.endRound()).toEqual({ ok: false, reason: 'invalid_phase' });
    expect(rounds.pause()).toEqual({ ok: false, reason: 'not_timed' });
    expect(rounds.resume()).toEqual({ ok: false, reason: 'not_paused' });

    rounds.startGame();
    expect(rounds.startGame()).toEqual({ ok: false, reason: 'already_running' });
    expect(rounds.endRound()).toEqual({ ok: false, reason: 'invalid_phase' });
    expect(rounds.pause()).toEqual({ ok: false, reason: 'not_timed' }); // lobby has no timer
    expect(rounds.phase).toBe('lobby');

    rounds.startRound();
    expect(rounds.startRound()).toEqual({ ok: false, reason: 'invalid_phase' });
  });
});

describe('pause and resume', () => {
  it('freezes the timer and resumes with the remaining time', () => {
    const { clock, rounds } = setup();
    rounds.startGame();
    rounds.startRound(); // active, ends at +180 s
    clock.advance(60_000);

    expect(rounds.pause()).toEqual({ ok: true });
    expect(rounds.paused).toBe(true);
    expect(rounds.isScoring).toBe(false);
    expect(rounds.phaseEndsAt).toBeNull();
    expect(rounds.remainingMs).toBe(120_000);
    expect(rounds.pause()).toEqual({ ok: false, reason: 'already_paused' });

    clock.advance(10 * 60_000); // a long pause changes nothing
    rounds.tick();
    expect(rounds.phase).toBe('active');

    expect(rounds.resume()).toEqual({ ok: true });
    expect(rounds.paused).toBe(false);
    expect(rounds.remainingMs).toBeNull();
    expect(rounds.phaseEndsAt).toBe(clock.now() + 120_000);

    clock.advance(119_999);
    rounds.tick();
    expect(rounds.phase).toBe('active');
    clock.advance(1);
    rounds.tick();
    expect(rounds.phase).toBe('results');
  });

  it('can pause the countdown and the results screen too', () => {
    const { clock, rounds } = setup();
    rounds.startGame(); // countdown
    clock.advance(5_000);
    rounds.pause();
    expect(rounds.remainingMs).toBe(10_000);
    rounds.resume();
    rounds.startRound();
    rounds.endRound();
    expect(rounds.pause()).toEqual({ ok: true });
  });

  it('operator overrides clear the paused flag', () => {
    const { rounds } = setup();
    rounds.startGame();
    rounds.startRound();
    rounds.pause();
    rounds.endRound();
    expect(rounds.paused).toBe(false);
    expect(rounds.phase).toBe('results');
    expect(rounds.phaseEndsAt).not.toBeNull();
  });
});

describe('configuration', () => {
  it('rejects non-positive timings', () => {
    const clock = new ManualClock();
    expect(() => new RoundService({ ...TIMINGS, roundMs: 0 }, clock)).toThrow(RangeError);
    expect(() => new RoundService({ ...TIMINGS, countdownMs: -1 }, clock)).toThrow(RangeError);
    expect(() => new RoundService({ ...TIMINGS, resultsMs: Number.NaN }, clock)).toThrow(RangeError);
  });

  it('exposes the next deadline for scheduling', () => {
    const { clock, rounds } = setup();
    expect(rounds.nextDeadline()).toBeNull();
    rounds.startGame();
    expect(rounds.nextDeadline()).toBe(clock.now() + 15_000);
  });
});
