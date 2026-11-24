import type { ReactNode } from 'react';
import type * as THREE from 'three';

/**
 * The parts of the scene the small picture-in-picture does not draw (the crowd, scenery, skyline and effects), so its extra pass over the scene
 * stays cheap. Groups register themselves; `hide` switches them off for the small view's render and `show` puts them back.
 */
export class PipRegistry {
  private readonly items = new Set<THREE.Object3D>();
  private readonly was = new Map<THREE.Object3D, boolean>();
  /** Horses, each carrying `userData.distance` (metres run): the small view only draws those near its subject. */
  private readonly horses = new Set<THREE.Object3D>();

  add(item: THREE.Object3D): void {
    this.items.add(item);
  }

  remove(item: THREE.Object3D): void {
    this.items.delete(item);
    this.was.delete(item);
  }

  addHorse(item: THREE.Object3D): void {
    this.horses.add(item);
  }

  removeHorse(item: THREE.Object3D): void {
    this.horses.delete(item);
    this.was.delete(item);
  }

  /** Hides everything registered, and every horse more than `range` metres (along the track) from `focus`. */
  hide(focus = Infinity, range = 45): void {
    for (const horse of this.horses) {
      const distance = horse.userData.distance as number | undefined;
      if (distance !== undefined && Math.abs(distance - focus) > range) {
        this.was.set(horse, horse.visible);
        horse.visible = false;
      }
    }
    for (const item of this.items) {
      this.was.set(item, item.visible);
      item.visible = false;
    }
  }

  show(): void {
    for (const [item, visible] of this.was) item.visible = visible;
    this.was.clear();
  }
}

/** Children that the picture-in-picture leaves out. */
export function HiddenInPip({ registry, children }: { registry: PipRegistry; children: ReactNode }) {
  return (
    <group
      ref={(group) => {
        if (!group) return;
        registry.add(group);
        return () => registry.remove(group);
      }}
    >
      {children}
    </group>
  );
}
