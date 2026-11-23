import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { stepSide } from './beat-clock';
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
    const { offset, heading, beats, bpm } = store.motion;
    group.position.set(placement.position[0] + offset[0], placement.position[1] + offset[1], placement.position[2] + offset[2]);

    // While nothing special is happening the whole line does the halay step towards where the line is walking.
    const steps = models.lineSteps;
    const baseClip = steps ? steps[stepSide(placement.rotationY, heading)] : models.clips.idle;
    const anim = store.anims.get(id);
    player.update(delta, anim && now - anim.start < anim.duration ? anim : undefined, now, { baseClip, beats, bpm });
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
  const { leader, tailLeader } = models;
  // Team models first, then (if the game has line leaders) each team's leader models, in the same team order.
  const variants = [models, ...(leader ? [leader] : []), ...(tailLeader ? [tailLeader] : [])];
  const urls = variants.flatMap((variant) => teamIds.map((teamId) => variant.urls[teamId]!));
  const offsetOf = (variant: AvatarModels | undefined) => (variant ? variants.indexOf(variant) * teamIds.length : 0);
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
        store.slots.slots(teamId).map((_, index, all) => {
          // The first and last slots lead the line, one at each end; they use the leader models (with the mendil).
          const variant = index === 0 && leader ? leader : index === all.length - 1 && all.length > 1 && tailLeader ? tailLeader : models;
          return (
            <ModelAvatar
              key={`${teamId}-${index}`}
              store={store}
              teamId={teamId}
              index={index}
              gltf={gltfs[offsetOf(variant === models ? undefined : variant) + teamIndex]!}
              models={variant}
            />
          );
        }),
      )}
    </>
  );
}
