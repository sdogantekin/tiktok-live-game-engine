import type { OperatorAck, ProviderInfo, ProviderStatus, SimulatorCommand, TikTokCommand } from '@live-game/contracts';
import type { SimulatorProvider } from '../providers/simulator/provider';
import type { TikTokProvider } from '../providers/tiktok/provider';

export interface ProviderHubDeps {
  simulator: SimulatorProvider;
  tiktok: TikTokProvider;
  /** Reports the status of whichever provider is the active one. */
  setStatus: (status: ProviderStatus) => void;
  /** Gives the HUD a way to read the active provider's info whenever it is published (so counters are always current). */
  setInfoSource: (source: () => ProviderInfo) => void;
}

/**
 * Keeps exactly one event provider in charge: the local simulator or TikTok LIVE, never both, so simulated players can
 * never appear on a real stream. Starting TikTok switches the simulator off first; the simulator cannot be switched back
 * on until TikTok has been stopped. The hub also turns the active provider's state into the status and the operator
 * message shown on the HUD.
 */
export class ProviderHub {
  private kind: 'simulator' | 'tiktok' = 'simulator';

  constructor(private readonly deps: ProviderHubDeps) {
    deps.setInfoSource(() => this.info());
  }

  /** What the active provider is doing, for the HUD. */
  info(): ProviderInfo {
    if (this.kind === 'tiktok') return this.deps.tiktok.info();
    const status = this.deps.simulator.status;
    return { kind: 'simulator', state: status, message: status === 'connected' ? 'Simulated viewers.' : 'Simulator is disconnected.' };
  }

  /** Recomputes the status from the active provider. Call whenever either provider changes. */
  refresh(): void {
    this.deps.setStatus(this.kind === 'tiktok' ? this.deps.tiktok.status : this.deps.simulator.status);
  }

  handleTikTok(command: TikTokCommand): OperatorAck {
    if (command.type === 'tiktok_disconnect') {
      const result = this.deps.tiktok.stop();
      this.refresh();
      return result;
    }
    // Check before touching anything: a typo, or a server with TikTok off, must not switch the simulator off.
    const allowed = this.deps.tiktok.canStart(command.username);
    if (!allowed.ok) return allowed;
    this.deps.simulator.disconnect();
    const result = this.deps.tiktok.start(command.username);
    if (result.ok) this.kind = 'tiktok';
    this.refresh();
    return result;
  }

  handleSimulator(command: SimulatorCommand): OperatorAck {
    if (this.kind === 'tiktok' && this.deps.tiktok.active) {
      // Stopping is always allowed; everything else would put simulated viewers next to a real stream.
      return command.type === 'sim_stop' || command.type === 'sim_disconnect' ? this.deps.simulator.handle(command) : { ok: false, reason: 'tiktok_active' };
    }
    if (command.type === 'sim_connect') this.kind = 'simulator';
    const result = this.deps.simulator.handle(command);
    this.refresh();
    return result;
  }
}
