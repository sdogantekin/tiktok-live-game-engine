export interface SlotRosterEntry {
  id: string;
  teamId: string | null;
}

export interface AvatarSlotOptions {
  teamIds: readonly string[];
  /** Maximum individually rendered avatars across all teams. */
  capTotal: number;
  /**
   * A player without an avatar only displaces one who has been idle at least this much longer,
   * so avatars do not churn when many players act at once.
   */
  hysteresisMs?: number;
}

export const DEFAULT_HYSTERESIS_MS = 8_000;

/**
 * Decides which of the (up to 200) participants get an individually animated avatar. Everyone else
 * is represented by the crowd. Assignment is sticky: a player keeps their slot until they leave,
 * change team, or become the longest-idle avatar while someone newly active has none.
 * Pure and deterministic, so it is unit-tested without a renderer.
 */
export class AvatarSlots {
  private readonly slotsByTeam = new Map<string, (string | null)[]>();
  private readonly members = new Map<string, string>(); // player id -> team id, in join order
  private readonly slotOfPlayer = new Map<string, { teamId: string; index: number }>();
  private readonly lastActive = new Map<string, number>();
  private readonly hysteresisMs: number;

  constructor(options: AvatarSlotOptions) {
    this.hysteresisMs = options.hysteresisMs ?? DEFAULT_HYSTERESIS_MS;
    const teams = options.teamIds.length;
    options.teamIds.forEach((teamId, i) => {
      const cap = Math.floor(options.capTotal / teams) + (i < options.capTotal % teams ? 1 : 0);
      this.slotsByTeam.set(teamId, Array.from({ length: cap }, () => null));
    });
  }

  slots(teamId: string): readonly (string | null)[] {
    return this.slotsByTeam.get(teamId) ?? [];
  }

  slotOf(playerId: string): { teamId: string; index: number } | null {
    return this.slotOfPlayer.get(playerId) ?? null;
  }

  visibleCount(teamId: string): number {
    return this.slots(teamId).filter((id) => id !== null).length;
  }

  /** Reconciles slots with the current roster. Returns true if any slot changed. */
  setRoster(entries: readonly SlotRosterEntry[]): boolean {
    let changed = false;

    this.members.clear();
    for (const { id, teamId } of entries) {
      if (teamId !== null && this.slotsByTeam.has(teamId)) this.members.set(id, teamId);
    }

    // Free slots of players who left or changed team.
    for (const [playerId, slot] of [...this.slotOfPlayer]) {
      if (this.members.get(playerId) !== slot.teamId) {
        this.release(playerId);
        changed = true;
      }
    }
    for (const id of this.lastActive.keys()) {
      if (!this.members.has(id)) this.lastActive.delete(id);
    }

    // Fill free slots with the most recently active members (join order breaks ties).
    for (const [teamId, slots] of this.slotsByTeam) {
      const waiting = [...this.members]
        .filter(([id, team]) => team === teamId && !this.slotOfPlayer.has(id))
        .map(([id], order) => ({ id, order, active: this.lastActive.get(id) ?? Number.NEGATIVE_INFINITY }))
        .sort((a, b) => b.active - a.active || a.order - b.order);
      let next = 0;
      for (let index = 0; index < slots.length && next < waiting.length; index++) {
        if (slots[index] === null) {
          this.assign(waiting[next]!.id, teamId, index);
          next++;
          changed = true;
        }
      }
    }
    return changed;
  }

  /**
   * Records that a player just did something. A player without an avatar may take a free slot or
   * displace the longest-idle avatar on their team. Returns true if any slot changed.
   */
  noteActivity(playerId: string, at: number): boolean {
    const teamId = this.members.get(playerId);
    if (teamId === undefined) return false;
    this.lastActive.set(playerId, at);
    if (this.slotOfPlayer.has(playerId)) return false;

    const slots = this.slotsByTeam.get(teamId)!;
    const free = slots.indexOf(null);
    if (free !== -1) {
      this.assign(playerId, teamId, free);
      return true;
    }

    let victimIndex = -1;
    let victimActive = Number.POSITIVE_INFINITY;
    slots.forEach((occupant, index) => {
      const active = this.lastActive.get(occupant!) ?? Number.NEGATIVE_INFINITY;
      if (active < victimActive) {
        victimActive = active;
        victimIndex = index;
      }
    });
    if (victimIndex === -1 || at - victimActive < this.hysteresisMs) return false;

    this.release(slots[victimIndex]!);
    this.assign(playerId, teamId, victimIndex);
    return true;
  }

  private assign(playerId: string, teamId: string, index: number): void {
    this.slotsByTeam.get(teamId)![index] = playerId;
    this.slotOfPlayer.set(playerId, { teamId, index });
  }

  private release(playerId: string): void {
    const slot = this.slotOfPlayer.get(playerId);
    if (!slot) return;
    this.slotsByTeam.get(slot.teamId)![slot.index] = null;
    this.slotOfPlayer.delete(playerId);
  }
}
