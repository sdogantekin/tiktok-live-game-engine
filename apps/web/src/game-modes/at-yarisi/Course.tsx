import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Dressing } from './Dressing';
import { Grandstand, seeded } from './Grandstand';
import { shape, TRACK_HALF_WIDTH } from './scene-config';
import { trackPoint } from './track';

const SAMPLES = 360;

/** A strip along the track between two lateral offsets and two heights (flat ground, or a low wall when the heights differ). */
function ribbon(lateralA: number, lateralB: number, heightA: number, heightB: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const d = (i / SAMPLES) * shape.lapLength;
    const a = trackPoint(shape, d, lateralA);
    const b = trackPoint(shape, d, lateralB);
    positions.push(a.x, heightA, a.z, b.x, heightB, b.z);
    if (i < SAMPLES) {
      const k = i * 2;
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
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
export function Course({ excitement }: { excitement: { current: number } }) {
  const dirt = useMemo(() => ribbon(-TRACK_HALF_WIDTH, TRACK_HALF_WIDTH, 0.04, 0.04), []);
  const innerRail = useMemo(() => ribbon(-TRACK_HALF_WIDTH - 0.3, -TRACK_HALF_WIDTH - 0.3, 0.05, 1.0), []);
  const outerRail = useMemo(() => ribbon(TRACK_HALF_WIDTH + 0.3, TRACK_HALF_WIDTH + 0.3, 0.05, 1.0), []);
  const line = trackPoint(shape, 0);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#3f8a45" />
      </mesh>
      <mesh geometry={dirt}>
        <meshStandardMaterial color="#b08a56" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={innerRail}>
        <meshStandardMaterial color="#ffffff" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={outerRail}>
        <meshStandardMaterial color="#ffffff" side={THREE.DoubleSide} />
      </mesh>
      {/* the start and finish line across the track, with a chequered edge */}
      <mesh position={[line.x, 0.06, line.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2 * TRACK_HALF_WIDTH, 1.2]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {Array.from({ length: 17 }, (_, i) => (
        <mesh key={i} position={[line.x - TRACK_HALF_WIDTH + 0.5 + i * 1, 0.07, line.z + (i % 2 === 0 ? -0.3 : 0.3)]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.6, 0.6]} />
          <meshStandardMaterial color="#1c1420" />
        </mesh>
      ))}
      {/* a pond in the middle of the infield */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 3.2, 1]}>
        <circleGeometry args={[shape.radius * 0.55, 24]} />
        <meshStandardMaterial color="#5aa9d6" />
      </mesh>
      <Grandstand excitement={excitement} />
      <Dressing />
      <Skyline />
    </>
  );
}
