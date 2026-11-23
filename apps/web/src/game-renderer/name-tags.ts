import * as THREE from 'three';
import type { CameraConfig, Formation, Vec3 } from './types';

/** Point on the 9:16 stage as fractions of its width and height (0,0 = top-left). Independent of pixel size. */
export interface StagePoint {
  x: number;
  y: number;
}

const STAGE_ASPECT = 9 / 16;

/** Projects a world point through the fixed broadcast camera onto the stage. */
export function projectToStage(camera: CameraConfig, point: Vec3): StagePoint {
  return projector(camera)(point);
}

function projector(camera: CameraConfig) {
  const cam = new THREE.PerspectiveCamera(camera.fov, STAGE_ASPECT, 0.5, 120);
  cam.position.set(...camera.position);
  cam.lookAt(...camera.lookAt);
  cam.updateMatrixWorld();
  return (point: Vec3): StagePoint => {
    const projected = new THREE.Vector3(...point).project(cam);
    return { x: (projected.x + 1) / 2, y: (1 - projected.y) / 2 };
  };
}

export interface TagAnchor {
  /** Quiet always-on tag: beside the avatar, on the side facing the middle of the scene. */
  small: StagePoint;
  /** Emphasised tag: centred above the avatar's head. */
  big: StagePoint;
  /** Which way the small tag's text runs from its anchor. */
  side: 'left' | 'right';
  /** How far the tag moves on the stage (fractions of its size) per metre the avatar moves along x and along z. */
  perMetre: { x: StagePoint; z: StagePoint };
}

const SMALL_HEIGHT = 1.1; // metres above the ground: about chest height
const BIG_HEIGHT = 2.1; // above the head and accessory
const INWARD_OFFSET = 0.5; // metres toward the middle of the scene

/** Screen anchors for every avatar slot, computed once from the camera and the mode's formation. */
export function computeTagAnchors(camera: CameraConfig, formation: Formation, slotCounts: Readonly<Record<string, number>>): Record<string, TagAnchor> {
  const project = projector(camera);
  const anchors: Record<string, TagAnchor> = {};
  for (const [teamId, count] of Object.entries(slotCounts)) {
    for (let index = 0; index < count; index++) {
      const [x, , z] = formation.avatar(teamId, index, count).position;
      const inward = x < 0 ? 1 : -1; // avatars on the left put the tag to their right, and vice versa
      const small = project([x + inward * INWARD_OFFSET, SMALL_HEIGHT, z]);
      // The lines walk up and down the courtyard; a tag follows with this (nearly linear) screen movement per metre.
      const alongX = project([x + inward * INWARD_OFFSET + 1, SMALL_HEIGHT, z]);
      const alongZ = project([x + inward * INWARD_OFFSET, SMALL_HEIGHT, z + 1]);
      anchors[slotKey(teamId, index)] = {
        small,
        big: project([x, BIG_HEIGHT, z]),
        side: inward === 1 ? 'right' : 'left',
        perMetre: { x: { x: alongX.x - small.x, y: alongX.y - small.y }, z: { x: alongZ.x - small.x, y: alongZ.y - small.y } },
      };
    }
  }
  return anchors;
}

export const slotKey = (teamId: string, index: number) => `${teamId}-${index}`;

export interface TagLabel {
  key: string;
  name: string;
  teamId: string;
  side: 'left' | 'right';
  small: StagePoint;
  big: StagePoint;
  perMetre: TagAnchor['perMetre'];
  /** The player leading their team's line. */
  leader: boolean;
  /** What this player just said, shown as a speech bubble for a few seconds, or null. */
  bubble: string | null;
  emphasized: boolean;
}

/** Where a tag has moved to on the stage when its line is `travel` metres away from home. */
export function tagShift(perMetre: TagAnchor['perMetre'], travel: Vec3): StagePoint {
  return { x: travel[0] * perMetre.x.x + travel[2] * perMetre.z.x, y: travel[0] * perMetre.x.y + travel[2] * perMetre.z.y };
}

export interface SlotOccupant {
  slotKey: string;
  playerId: string | null;
  name: string;
  teamId: string;
  leader?: boolean;
}

