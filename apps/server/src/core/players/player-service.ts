import { sanitizeDisplayName } from './display-name';

export interface Player {
  /** Stable key, e.g. `simulator:u123`. */
  readonly id: string;
  name: string;
  teamId: string | null;
  readonly joinedAt: number;
  lastActiveAt: number;
  ignored: boolean;
  stats: { actions: number; energy: number };
}

export type AssignResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'unknown_player' | 'ignored' | 'unknown_team' | 'switch_locked' };

export const DEFAULT_MAX_PLAYERS = 1000;

/** In-memory session participants: registration, team membership, per-player cooldowns. */
export class PlayerService {
  private readonly players = new Map<string, Player>();
  private readonly cooldowns = new Map<string, Map<string, number>>();
  private readonly teamCounts = new Map<string, number>();
  private ignoredCount = 0;

  constructor(
    teamIds: readonly string[],
    private readonly maxPlayers = DEFAULT_MAX_PLAYERS,
  ) {
    for (const id of teamIds) this.teamCounts.set(id, 0);
  }

  /** Registers a player or refreshes an existing one. Returns null if ignored or the session is full. */
  register(id: string, rawName: string, now: number): Player | null {
    const existing = this.players.get(id);
    if (existing) {
      if (existing.ignored) return null;
      existing.name = sanitizeDisplayName(rawName);
      existing.lastActiveAt = now;
      return existing;
    }
    if (this.players.size >= this.maxPlayers) return null;

    const player: Player = {
      id,
      name: sanitizeDisplayName(rawName),
      teamId: null,
      joinedAt: now,
      lastActiveAt: now,
      ignored: false,
      stats: { actions: 0, energy: 0 },
    };
    this.players.set(id, player);
    return player;
  }

  get(id: string): Player | undefined {
    return this.players.get(id);
  }

  /** Active (non-ignored) players in join order. */
  list(): Player[] {
    return [...this.players.values()].filter((player) => !player.ignored);
  }

  /** Number of active (non-ignored) players. */
  get count(): number {
    return this.players.size - this.ignoredCount;
  }

  countByTeam(teamId: string): number {
    return this.teamCounts.get(teamId) ?? 0;
  }

  /**
   * First assignment is always allowed. Changing team requires `allowSwitch` (the caller derives it
   * from the round phase, or passes true for an operator override).
   */
  assignTeam(id: string, teamId: string, options: { allowSwitch: boolean }): AssignResult {
    const player = this.players.get(id);
    if (!player) return { ok: false, reason: 'unknown_player' };
    if (player.ignored) return { ok: false, reason: 'ignored' };
    if (!this.teamCounts.has(teamId)) return { ok: false, reason: 'unknown_team' };
    if (player.teamId === teamId) return { ok: true, changed: false };
    if (player.teamId !== null && !options.allowSwitch) return { ok: false, reason: 'switch_locked' };

    this.leaveTeam(player);
    player.teamId = teamId;
    this.teamCounts.set(teamId, this.countByTeam(teamId) + 1);
    return { ok: true, changed: true };
  }

  /** Deletes the record entirely; the viewer can register again. */
  remove(id: string): boolean {
    const player = this.players.get(id);
    if (!player) return false;
    this.leaveTeam(player);
    if (player.ignored) this.ignoredCount--;
    this.players.delete(id);
    this.cooldowns.delete(id);
    return true;
  }

  /** Keeps a tombstone so the viewer cannot re-register, but drops them from teams and listings. */
  ignore(id: string): boolean {
    const player = this.players.get(id);
    if (!player || player.ignored) return false;
    this.leaveTeam(player);
    player.ignored = true;
    this.ignoredCount++;
    this.cooldowns.delete(id);
    return true;
  }

  /**
   * Starts the cooldown and returns true if it has elapsed (or never ran); otherwise returns false
   * and leaves the running cooldown untouched.
   */
  tryStartCooldown(id: string, key: string, cooldownMs: number, now: number): boolean {
    const player = this.players.get(id);
    if (!player || player.ignored) return false;

    let perPlayer = this.cooldowns.get(id);
    if (!perPlayer) {
      perPlayer = new Map();
      this.cooldowns.set(id, perPlayer);
    }
    const last = perPlayer.get(key);
    if (last !== undefined && now - last < cooldownMs) return false;
    perPlayer.set(key, now);
    return true;
  }

  recordAction(id: string, now: number, energy = 0): void {
    const player = this.players.get(id);
    if (!player) return;
    player.lastActiveAt = now;
    player.stats.actions++;
    player.stats.energy += energy;
  }

  private leaveTeam(player: Player): void {
    if (player.teamId === null) return;
    this.teamCounts.set(player.teamId, this.countByTeam(player.teamId) - 1);
    player.teamId = null;
  }
}
