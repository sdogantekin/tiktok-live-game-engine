import { useFrame, useLoader } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useClipPlayer } from '../../game-renderer/model-utils';
import { type Figure, figures } from './scene-config';
import type { Reactions } from './trips';

function FigureView({ figure, reactions }: { figure: Figure; reactions: Reactions }) {
  const gltf = useLoader(GLTFLoader, figure.url);
  const player = useClipPlayer(gltf, figure.models);
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const now = performance.now();
    player.update(delta, reactions.playing(figure.id, now), now, { baseClip: figure.models.clips.idle, beats: 0, bpm: 120 });
  });

  return (
    <group ref={group} position={[...figure.position]} rotation={[0, figure.rotationY, 0]} scale={figure.scale}>
      <primitive object={player.object} />
    </group>
  );
}

/** The couple and the four parents on the podium; they react to what the guests do (see `Scene`). */
export function Ceremony({ reactions }: { reactions: Reactions }) {
  return (
    <>
      {figures.map((figure) => (
        <FigureView key={figure.id} figure={figure} reactions={reactions} />
      ))}
    </>
  );
}
