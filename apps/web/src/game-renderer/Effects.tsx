import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { SlotsStore } from './avatar-store';
import type { EffectDirector } from './effect-director';
import { ConfettiPool, RingPool, type RingState } from './effect-sim';
import { perf } from './perf';
import type { Vec3 } from './types';

const PARTICLES = 400;
const RINGS = 8;
const CENTER: Vec3 = [0, 0.8, 0.5];

/** Confetti and expanding rings for celebrations, driven by the effect director's accepted effects. */
export function Effects({ director, store }: { director: EffectDirector; store: SlotsStore }) {
  const confettiMesh = useRef<THREE.InstancedMesh>(null);
  const ringMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const confetti = useMemo(() => new ConfettiPool(PARTICLES), []);
  const rings = useMemo(() => new RingPool(RINGS), []);
  const scratch = useMemo<RingState>(() => ({ visible: false, x: 0, z: 0, scale: 1, opacity: 1, color: new THREE.Color() }), []);
  const ringMaterials = useMemo(
    () => Array.from({ length: RINGS }, () => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })),
    [],
  );

  useEffect(
    () =>
      director.subscribe(({ recipe, playerId }) => {
        const now = performance.now();
        const at = (origin: 'player' | 'center'): Vec3 => (origin === 'player' && playerId ? (store.positionOf(playerId) ?? CENTER) : CENTER);
        if (recipe.confetti) {
          confetti.spawn({ ...recipe.confetti, origin: at(recipe.confetti.origin) }, now, confettiMesh.current);
        }
        if (recipe.rings) rings.spawn(recipe.rings.count, recipe.rings.color, at(recipe.rings.origin), now);
      }),
    [director, store, confetti, rings],
  );

  useFrame((_, delta) => {
    const now = performance.now();
    director.update(now);
    perf.effectsStarted = director.started;

    if (confettiMesh.current) confetti.step(confettiMesh.current, now, delta);

    ringMeshes.current.forEach((mesh, i) => {
      if (!mesh) return;
      const ring = rings.state(i, now, scratch);
      mesh.visible = ring.visible;
      if (!ring.visible) return;
      mesh.position.set(ring.x, 0.08, ring.z);
      mesh.scale.setScalar(ring.scale);
      ringMaterials[i]!.color.copy(ring.color);
      ringMaterials[i]!.opacity = ring.opacity;
    });
  });

  return (
    <>
      <instancedMesh ref={confettiMesh} args={[undefined, undefined, PARTICLES]} frustumCulled={false}>
        <boxGeometry args={[1, 0.6, 0.05]} />
        <meshBasicMaterial />
      </instancedMesh>
      {ringMaterials.map((material, i) => (
        <mesh
          key={i}
          ref={(node) => {
            ringMeshes.current[i] = node;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          material={material}
          visible={false}
        >
          <ringGeometry args={[0.85, 1, 48]} />
        </mesh>
      ))}
    </>
  );
}
