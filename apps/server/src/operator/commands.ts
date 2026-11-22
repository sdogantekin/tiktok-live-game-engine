import { type OperatorAck, SimulatorCommandSchema } from '@live-game/contracts';
import type { GameEngine } from '../core/engine';
import type { SimulatorProvider } from '../providers/simulator/provider';

/**
 * Routes an authenticated operator message: simulator commands go to the provider, everything
 * else goes to the engine, which validates it and applies it in queue order. Never throws.
 */
export function handleOperatorMessage(
  raw: unknown,
  deps: { engine: GameEngine; simulator: SimulatorProvider },
): OperatorAck {
  try {
    const simulatorCommand = SimulatorCommandSchema.safeParse(raw);
    return simulatorCommand.success ? deps.simulator.handle(simulatorCommand.data) : deps.engine.operator(raw);
  } catch {
    return { ok: false, reason: 'internal_error' };
  }
}
