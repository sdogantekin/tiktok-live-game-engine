/**
 * Generic team energy ledger. The only way to add energy is `add()`, called with a decision made
 * by the active game mode; nothing here accepts gift values or prices.
 */
export class ScoringService {
  private readonly scores = new Map<string, number>();

  constructor(teamIds: readonly string[]) {
    for (const id of teamIds) this.scores.set(id, 0);
  }

  add(teamId: string, points: number): void {
    if (!Number.isInteger(points) || points <= 0) throw new RangeError(`Invalid points: ${points}`);
    this.scores.set(teamId, this.get(teamId) + points);
  }

  get(teamId: string): number {
    const score = this.scores.get(teamId);
    if (score === undefined) throw new Error(`Unknown team: ${teamId}`);
    return score;
  }

  reset(): void {
    for (const id of this.scores.keys()) this.scores.set(id, 0);
  }
}

/** Highest score wins; any tie for first place is a draw (null). */
export function decideWinner(standings: readonly { id: string; score: number }[]): string | null {
  let best: { id: string; score: number } | null = null;
  let tied = false;
  for (const entry of standings) {
    if (best === null || entry.score > best.score) {
      best = entry;
      tied = false;
    } else if (entry.score === best.score) {
      tied = true;
    }
  }
  return best === null || tied ? null : best.id;
}
