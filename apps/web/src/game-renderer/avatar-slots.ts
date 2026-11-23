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
  /** A team's first and last slots are the two line leaders (a halay has two ends). A leader keeps the role at least this long before someone else may take it. */
  leaderTermMs?: number;
  /** ...and the challenger must have been active at least this much more recently than the leader. */
  leaderMarginMs?: number;
  /**
   * `line` (default): both ends are filled first and are the two leaders, as in a dance line.
   * `queue`: slots fill in order from the first, and nobody leads (a queue has a front, not two ends).
   */
  arrangement?: 'line' | 'queue';
}

export const DEFAULT_HYSTERESIS_MS = 8_000;
export const DEFAULT_LEADER_TERM_MS = 10_000;
export const DEFAULT_LEADER_MARGIN_MS = 4_000;
/** How long activity of a player the roster does not know yet is remembered. */
const PENDING_ACTIVITY_MS = 30_000;

/** How many avatar slots each team gets: the cap split evenly, the remainder going to the first teams. */
export function slotCapacities(teamIds: readonly string[], capTotal: number): Record<string, number> {
  return Object.fromEntries(teamIds.map((teamId, i) => [teamId, Math.floor(capTotal / teamIds.length) + (i < capTotal % teamIds.length ? 1 : 0)]));
}

/**
 * The order in which a team's slots are filled: both line ends first (the two leaders), then inwards from the
 * ends, so a short line has people at both ends rather than one stretched-out group.
 */
