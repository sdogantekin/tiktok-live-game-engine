import type { PresentationEvent } from '@live-game/contracts';
import { ManualClock } from '../src/core/clock';
import { type EngineConfig, GameEngine } from '../src/core/engine';
import type { GameMode } from '../src/core/mode';
import { createMahalleHalayiMode } from '../src/game-modes/mahalle-halayi/rules';
import type { ScheduledEvent } from '../src/providers/simulator/simulator';

export function createTestEngine(options: { config?: Partial<EngineConfig>; mode?: GameMode; onError?: (e: unknown) => void } = {}) {
  const clock = new ManualClock();
  const presentation: PresentationEvent[] = [];
  const engine = new GameEngine({
    mode: options.mode ?? createMahalleHalayiMode(),
    clock,
    config: options.config,
    onPresentation: (event) => presentation.push(event),
    onError: options.onError,
  });

  let sequence = 0;
  const base = (user: string) => ({
    eventId: `e${++sequence}`,
    provider: 'test',
    userId: user,
    displayName: user,
    receivedAt: clock.now(),
  });

  /** Ingests a comment and drains the queue. */
  const say = (user: string, text: string) => {
    const outcome = engine.ingest({ ...base(user), kind: 'comment.received', payload: { text } });
    engine.drain();
    return outcome;
  };
  const give = (user: string, giftKey: string) => {
    const outcome = engine.ingest({ ...base(user), kind: 'gift.received', payload: { giftKey, count: 1 } });
    engine.drain();
    return outcome;
  };
  const score = (teamId: string) => engine.state.scoring.get(teamId);

  /** Starts the game and skips straight to an active round. */
  const startActiveRound = () => {
    engine.operator({ type: 'start_game' });
    engine.operator({ type: 'start_round' });
  };

  return { engine, clock, presentation, say, give, score, startActiveRound };
}

/** Plays a schedule against an engine on a manual clock, draining and ticking after every event. */
export function runSchedule(
  harness: Pick<ReturnType<typeof createTestEngine>, 'engine' | 'clock'>,
  schedule: readonly ScheduledEvent[],
  startedAt: number,
  endAtMs: number,
): void {
  const { engine, clock } = harness;
  for (const { atMs, raw } of schedule) {
    clock.advance(Math.max(0, startedAt + atMs - clock.now()));
    engine.ingest(raw);
    engine.drain();
    engine.tick();
  }
  clock.advance(Math.max(0, startedAt + endAtMs - clock.now()));
  engine.tick();
}
