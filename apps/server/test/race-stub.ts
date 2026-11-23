import type { LiveViewBody, RankingEntry } from '@live-game/contracts';
import type { GameMode, LiveContext } from '../src/core/mode';
import { createMahalleHalayiMode } from '../src/game-modes/mahalle-halayi/rules';

/** A stand-in game that uses likes and has a live part: it counts the likes it was given and moves one racer along. */
export function raceStub() {
  const log = { likes: [] as number[], steps: [] as number[], contexts: [] as LiveContext[], ended: false };
  let distance = 0;
  const base = createMahalleHalayiMode();
  const mode: GameMode = {
    ...base,
    config: { ...base.config, likes: { maxPerSecond: 10 } },
    handleLike(_ctx, action) {
      log.likes.push(action.count);
      return [{ type: 'present', event: { type: 'player_action', playerId: action.playerId, animation: 'boost' } }];
    },
    live: {
      step(dtMs, ctx) {
        log.steps.push(dtMs);
        log.contexts.push(ctx);
        distance += dtMs;
        if (distance >= 1000 && !log.ended) {
          log.ended = true;
          return { endRound: true };
        }
      },
      view(): LiveViewBody {
        return { kind: 'race', stage: 'racing', laps: 6, lapLength: 400, racers: [{ id: 'test:a', name: 'a', distance, speed: 1, boost: 0, place: null }], waiting: 0, capacity: 10 };
      },
      ranking(): readonly RankingEntry[] {
        return [{ place: 1, playerId: 'test:a', name: 'a' }];
      },
    },
  };
  return { mode, log };
}

