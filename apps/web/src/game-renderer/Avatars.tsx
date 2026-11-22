import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Anim, SlotsStore } from './avatar-store';
import type { AvatarLook } from './types';

/** One vertex-coloured mesh per avatar (body, head, accessory merged), so 24 avatars cost 24 draw calls, not 72. */
function buildAvatarGeometry(look: AvatarLook): THREE.BufferGeometry {
  const part = (geometry: THREE.BufferGeometry, color: string, y: number) => {
    geometry.translate(0, y, 0);
    const rgb = new THREE.Color(color);
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) rgb.toArray(colors, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  };
  const parts = [
    part(new THREE.CapsuleGeometry(0.28, 0.5, 4, 8), look.bodyColor, 0.53),
    part(new THREE.SphereGeometry(0.24, 12, 10), look.headColor, 1.3),
  ];
  if (look.accessory === 'cone') parts.push(part(new THREE.ConeGeometry(0.3, 0.55, 8), look.accessoryColor, 1.65));
  if (look.accessory === 'cylinder') parts.push(part(new THREE.CylinderGeometry(0.17, 0.22, 0.24, 10), look.accessoryColor, 1.55));
  return mergeGeometries(parts, false);
}

const AVATAR_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75 });

interface Pose {
  x: number;
  y: number;
  rotY: number;
  squash: number;
}

/** Procedural animation for primitive avatars; real clips replace this when models arrive. */
function pose(anim: Anim | undefined, now: number, idle: number): Pose {
  const base: Pose = { x: 0, y: 0.04 * Math.sin(idle * 2.2), rotY: 0, squash: 1 };
  if (!anim) return base;
  const elapsed = now - anim.start;
  if (elapsed >= anim.duration) return base;
  const p = elapsed / anim.duration;
  const arc = Math.sin(Math.PI * p);

  switch (anim.kind) {
    case 'halay': {
      const step = elapsed / 1000 * 7 + anim.phase;
      return { x: 0.14 * Math.sin(step), y: 0.12 * Math.abs(Math.sin(step)), rotY: 0.12 * Math.sin(step * 0.5), squash: 1 };
    }
    case 'zipla':
      return { x: 0, y: 0.95 * arc, rotY: 0, squash: 1 + 0.12 * Math.cos(Math.PI * 2 * p) * (1 - p) };
    case 'spin':
      return { x: 0, y: 0.25 * arc, rotY: Math.PI * 2 * p, squash: 1 };
    case 'wiggle':
      return { x: 0.1 * Math.sin(p * Math.PI * 8), y: 0.08 * arc, rotY: 0.35 * Math.sin(p * Math.PI * 6), squash: 1 + 0.1 * Math.sin(p * Math.PI * 8) };
    case 'hop':
      return { x: 0, y: 0.6 * Math.abs(Math.sin(p * Math.PI * 2)) * (1 - p * 0.3), rotY: 0, squash: 1 };
  }
}

function Avatar({ store, teamId, index, geometry }: {
  store: SlotsStore;
  teamId: string;
  index: number;
  geometry: THREE.BufferGeometry;
}) {
  const root = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const occupant = useRef<string | null>(null);
  const spawnedAt = useRef(0);
  const placement = useMemo(() => store.placement(teamId, index), [store, teamId, index]);

  useFrame(() => {
    const group = root.current;
    const animated = inner.current;
    if (!group || !animated) return;

    const id = store.slots.slots(teamId)[index] ?? null;
    group.visible = id !== null;
    if (id === null) {
      occupant.current = null;
      return;
    }
    const now = performance.now();
    if (occupant.current !== id) {
      occupant.current = id;
      spawnedAt.current = now;
    }
    const next = pose(store.anims.get(id), now, now / 1000 + index * 0.7);
    const pop = Math.min(1, (now - spawnedAt.current) / 300); // new avatars pop in
    animated.position.set(next.x, next.y, 0);
    animated.rotation.y = next.rotY;
    animated.scale.set(pop / Math.sqrt(next.squash), pop * next.squash, pop / Math.sqrt(next.squash));
  });

  return (
    <group ref={root} position={[...placement.position]} rotation={[0, placement.rotationY, 0]} visible={false}>
      <group ref={inner}>
        <mesh geometry={geometry} material={AVATAR_MATERIAL} castShadow />
      </group>
    </group>
  );
}

/** One animated avatar per slot. Slot assignment and animation state live in the store, not in React state. */
export function Avatars({ store, teamIds, looks }: { store: SlotsStore; teamIds: readonly string[]; looks: Readonly<Record<string, AvatarLook>> }) {
  const geometries = useMemo(() => Object.fromEntries(teamIds.map((teamId) => [teamId, buildAvatarGeometry(looks[teamId]!)])), [teamIds, looks]);

  return (
    <>
      {teamIds.flatMap((teamId) =>
        store.slots.slots(teamId).map((_, index) => (
          <Avatar key={`${teamId}-${index}`} store={store} teamId={teamId} index={index} geometry={geometries[teamId]!} />
        )),
      )}
    </>
  );
}
