import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
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

/** Small deterministic random numbers, so the stands and the skyline look the same every time. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CROWD_COLORS = ['#e0457b', '#2f6fdb', '#f2b705', '#ffffff', '#7bd88f', '#e8e0d0', '#c0392b', '#8e44ad'];

/** Spectators on the tiered stand beside the right-hand straight and the left-hand straight. */
function Stands() {
  const stand = useRef<THREE.InstancedMesh>(null);
  const crowd = useRef<THREE.InstancedMesh>(null);
  const tiers = 5;
  const length = 90;
  const spots = useMemo(() => {
    const rnd = random(7);
    const out: { x: number; y: number; z: number; color: THREE.Color }[] = [];
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < tiers; tier++) {
        for (let k = 0; k < 44; k++) {
          const z = -length / 2 + (k + rnd() * 0.6) * (length / 44);
          out.push({ x: side * (shape.radius + TRACK_HALF_WIDTH + 5.5 + tier * 1.6), y: 0.9 + tier * 1.1 + 0.6, z, color: new THREE.Color(CROWD_COLORS[Math.floor(rnd() * CROWD_COLORS.length)]) });
        }
      }
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    if (crowd.current) {
      spots.forEach((s, i) => {
        dummy.position.set(s.x, s.y, s.z);
        dummy.scale.set(0.55, 0.9, 0.55);
        dummy.updateMatrix();
        crowd.current!.setMatrixAt(i, dummy.matrix);
        crowd.current!.setColorAt(i, s.color);
      });
      crowd.current.instanceMatrix.needsUpdate = true;
      if (crowd.current.instanceColor) crowd.current.instanceColor.needsUpdate = true;
    }
    if (stand.current) {
      let i = 0;
      for (const side of [-1, 1]) {
        for (let tier = 0; tier < tiers; tier++) {
          dummy.position.set(side * (shape.radius + TRACK_HALF_WIDTH + 5.5 + tier * 1.6 + 0.8), (tier * 1.1 + 1) / 2, 0);
          dummy.scale.set(1.7, tier * 1.1 + 1, length);
          dummy.updateMatrix();
          stand.current.setMatrixAt(i++, dummy.matrix);
        }
      }
      stand.current.instanceMatrix.needsUpdate = true;
    }
  }, [spots]);

  return (
    <>
      <instancedMesh ref={stand} args={[undefined, undefined, 2 * tiers]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#cfc4b0" />
      </instancedMesh>
      <instancedMesh ref={crowd} args={[undefined, undefined, spots.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>
    </>
  );
}

/** A ring of city buildings in the distance and one tall observation tower: original shapes, nothing copied from a real place. */
function Skyline() {
  const buildings = useRef<THREE.InstancedMesh>(null);
  const trees = useRef<THREE.InstancedMesh>(null);
  const count = 46;
  const treeCount = 70;
  useLayoutEffect(() => {
    const rnd = random(21);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 150 + rnd() * 30;
      const h = 12 + rnd() * 30;
      dummy.position.set(Math.cos(angle) * radius * 0.7, h / 2, Math.sin(angle) * radius);
      dummy.scale.set(10 + rnd() * 10, h, 10 + rnd() * 10);
      dummy.rotation.y = rnd() * Math.PI;
      dummy.updateMatrix();
      buildings.current?.setMatrixAt(i, dummy.matrix);
      buildings.current?.setColorAt(i, color.set(['#d8cdb8', '#c9b79c', '#e6dcc8', '#b8a58a', '#cfd8dc'][Math.floor(rnd() * 5)]!));
    }
    for (let i = 0; i < treeCount; i++) {
      const angle = rnd() * Math.PI * 2;
      const radius = 62 + rnd() * 50;
      dummy.position.set(Math.cos(angle) * radius * 0.75, 2, Math.sin(angle) * radius);
      dummy.scale.set(2.4, 4 + rnd() * 2, 2.4);
      dummy.rotation.y = 0;
      dummy.updateMatrix();
      trees.current?.setMatrixAt(i, dummy.matrix);
    }
    for (const mesh of [buildings.current, trees.current]) {
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
      <instancedMesh ref={trees} args={[undefined, undefined, treeCount]} frustumCulled={false}>
        <coneGeometry args={[1, 1, 7]} />
        <meshStandardMaterial color="#2f6b3a" />
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
export function Course() {
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
      <Stands />
      <Skyline />
    </>
  );
}