export const DEFAULT_EMPHASIS_MS = 2500;
/** How long a speech bubble stays, and how many may be on screen at once (the oldest makes room for a new one). */
export const BUBBLE_MS = 4500;
export const MAX_BUBBLES = 3;

/**
 * What the name-tag layer shows: one label per occupied avatar slot, and which of them are currently
 * emphasised. Plain observable state (no React), so the 3D scene can feed it and the DOM layer can read it.
 */
export class TagBoard {
  private labels: readonly TagLabel[] = [];
  private readonly emphasizedUntil = new Map<string, number>(); // player id -> time
  private readonly bubbles = new Map<string, { text: string; until: number }>(); // player id -> what they said
  private readonly listeners = new Set<() => void>();
  private occupants: readonly SlotOccupant[] = [];
  /** How far the avatar lines are from home right now (world metres); set every frame by the scene. */
  travel: Vec3 = [0, 0, 0];

  constructor(
    private readonly anchors: Readonly<Record<string, TagAnchor>>,
    private readonly now: () => number = () => performance.now(),
    private readonly emphasisMs = DEFAULT_EMPHASIS_MS,
  ) {}

  setTravel(travel: Vec3): void {
    this.travel = travel;
  }

  /** Call whenever slot assignments or names may have changed. Only notifies if something visible changed. */
  setOccupants(occupants: readonly SlotOccupant[]): void {
    this.occupants = occupants;
    this.refresh();
  }

  /** A player did something visible: show their tag prominently for a moment. */
  emphasize(playerId: string): void {
    this.emphasizedUntil.set(playerId, this.now() + this.emphasisMs);
    this.refresh();
  }

  /** A player said something: show it as a speech bubble above their character for a few seconds. */
  say(playerId: string, text: string, ms = BUBBLE_MS): void {
    if (!this.occupants.some((occupant) => occupant.playerId === playerId)) return; // no avatar on stage: nothing to speak from
    this.bubbles.delete(playerId);
    this.bubbles.set(playerId, { text, until: this.now() + ms });
    while (this.bubbles.size > MAX_BUBBLES) {
      let oldest: string | null = null;
      for (const [id, bubble] of this.bubbles) if (oldest === null || bubble.until < this.bubbles.get(oldest)!.until) oldest = id;
      this.bubbles.delete(oldest!);
    }
    this.refresh();
  }

  /** Expires old emphasis and bubbles. Call a few times per second. */
  tick(): void {
    const now = this.now();
    for (const [playerId, until] of this.emphasizedUntil) if (until <= now) this.emphasizedUntil.delete(playerId);
    for (const [playerId, bubble] of this.bubbles) if (bubble.until <= now) this.bubbles.delete(playerId);
    this.refresh();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Stable between changes, as `useSyncExternalStore` requires. */
  getSnapshot = (): readonly TagLabel[] => this.labels;

  private liveBubble(playerId: string | null, now: number): string | null {
    const bubble = playerId === null ? undefined : this.bubbles.get(playerId);
    return bubble && bubble.until > now ? bubble.text : null;
  }

  private refresh(): void {
    const now = this.now();
    const next: TagLabel[] = [];
    for (const occupant of this.occupants) {
      const anchor = this.anchors[occupant.slotKey];
      if (!anchor || occupant.playerId === null) continue;
      next.push({
        key: occupant.slotKey,
        name: occupant.name,
        teamId: occupant.teamId,
        side: anchor.side,
        small: anchor.small,
        big: anchor.big,
        perMetre: anchor.perMetre,
        leader: occupant.leader === true,
        bubble: this.liveBubble(occupant.playerId, now),
        emphasized: (this.emphasizedUntil.get(occupant.playerId) ?? 0) > now,
      });
    }
    const changed =
      next.length !== this.labels.length ||
      next.some((label, i) => {
        const old = this.labels[i];
        return !old || old.key !== label.key || old.name !== label.name || old.teamId !== label.teamId || old.leader !== label.leader || old.bubble !== label.bubble || old.emphasized !== label.emphasized;
      });
    if (!changed) return;
    this.labels = next;
    for (const listener of this.listeners) listener();
  }
}
