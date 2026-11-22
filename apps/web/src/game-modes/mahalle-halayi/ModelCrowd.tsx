import { useLoader } from '@react-three/fiber';
import { type ComponentProps, useEffect, useMemo } from 'react';
import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Crowd } from '../../game-renderer/Crowd';
import { perf } from '../../game-renderer/perf';
import { MODEL_URLS } from './assets.manifest';

/** The crowd drawn from the modelled figure (two instanced meshes per team). */
export function ModelCrowd(props: Omit<ComponentProps<typeof Crowd>, 'geometries'>) {
  const gltf = useLoader(GLTFLoader, MODEL_URLS.crowd);
  const geometries = useMemo(() => {
    const geometryOf = (name: string) => {
      const mesh = gltf.scene.getObjectByName(name) as THREE.Mesh | undefined;
      if (!mesh?.geometry) throw new Error(`Crowd model is missing "${name}"`);
      return mesh.geometry;
    };
    return { body: geometryOf('CrowdBody'), head: geometryOf('CrowdHead') };
  }, [gltf]);

  useEffect(() => {
    perf.modelsLoaded.crowd = true;
    return () => {
      perf.modelsLoaded.crowd = false;
    };
  }, []);

  return <Crowd {...props} geometries={geometries} />;
}
