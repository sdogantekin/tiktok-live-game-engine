import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type * as THREE from 'three';
import type { SceneProps } from '../../game-renderer/types';
import { racerColor, trackPoint, trackShape } from './track';

/** Metres on the track to world units: the whole oval fits the broadcast frame. */
const SCALE = 0.3;
const MAX_RACERS = 12;
const LANE_WIDTH = 1.1;

/**
 * PLACEHOLDER until Step 4.3: a flat top-down view of the race so the whole game can be played and reviewed from the
 * dashboard before any art exists. Horses are coloured boxes; 4.3 replaces the scene, the horses and the camera.
 */
export function Scene({ live }: SceneProps) {
  const shape = useMemo(() => trackShape(400), []);
  const racers = useRef<(THREE.Mesh | null)[]>([]);
  const shown = useRef(new Map<string, number>()); // racer id -> distance on screen, eased towards the server's

  useFrame((_, delta) => {
    const view = live.latest();
    const meshes = racers.current;
    if (!view || view.kind !== 'race') {
      meshes.forEach((mesh) => mesh && (mesh.visible = false));
      return;
    }
    const lapLength = view.lapLength;
    const seen = new Set<string>();
    view.racers.slice(0, MAX_RACERS).forEach((racer, lane) => {
      const mesh = meshes[lane];
      if (!mesh) return;
      seen.add(racer.id);
      const target = racer.distance;
      const before = shown.current.get(racer.id);
      // Ease towards the server's distance; snap when it jumps (a new race) so nobody races backwards.
      const eased = before === undefined || Math.abs(target - before) > lapLength / 2 ? target : before + (target - before) * Math.min(1, delta * 10);
      shown.current.set(racer.id, eased);
      const point = trackPoint(shape, eased, (lane - view.racers.length / 2) * LANE_WIDTH);
      mesh.visible = true;
      mesh.position.set(point.x * SCALE, 0.5, point.z * SCALE);
      mesh.rotation.y = point.heading;
      (mesh.material as THREE.MeshStandardMaterial).color.set(racerColor(racer.id));
    });
    for (const id of [...shown.current.keys()]) if (!seen.has(id)) shown.current.delete(id);
    for (let i = view.racers.length; i < meshes.length; i++) if (meshes[i]) meshes[i]!.visible = false;
  });

  const { radius, straight } = shape;
  return (
    <>
      <color attach="background" args={['#2d5a2d']} />
      <hemisphereLight args={['#ffffff', '#44603a', 1.4]} />
      <directionalLight position={[10, 30, 10]} intensity={1.2} />
      {/* the track: dirt, two straights and two half-circle bends round a grass infield */}
      {[-1, 1].map((end) => (
        <mesh key={end} position={[0, 0.01, (end * straight * SCALE) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[(radius - 4) * SCALE, (radius + 4) * SCALE, 48, 1, end > 0 ? Math.PI : 0, Math.PI]} />
          <meshStandardMaterial color="#9b7b4e" />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * radius * SCALE, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8 * SCALE, straight * SCALE]} />
          <meshStandardMaterial color="#9b7b4e" />
        </mesh>
      ))}
      {Array.from({ length: MAX_RACERS }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            racers.current[i] = mesh;
          }}
          visible={false}
        >
          <boxGeometry args={[0.9, 0.9, 1.8]} />
          <meshStandardMaterial />
        </mesh>
      ))}
    </>
  );
}
