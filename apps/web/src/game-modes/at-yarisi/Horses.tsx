import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useClipPlayer } from '../../game-renderer/model-utils';
import { perf } from '../../game-renderer/perf';
import { BASE_SPEED, COATS, horseModels, laneOffset, MAX_RACERS, MAX_STRIDE, MIN_STRIDE, shape } from './scene-config';
import type { ShownRacer } from './smoothing';
import { racerColor, trackPoint } from './track';
import { HORSE_SCALE, MODEL_URLS } from './assets.manifest';
import type { PipRegistry } from './Pip';

/** What the scene works out once a frame for everyone to read: where every horse is. */
export interface HorseFrame {
  racers: readonly ShownRacer[];
  stage: 'grid' | 'racing' | 'finished' | null;
}

export const coatOf = (id: string): string => {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 33) + id.charCodeAt(i)) >>> 0;
  return COATS[h % COATS.length]!;
};

function Horse({ index, frame, pip }: { index: number; frame: { current: HorseFrame }; pip: PipRegistry }) {
  const gltf = useLoader(GLTFLoader, MODEL_URLS.horse);
  const player = useClipPlayer(gltf, horseModels);
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);
  const shownId = useRef<string | null>(null);
  const victoryAt = useRef<number | null>(null);
  const victoryStart = useRef({ kind: 'special' as const, start: 0, phase: 0 });

  // Each horse has its own copies of the coat and silks materials, so tinting one never colours the others.
  const materials = useMemo(() => {
    const found: { coat?: THREE.MeshStandardMaterial; silks?: THREE.MeshStandardMaterial } = {};
    player.object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.name === 'Coat' || mesh.name === 'Silks'; // the sun's real shadow (see Scene): only the horse and the jockey's silks cast it, which is all it takes to read
      if (mesh.name === 'Coat' || mesh.name === 'Silks') {
        // Idempotent (React may run this twice): keep the copy already made for this mesh.
        const own = (mesh.userData.tint as THREE.MeshStandardMaterial | undefined) ?? (mesh.material as THREE.MeshStandardMaterial).clone();
        mesh.userData.tint = own;
        mesh.material = own;
        found[mesh.name === 'Coat' ? 'coat' : 'silks'] = own;
      }
    });
    return found;
  }, [player.object]);

  useFrame((_, delta) => {
    const { racers, stage } = frame.current;
    const racer = racers[index];
    const root = group.current;
    if (!root) return;
    root.visible = racer !== undefined;
    root.userData.distance = racer?.distance; // for the small view, which only draws the horses near its subject
    if (glow.current) glow.current.visible = racer !== undefined;
    if (!racer) {
      shownId.current = null;
      return;
    }
    const now = performance.now();
    if (shownId.current !== racer.id) {
      shownId.current = racer.id;
      victoryAt.current = null;
      materials.coat?.color.set(coatOf(racer.id));
      materials.silks?.color.set(racerColor(racer.id));
      materials.silks?.emissive.set(racerColor(racer.id));
    }
    materials.silks?.setValues({ emissiveIntensity: Math.min(0.9, racer.boost * 1.2) }); // a boosted jockey glows in his own colours
    const point = trackPoint(shape, racer.distance, laneOffset(index, racers.length));
    root.position.set(point.x, 0, point.z);
    root.rotation.y = point.heading;
    if (glow.current) {
      glow.current.position.set(point.x, 0.08, point.z);
      (glow.current.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, racer.boost * 1.4);
      glow.current.visible = racer.boost > 0.05;
    }

    // The winner rears up when the race is over; everyone else stands.
    if (stage === 'finished' && racer.place === 1 && victoryAt.current === null) {
      victoryAt.current = now;
      victoryStart.current.start = now;
    }
    const celebrating = victoryAt.current !== null && now - victoryAt.current < 1700;
    const running = stage === 'racing' && racer.place === null && racer.speed > 1;
    const stride = Math.min(MAX_STRIDE, Math.max(MIN_STRIDE, racer.speed / BASE_SPEED));
    player.update(delta, celebrating ? victoryStart.current : undefined, now, {
      baseClip: running || (racer.place !== null && racer.speed > 1) ? 'gallop' : 'idle',
      beats: 0,
      bpm: 120 * stride,
      followTempo: true,
    });
  });

  return (
    <>
      <group
        ref={(root) => {
          group.current = root;
          if (!root) return;
          pip.addHorse(root);
          return () => pip.removeHorse(root);
        }}
        visible={false}
      >
        <group scale={HORSE_SCALE}>
          <primitive object={player.object} />
        </group>
      </group>
      <mesh ref={glow} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.6, 2.2, 22]} />
        <meshBasicMaterial color="#ffd35a" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

/** One animated horse and jockey for every place on the grid. Suspends while the model loads. */
export function Horses({ frame, pip }: { frame: { current: HorseFrame }; pip: PipRegistry }) {
  useEffect(() => {
    perf.modelsLoaded.avatars = true;
    return () => {
      perf.modelsLoaded.avatars = false;
    };
  }, []);
  return (
    <>
      {Array.from({ length: MAX_RACERS }, (_, i) => (
        <Horse key={i} index={i} frame={frame} pip={pip} />
      ))}
    </>
  );
}
