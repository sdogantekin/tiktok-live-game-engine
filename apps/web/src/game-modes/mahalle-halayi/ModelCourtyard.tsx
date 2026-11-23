import { useLoader } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { perf } from '../../game-renderer/perf';
import { MODEL_URLS } from './assets.manifest';
import { Bunting } from './Courtyard';
import { courtyardLayout } from './scene-config';

const BUNTING: readonly { from: [number, number, number]; to: [number, number, number]; count: number }[] = [
  { from: [-5.2, 3.3, -3.5], to: [5.2, 3.3, -3.5], count: 14 },
  { from: [-5.2, 3.3, 5.5], to: [5.2, 3.3, 5.5], count: 14 },
  { from: [-5.2, 3.3, -3.5], to: [-5.2, 3.3, 5.5], count: 10 },
  { from: [5.2, 3.3, -3.5], to: [5.2, 3.3, 5.5], count: 10 },
];

/** The courtyard assembled from the modelled kit: named pieces placed from `courtyardLayout`. */
export function ModelCourtyard() {
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
    </>
  );
}
