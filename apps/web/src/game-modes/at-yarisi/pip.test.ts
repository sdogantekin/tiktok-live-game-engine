import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PipRegistry } from './Pip';

describe('PipRegistry', () => {
  it('hides what registered and puts back exactly what was visible before', () => {
    const registry = new PipRegistry();
    const shown = new THREE.Group();
    const alreadyHidden = new THREE.Group();
    alreadyHidden.visible = false;
    registry.add(shown);
    registry.add(alreadyHidden);
    registry.hide();
    expect(shown.visible).toBe(false);
    expect(alreadyHidden.visible).toBe(false);
    registry.show();
    expect(shown.visible).toBe(true);
    expect(alreadyHidden.visible).toBe(false); // it was hidden before, and stays so
  });

  it('hides the horses far from the focus and keeps the near ones', () => {
    const registry = new PipRegistry();
    const make = (distance: number) => {
      const group = new THREE.Group();
      group.userData.distance = distance;
      registry.addHorse(group);
      return group;
    };
    const near = make(2390);
    const far = make(2000);
    const unknown = new THREE.Group(); // a horse with no distance yet is left alone
    registry.addHorse(unknown);
    registry.hide(2400, 45);
    expect(near.visible).toBe(true);
    expect(far.visible).toBe(false);
    expect(unknown.visible).toBe(true);
    registry.show();
    expect(far.visible).toBe(true);
  });

  it('forgets a group that is removed (it is no longer touched)', () => {
    const registry = new PipRegistry();
    const group = new THREE.Group();
    registry.add(group);
    registry.remove(group);
    registry.hide();
    expect(group.visible).toBe(true);
  });
});
