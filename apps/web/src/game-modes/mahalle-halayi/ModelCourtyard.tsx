import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { EffectDirector } from '../../game-renderer/effect-director';
import { useClipPlayer } from '../../game-renderer/model-utils';
import { perf } from '../../game-renderer/perf';
import { MODEL_URLS } from './assets.manifest';
import { Bunting } from './Courtyard';
import { bandModels, bandPositions, courtyardLayout } from './scene-config';

type Gltf = Awaited<ReturnType<GLTFLoader['loadAsync']>>;

interface BandBoost {
  start: number;
  until: number;
}

function Musician({ gltf, position, boost }: { gltf: Gltf; position: readonly [number, number, number]; boost: BandBoost }) {
  const player = useClipPlayer(gltf, bandModels);
  useFrame((_, delta) => {
    const now = performance.now();
    player.update(delta, now < boost.until ? { kind: 'wiggle', start: boost.start, phase: position[0] } : undefined, now);
  });
  return (
    <group position={[...position]}>
      <primitive object={player.object} />
    </group>
  );
}

/** The band: idle by default, dancing while a big celebration is on. */
function Band({ director }: { director: EffectDirector }) {
  const gltf = useLoader(GLTFLoader, MODEL_URLS.characters.band);
  const boost = useMemo<BandBoost>(() => ({ start: 0, until: 0 }), []);
  useEffect(
    () =>
      director.subscribe((start) => {
        if (start.recipe.musicians === 'bounce') {
          boost.start = performance.now();
          boost.until = boost.start + 4000;
        }
      }),
    [director, boost],
  );
  return (
    <>
      {bandPositions.map((position, i) => (
        <Musician key={i} gltf={gltf} position={position} boost={boost} />
      ))}
    </>
  );
}

const BUNTING: readonly { from: [number, number, number]; to: [number, number, number]; count: number }[] = [
  { from: [-5.2, 3.3, -3.5], to: [5.2, 3.3, -3.5], count: 14 },
  { from: [-5.2, 3.3, 5.5], to: [5.2, 3.3, 5.5], count: 14 },
  { from: [-5.2, 3.3, -3.5], to: [-5.2, 3.3, 5.5], count: 10 },
  { from: [5.2, 3.3, -3.5], to: [5.2, 3.3, 5.5], count: 10 },
];

/** The courtyard assembled from the modelled kit: named pieces placed from `courtyardLayout`. */
export function ModelCourtyard({ director }: { director: EffectDirector }) {
  const gltf = useLoader(GLTFLoader, MODEL_URLS.courtyard);

  const pieces = useMemo(
    () =>
      courtyardLayout.map(({ piece, position, rotationY = 0, castShadow = false }) => {
        const source = gltf.scene.getObjectByName(piece);
        if (!source) throw new Error(`Courtyard kit is missing "${piece}"`);
        const object = source.clone();
        object.position.set(...position);
        object.rotation.y = rotationY;
        object.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            node.castShadow = castShadow;
            node.receiveShadow = true;
          }
        });
        return object;
      }),
    [gltf],
  );

  useEffect(() => {
    perf.modelsLoaded.courtyard = true;
    return () => {
      perf.modelsLoaded.courtyard = false;
    };
  }, []);

  return (
    <>
      {pieces.map((object, i) => (
        <primitive key={i} object={object} />
      ))}
      {BUNTING.map((line, i) => (
        <Bunting key={i} {...line} />
      ))}
      <Band director={director} />
    </>
  );
}
