import { type OperatorAck, SimulatorCommandSchema, TikTokCommandSchema } from '@live-game/contracts';
import type { GameEngine } from '../core/engine';
import type { ProviderHub } from '../realtime/provider-hub';

/**
 * Routes an authenticated operator message: TikTok and simulator commands go to the provider hub (which keeps one
 * provider in charge), everything else goes to the engine, which validates it and applies it in queue order. Never throws.
 */
export function handleOperatorMessage(raw: unknown, deps: { engine: GameEngine; hub: ProviderHub }): OperatorAck {
  try {
    const tiktokCommand = TikTokCommandSchema.safeParse(raw);
    if (tiktokCommand.success) return deps.hub.handleTikTok(tiktokCommand.data);
    const simulatorCommand = SimulatorCommandSchema.safeParse(raw);
    return simulatorCommand.success ? deps.hub.handleSimulator(simulatorCommand.data) : deps.engine.operator(raw);
  } catch {
    return { ok: false, reason: 'internal_error' };
  }
}