export function fillOrder(length: number): number[] {
  const order: number[] = [];
  for (let low = 0, high = length - 1; low <= high; low++, high--) {
    order.push(low);
    if (high !== low) order.push(high);
  }
  return order;
}

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
  private readonly leaderTermMs: number;
  private readonly leaderMarginMs: number;
  private readonly arrangement: 'line' | 'queue';
  private readonly leaderSince = new Map<string, number>(); // `team:slot` -> when the current occupant took that lead slot
  private latest = 0; // newest activity time seen, used to age out activity of unknown players

  constructor(options: AvatarSlotOptions) {
    this.hysteresisMs = options.hysteresisMs ?? DEFAULT_HYSTERESIS_MS;
    this.leaderTermMs = options.leaderTermMs ?? DEFAULT_LEADER_TERM_MS;
    this.leaderMarginMs = options.leaderMarginMs ?? DEFAULT_LEADER_MARGIN_MS;
    this.arrangement = options.arrangement ?? 'line';
    for (const [teamId, cap] of Object.entries(slotCapacities(options.teamIds, options.capTotal))) {
      this.slotsByTeam.set(teamId, Array.from({ length: cap }, () => null));
    }
  }

  slots(teamId: string): readonly (string | null)[] {
    return this.slotsByTeam.get(teamId) ?? [];
  }

  slotOf(playerId: string): { teamId: string; index: number } | null {
    return this.slotOfPlayer.get(playerId) ?? null;
  }

  /** The slot indexes of a team's two line leaders: both ends of the line (just one if the team has a single slot). */
  leaderSlots(teamId: string): readonly number[] {
    const length = this.slots(teamId).length;
    if (this.arrangement === 'queue') return [];
    return length > 1 ? [0, length - 1] : length === 1 ? [0] : [];
  }

  /** The players leading a team's line, one per end: the most active recent players, re-chosen with a delay. */
  leadersOf(teamId: string): readonly (string | null)[] {
    return this.leaderSlots(teamId).map((index) => this.slots(teamId)[index] ?? null);
  }

  /** Whether a slot is one of a team's two lead positions. */
  isLeaderSlot(teamId: string, index: number): boolean {
    return this.leaderSlots(teamId).includes(index);
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
    // Forget activity of players who are gone, but keep recent activity of players the roster has not caught up
    // with yet: a cue can arrive a moment before the roster update that adds the player.
    for (const [id, at] of this.lastActive) {
      if (!this.members.has(id) && this.latest - at > PENDING_ACTIVITY_MS) this.lastActive.delete(id);
    }

    // Fill free slots with the most recently active members (join order breaks ties).
    for (const [teamId, slots] of this.slotsByTeam) {
      const waiting = [...this.members]
        .filter(([id, team]) => team === teamId && !this.slotOfPlayer.has(id))
        .map(([id], order) => ({ id, order, active: this.lastActive.get(id) ?? Number.NEGATIVE_INFINITY }))
        .sort((a, b) => b.active - a.active || a.order - b.order);
      let next = 0;
      for (const index of this.fillOrder(slots.length)) {
        if (next >= waiting.length) break;
        if (slots[index] === null) {
          this.assign(waiting[next]!.id, teamId, index);
          next++;
          changed = true;
        }
      }
    }

    // Members who were active before the roster knew them (or while all slots were taken) may now deserve a slot.
    const active = [...this.members.keys()]
      .filter((id) => !this.slotOfPlayer.has(id) && this.lastActive.has(id))
      .sort((a, b) => this.lastActive.get(b)! - this.lastActive.get(a)!);
    for (const id of active) {
      if (this.promote(id, this.lastActive.get(id)!)) changed = true;
    }
    if (this.electLeaders(this.latest)) changed = true;
    return changed;
  }

  /**
   * Records that a player just did something. A player without an avatar may take a free slot or
   * displace the longest-idle avatar on their team. Returns true if any slot changed.
   */
  noteActivity(playerId: string, at: number): boolean {
    this.latest = Math.max(this.latest, at);
    this.lastActive.set(playerId, at);
    if (!this.members.has(playerId)) return false;
    const promoted = !this.slotOfPlayer.has(playerId) && this.promote(playerId, at);
    return this.electLeaders(at) || promoted;
  }

  /**
   * The most active recent players lead each team's line, one at each end. To avoid flicker a leader keeps the role
   * for a minimum term and is only replaced by a player who has been clearly more recently active.
   */
  private electLeaders(at: number): boolean {
    let changed = false;
    const activeOf = (id: string) => this.lastActive.get(id) ?? Number.NEGATIVE_INFINITY;
    for (const [teamId, slots] of this.slotsByTeam) {
      const leaderSlots = this.leaderSlots(teamId);
      for (const lead of leaderSlots) {
        const key = `${teamId}:${lead}`;
        // Candidates: everyone on screen except the leader of the other end.
        const others = leaderSlots.filter((index) => index !== lead);
        const candidates = slots.flatMap((occupant, index) => (occupant !== null && !others.includes(index) ? [{ id: occupant, index }] : []));
        const incumbent = slots[lead];

        if (incumbent === null || incumbent === undefined) {
          // The leader left: the most active player still on screen steps up at once, so the line never loses an end.
          let successor: { id: string; index: number } | null = null;
          for (const candidate of candidates) if (successor === null || activeOf(candidate.id) > activeOf(successor.id)) successor = candidate;
          if (successor === null) continue;
          this.release(successor.id);
          this.assign(successor.id, teamId, lead);
          this.leaderSince.set(key, at);
          changed = true;
          continue;
        }
        if (at - (this.leaderSince.get(key) ?? at) < this.leaderTermMs) continue;
        let best = { id: incumbent, index: lead };
        for (const candidate of candidates) if (activeOf(candidate.id) > activeOf(best.id)) best = candidate;
        if (best.id === incumbent || activeOf(best.id) - activeOf(incumbent) < this.leaderMarginMs) continue;

        slots[best.index] = incumbent;
        slots[lead] = best.id;
        this.slotOfPlayer.set(incumbent, { teamId, index: best.index });
        this.slotOfPlayer.set(best.id, { teamId, index: lead });
        this.leaderSince.set(key, at);
        changed = true;
      }
    }
    return changed;
  }

  /** Gives an avatar-less member a free slot, or the slot of the longest-idle avatar if it has been idle long enough. */
  private promote(playerId: string, at: number): boolean {
    const teamId = this.members.get(playerId)!;
    const slots = this.slotsByTeam.get(teamId)!;
    const free = this.fillOrder(slots.length).find((index) => slots[index] === null) ?? -1;
    if (free !== -1) {
      this.assign(playerId, teamId, free);
      return true;
    }

    let victimIndex = -1;
    let victimActive = Number.POSITIVE_INFINITY;
    slots.forEach((occupant, index) => {
      const lastSeen = this.lastActive.get(occupant!) ?? Number.NEGATIVE_INFINITY;
      if (lastSeen < victimActive) {
        victimActive = lastSeen;
        victimIndex = index;
      }
    });
    if (victimIndex === -1 || at - victimActive < this.hysteresisMs) return false;

    this.release(slots[victimIndex]!);
    this.assign(playerId, teamId, victimIndex);
    return true;
  }

  private fillOrder(length: number): number[] {
    return this.arrangement === 'queue' ? Array.from({ length }, (_, index) => index) : fillOrder(length);
  }

  private assign(playerId: string, teamId: string, index: number): void {
    this.slotsByTeam.get(teamId)![index] = playerId;
    this.slotOfPlayer.set(playerId, { teamId, index });
    if (this.isLeaderSlot(teamId, index)) this.leaderSince.set(`${teamId}:${index}`, this.latest);
  }

  private release(playerId: string): void {
    const slot = this.slotOfPlayer.get(playerId);
    if (!slot) return;
    this.slotsByTeam.get(slot.teamId)![slot.index] = null;
    this.slotOfPlayer.delete(playerId);
  }
}
