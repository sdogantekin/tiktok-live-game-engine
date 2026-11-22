import { Component, type ReactNode } from 'react';

/** Renders `fallback` (default: nothing) if anything below throws, e.g. a model that failed to load. */
export class Boundary extends Component<{ children: ReactNode; fallback?: ReactNode; label: string }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(`[renderer] ${this.props.label} failed; using the fallback`, error);
  }

  override render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
