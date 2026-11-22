import { AvatarSlots, type SlotRosterEntry } from './avatar-slots';
import type { Cue } from './cue-bus';
import type { EffectStart } from './effect-director';
import type { AnimKind, Formation, Vec3 } from './types';

export interface Anim {
  kind: AnimKind;
  start: number;
  duration: number;
  /** Per-animation random phase so avatars do not move in lockstep. */
  phase: number;
}

const DURATIONS: Record<AnimKind, number> = { halay: 1200, zipla: 750, spin: 1400, wiggle: 900, hop: 750, rose: 1250 };

export interface SlotsStoreOptions {
  teamIds: readonly string[];
  capTotal: number;
  formation: Formation;
  random?: () => number;
}

/**
 * Mutable scene state shared by the avatar, crowd and effect components: who has an avatar, where it
 * stands, and which animation each avatar is playing. It lives outside React so per-frame animation
 * and bursts of cues never trigger re-renders.
 */
export class SlotsStore {
  readonly slots: AvatarSlots;
  readonly anims = new Map<string, Anim>();
  private readonly random: () => number;

  constructor(private readonly options: SlotsStoreOptions) {
    this.slots = new AvatarSlots({ teamIds: options.teamIds, capTotal: options.capTotal });
    this.random = options.random ?? Math.random;
  }

  setRoster(roster: readonly SlotRosterEntry[]): void {
    this.slots.setRoster(roster);
    for (const id of this.anims.keys()) {
      if (!this.slots.slotOf(id)) this.anims.delete(id);
    }
  }

  handleCue(cue: Cue, now: number): void {
    switch (cue.type) {
      case 'player_joined':
        this.slots.noteActivity(cue.playerId, now);
        break;
      case 'player_action': {
        this.slots.noteActivity(cue.playerId, now);
        if (!this.slots.slotOf(cue.playerId)) break; // represented by the crowd
        const kind: AnimKind =
          cue.animation === 'halay' ? 'halay' : cue.animation === 'zipla' ? 'zipla' : this.random() < 0.5 ? 'spin' : 'wiggle';
        this.play(cue.playerId, kind, now);
        break;
      }
      default:
        break;
    }
  }

  handleEffect(start: EffectStart): void {
    if (start.recipe.avatars === 'hop-all') {
      for (const teamId of this.options.teamIds) {
        for (const id of this.slots.slots(teamId)) if (id) this.play(id, 'hop', start.at);
      }
    } else if (start.recipe.avatars === 'spin-player' && start.playerId && this.slots.slotOf(start.playerId)) {
      this.play(start.playerId, 'rose', start.at);
    }
  }

  /** World position of a player's avatar, or null if they are in the crowd. */
  positionOf(playerId: string): Vec3 | null {
    const slot = this.slots.slotOf(playerId);
    if (!slot) return null;
    return this.placement(slot.teamId, slot.index).position;
  }

  placement(teamId: string, index: number) {
    return this.options.formation.avatar(teamId, index, this.slots.slots(teamId).length);
  }

  private play(playerId: string, kind: AnimKind, start: number): void {
    this.anims.set(playerId, { kind, start, duration: DURATIONS[kind], phase: this.random() * Math.PI * 2 });
  }
}
