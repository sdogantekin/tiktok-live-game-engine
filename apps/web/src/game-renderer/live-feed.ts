import type { LiveView } from '@live-game/contracts';

/**
 * The newest live view of a game that simulates on the server (a race). A plain observable outside React: the 3D scene
 * reads `latest` every frame, and small components subscribe to it. Views that arrive late or out of order (an older
 * sequence number) are dropped, so the picture never jumps backwards.
 */
export class LiveFeed {
  private current: LiveView | null = null;
  private readonly listeners = new Set<() => void>();

  /** The newest view, or null before the first (or after a game switch). */
  latest = (): LiveView | null => this.current;

  push(view: LiveView): void {
    if (this.current && view.kind === this.current.kind && view.seq <= this.current.seq) return;
    this.current = view;
    for (const listener of this.listeners) listener();
  }

  /** Forgets the view, for when the game changes. */
  reset(): void {
    if (this.current === null) return;
    this.current = null;
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}
