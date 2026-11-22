/** How lively each team's crowd is right now: bumped by activity, decaying smoothly. 0..1. */
export class EnergyMeter {
  private readonly levels = new Map<string, { value: number; at: number }>();

  constructor(private readonly halfLifeMs = 1500) {}

  bump(teamId: string, amount: number, now: number): void {
    this.levels.set(teamId, { value: Math.min(1, this.get(teamId, now) + amount), at: now });
  }

  get(teamId: string, now: number): number {
    const level = this.levels.get(teamId);
    if (!level) return 0;
    return level.value * 0.5 ** (Math.max(0, now - level.at) / this.halfLifeMs);
  }
}
