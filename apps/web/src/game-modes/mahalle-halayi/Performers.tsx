import { useFrame, useLoader } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { orbitPose, stepSide } from '../../game-renderer/beat-clock';
import type { SlotsStore } from '../../game-renderer/avatar-store';
import { useClipPlayer } from '../../game-renderer/model-utils';
import type { AvatarModels } from '../../game-renderer/types';
import { MODEL_URLS } from './assets.manifest';
import { brideModels, couple, davulModels, groomModels, type Performer, musicians, zurnaModels } from './scene-config';

const MODELS: Readonly<Record<Performer['look'], AvatarModels>> = {
  bride: brideModels,
  groom: groomModels,
  davulcu: davulModels,
  zurnaci: zurnaModels,
};

function PerformerFigure({ performer, store }: { performer: Performer; store: SlotsStore }) {
  const models = MODELS[performer.look];
  const gltf = useLoader(GLTFLoader, MODEL_URLS.characters[performer.look]);
  const player = useClipPlayer(gltf, models);
  const clip = models.clips.idle;
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const { beats, bpm } = store.motion;
    const { orbit } = performer;
    let baseClip = clip;
    if (orbit && group.current) {
      // Side by side on the circle, facing its centre: the step goes whichever way round the circle they walk.
      const pose = orbitPose(beats, orbit);
      group.current.position.set(pose.x, performer.position[1], pose.z);
      group.current.rotation.y = pose.rotationY;
      if (models.lineSteps) baseClip = models.lineSteps[stepSide(pose.rotationY, pose.heading)];
    }
    player.update(delta, undefined, performance.now(), { baseClip, beats, bpm });
  });

  return (
    <group ref={group} position={[...performer.position]} rotation={[0, performer.rotationY, 0]} scale={performer.scale ?? 1}>
      <primitive object={player.object} />
    </group>
  );
}

/** The bride and groom dancing their own halay between the lines, and the traditional musicians on the stage. */
export function Performers({ store }: { store: SlotsStore }) {
  return (
    <>
      {[...couple, ...musicians].map((performer, i) => (
        <PerformerFigure key={i} performer={performer} store={store} />
      ))}
    </>
  );
}
