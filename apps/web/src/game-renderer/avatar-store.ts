import { AvatarSlots, type SlotRosterEntry } from './avatar-slots';
import type { Cue } from './cue-bus';
import type { EffectStart } from './effect-director';
import type { AnimationRules, AnimKind, Formation, LineMotion, Vec3 } from './types';

export interface Anim {
  kind: AnimKind;
  start: number;
  duration: number;
  /** Per-animation random phase so avatars do not move in lockstep. */
  phase: number;
}

export interface SlotsStoreOptions {
  teamIds: readonly string[];
  capTotal: number;
  formation: Formation;
  animations: AnimationRules;
  /** A dance line (default) or a queue; see `AvatarSlotOptions.arrangement`. */
  arrangement?: 'line' | 'queue';
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
  /** The travelling halay lines and the shared beat; updated by the scene every frame. */
  motion: LineMotion = { offset: [0, 0, 0], heading: [0, 1], beats: 0, bpm: 120 };
  private readonly random: () => number;

  constructor(private readonly options: SlotsStoreOptions) {
    this.slots = new AvatarSlots({ teamIds: options.teamIds, capTotal: options.capTotal, arrangement: options.arrangement });
    this.random = options.random ?? Math.random;
  }

  setMotion(motion: LineMotion): void {
    this.motion = motion;
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
      case 'chat': // talking counts as taking part: a chatty player earns an avatar
        this.slots.noteActivity(cue.playerId, now);
        break;
      case 'player_action': {
        this.slots.noteActivity(cue.playerId, now);
        if (!this.slots.slotOf(cue.playerId)) break; // represented by the crowd
        const kind = this.options.animations.forAction(cue.animation, this.random);
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
      this.play(start.playerId, 'special', start.at);
    }
  }

  /** World position of a player's avatar (following the travelling line), or null if they are in the crowd. */
  positionOf(playerId: string): Vec3 | null {
    const slot = this.slots.slotOf(playerId);
    if (!slot) return null;
    const [x, y, z] = this.placement(slot.teamId, slot.index).position;
    const [ox, oy, oz] = this.motion.offset;
    return [x + ox, y + oy, z + oz];
  }

  placement(teamId: string, index: number) {
    return this.options.formation.avatar(teamId, index, this.slots.slots(teamId).length);
  }

  private play(playerId: string, kind: AnimKind, start: number): void {
    this.anims.set(playerId, { kind, start, duration: this.options.animations.durations[kind], phase: this.random() * Math.PI * 2 });
  }
}
