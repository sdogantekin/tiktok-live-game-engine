import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { Dressing } from './Dressing';
import type { GateState } from './gate';
import { HiddenInPip, type PipRegistry } from './Pip';
import { Grandstand, seeded } from './Grandstand';
import { Parcours } from './Parcours';
import { shape, TRACK_HALF_WIDTH } from './scene-config';
import { trackPoint } from './track';

/** The chequered edge of the start/finish line: one instanced mesh of black squares (the white line itself is drawn separately). */
function ChequeredEdge() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const line = trackPoint(shape, 0);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 17; i++) {
      dummy.position.set(line.x - TRACK_HALF_WIDTH + 0.5 + i * 1, 0.07, line.z + (i % 2 === 0 ? -0.3 : 0.3));
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(0.6, 0.6, 1);
      dummy.updateMatrix();
      mesh.current?.setMatrixAt(i, dummy.matrix);
    }
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, 17]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial color="#1c1420" />
    </instancedMesh>
  );
}

/** A ring of city buildings in the distance and one tall observation tower: original shapes, nothing copied from a real place. */
function Skyline() {
  const buildings = useRef<THREE.InstancedMesh>(null);
  const count = 46;
  useLayoutEffect(() => {
    const rnd = seeded(21);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 200 + rnd() * 40;
      const h = 8 + rnd() * 22;
      dummy.position.set(Math.cos(angle) * radius, h / 2, Math.sin(angle) * radius);
      dummy.scale.set(10 + rnd() * 10, h, 10 + rnd() * 10);
      dummy.rotation.y = rnd() * Math.PI;
      dummy.updateMatrix();
      buildings.current?.setMatrixAt(i, dummy.matrix);
      buildings.current?.setColorAt(i, color.set(['#d8cdb8', '#c9b79c', '#e6dcc8', '#b8a58a', '#cfd8dc'][Math.floor(rnd() * 5)]!));
    }
    for (const mesh of [buildings.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, []);

  return (
    <>
      <instancedMesh ref={buildings} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>
      <group position={[-70, 0, -160]}>
        <mesh position={[0, 28, 0]}>
          <cylinderGeometry args={[1.2, 3.4, 56, 10]} />
          <meshStandardMaterial color="#d9d2c3" />
        </mesh>
        <mesh position={[0, 52, 0]} scale={[1, 0.32, 1]}>
          <sphereGeometry args={[7.5, 14, 10]} />
          <meshStandardMaterial color="#e0457b" />
        </mesh>
        <mesh position={[0, 62, 0]}>
          <cylinderGeometry args={[0.15, 0.7, 14, 6]} />
          <meshStandardMaterial color="#b8b0a0" />
        </mesh>
      </group>
    </>
  );
}

/** The racecourse: a dirt track on grass with white rails, a start line, a pond in the infield, stands and a skyline. */
export function Course({ excitement, gate, finalLap, pip }: { excitement: { current: number }; gate: { current: GateState }; finalLap: { current: boolean }; pip: PipRegistry }) {
  const line = trackPoint(shape, 0);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#3f8a45" />
      </mesh>
      <Parcours gate={gate} />
      {/* the start and finish line across the track, with a chequered edge */}
      <mesh position={[line.x, 0.06, line.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2 * TRACK_HALF_WIDTH, 1.2]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <ChequeredEdge />
      <HiddenInPip registry={pip}>
        {/* a pond in the middle of the infield */}
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 3.2, 1]}>
          <circleGeometry args={[shape.radius * 0.55, 24]} />
          <meshStandardMaterial color="#5aa9d6" />
        </mesh>
      </HiddenInPip>
      <HiddenInPip registry={pip}>
        <Grandstand excitement={excitement} />
        <Skyline />
      </HiddenInPip>
      <HiddenInPip registry={pip}>
        <Dressing finalLap={finalLap} />
      </HiddenInPip>
    </>
  );
}
