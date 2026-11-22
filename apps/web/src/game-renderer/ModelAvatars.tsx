import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useClipPlayer } from './model-utils';
import type { SlotsStore } from './avatar-store';
import { perf } from './perf';
import type { AvatarModels } from './types';

type Gltf = GLTF;

function ModelAvatar({ store, teamId, index, gltf, models }: { store: SlotsStore; teamId: string; index: number; gltf: Gltf; models: AvatarModels }) {
  const root = useRef<THREE.Group>(null);
  const occupant = useRef<string | null>(null);
  const spawnedAt = useRef(0);
  const placement = useMemo(() => store.placement(teamId, index), [store, teamId, index]);
  const player = useClipPlayer(gltf, models);

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
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
    const anim = store.anims.get(id);
    player.update(delta, anim && now - anim.start < anim.duration ? anim : undefined, now);
    group.scale.setScalar(Math.min(1, (now - spawnedAt.current) / 300)); // new avatars pop in
  });

  return (
    <group ref={root} position={[...placement.position]} rotation={[0, placement.rotationY, 0]} visible={false}>
      <primitive object={player.object} />
    </group>
  );
}

/** One rigged, animated character per slot. Suspends while the models load. */
export function ModelAvatars({ store, teamIds, models }: { store: SlotsStore; teamIds: readonly string[]; models: AvatarModels }) {
  const urls = teamIds.map((teamId) => models.urls[teamId]!);
  const gltfs = useLoader(GLTFLoader, urls);
  useEffect(() => {
    perf.modelsLoaded.avatars = true;
    return () => {
      perf.modelsLoaded.avatars = false;
    };
  }, []);

  return (
    <>
      {teamIds.flatMap((teamId, teamIndex) =>
        store.slots.slots(teamId).map((_, index) => (
          <ModelAvatar key={`${teamId}-${index}`} store={store} teamId={teamId} index={index} gltf={gltfs[teamIndex]!} models={models} />
        )),
      )}
    </>
  );
}

