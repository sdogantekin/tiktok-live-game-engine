import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { seeded } from './Grandstand';
import { shape, TRACK_HALF_WIDTH } from './scene-config';
import { trackPoint } from './track';

/**
 * A strip of ground along the track from `from` to `to` metres to the outside of the centre line, in segments of `step` metres along it,
 * each with its own colour (mown stripes, or the worn and the fresh dirt). Hard edges between segments: the vertices are not shared.
 */
export function stripedStrip(from: number, to: number, step: number, colorOf: (segment: number) => THREE.Color, height = 0.02): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const segments = Math.ceil(shape.lapLength / step);
  for (let i = 0; i < segments; i++) {
    const d0 = i * step;
    const d1 = Math.min(shape.lapLength, (i + 1) * step);
    const color = colorOf(i);
    // a segment through a bend is bent, so it is made of a few short quads
    const parts = 3;
    for (let k = 0; k < parts; k++) {
      const a = trackPoint(shape, d0 + ((d1 - d0) * k) / parts, from);
      const b = trackPoint(shape, d0 + ((d1 - d0) * k) / parts, to);
      const c = trackPoint(shape, d0 + ((d1 - d0) * (k + 1)) / parts - 1e-6, from);
      const d = trackPoint(shape, d0 + ((d1 - d0) * (k + 1)) / parts - 1e-6, to);
      const base = positions.length / 3;
      positions.push(a.x, height, a.z, b.x, height, b.z, c.x, height, c.z, d.x, height, d.z);
      for (let n = 0; n < 4; n++) colors.push(color.r, color.g, color.b);
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A thin horizontal rail along the track at a lateral offset and height (a flat ribbon, seen from both sides). */
function railRibbon(lateral: number, height: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const samples = 360;
  for (let i = 0; i <= samples; i++) {
    const p = trackPoint(shape, (i / samples) * shape.lapLength, lateral);
    positions.push(p.x, height - 0.06, p.z, p.x, height + 0.06, p.z);
    if (i < samples) indices.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const MOWN_LIGHT = new THREE.Color('#4a9a4f');
const MOWN_DARK = new THREE.Color('#3f8a45');

/**
 * The racing surface and its furniture: mown stripes either side of the track, the dirt with a worn middle and slightly uneven colour, the
 * white running rails on posts, furlong poles, the starting gate behind the grid and the photo-finish tower by the line.
 */
export function Parcours({ gateUp }: { gateUp: { current: boolean } }) {
  const posts = useRef<THREE.InstancedMesh>(null);
  const poles = useRef<THREE.InstancedMesh>(null);
  const poleCaps = useRef<THREE.InstancedMesh>(null);
  const gate = useRef<THREE.InstancedMesh>(null);
  // The gate stands only while the horses line up; once they are away it is gone (the camera passes the line on every lap).
  useFrame(() => {
    if (gate.current) gate.current.visible = gateUp.current;
  });

  const { dirtEdge, dirtMiddle, mownOutside, mownInside, mownFar } = useMemo(() => {
    const rnd = seeded(3);
    const edge = new THREE.Color('#bb9964');
    const worn = new THREE.Color('#a8844f');
    const tint = (base: THREE.Color, amount: number) => base.clone().offsetHSL(0, 0, (rnd() - 0.5) * amount);
    const half = TRACK_HALF_WIDTH;
    return {
      dirtEdge: stripedStrip(-half, half, 4, () => tint(edge, 0.05), 0.04),
      dirtMiddle: stripedStrip(-half + 2.2, half - 2.2, 4, () => tint(worn, 0.05), 0.045),
      mownOutside: stripedStrip(half + 0.4, half + 30, 8, (i) => (i % 2 === 0 ? MOWN_LIGHT : MOWN_DARK), 0.02),
      mownFar: stripedStrip(half + 30, half + 70, 14, (i) => (i % 2 === 0 ? MOWN_DARK : new THREE.Color('#3b8341')), 0.015),
      mownInside: stripedStrip(-half - 16, -half - 0.4, 8, (i) => (i % 2 === 0 ? MOWN_LIGHT : MOWN_DARK), 0.02),
    };
  }, []);
  const rails = useMemo(
    () => [-TRACK_HALF_WIDTH - 0.3, TRACK_HALF_WIDTH + 0.3].flatMap((lateral) => [0.55, 1.05].map((height) => railRibbon(lateral, height))),
    [],
  );
  const postCount = 2 * 67;
  const poleCount = 8;

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    let i = 0;
    for (const lateral of [-TRACK_HALF_WIDTH - 0.3, TRACK_HALF_WIDTH + 0.3]) {
      for (let k = 0; k < 67; k++) {
        const p = trackPoint(shape, (k / 67) * shape.lapLength, lateral);
        dummy.position.set(p.x, 0.55, p.z);
        dummy.rotation.set(0, p.heading, 0);
        dummy.scale.set(0.16, 1.1, 0.16);
        dummy.updateMatrix();
        posts.current?.setMatrixAt(i++, dummy.matrix);
      }
    }
    // furlong poles every 50 m on the inside rail: a white pole with a red cap
    for (let k = 0; k < poleCount; k++) {
      const p = trackPoint(shape, k * 50 + 25, -TRACK_HALF_WIDTH - 1.6);
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(p.x, 1.6, p.z);
      dummy.scale.set(0.22, 3.2, 0.22);
      dummy.updateMatrix();
      poles.current?.setMatrixAt(k, dummy.matrix);
      dummy.position.set(p.x, 3.0, p.z);
      dummy.scale.set(0.34, 0.6, 0.34);
      dummy.updateMatrix();
      poleCaps.current?.setMatrixAt(k, dummy.matrix);
    }
    // the starting gate: dividers between the lanes, behind where the horses line up
    for (let k = 0; k < 13; k++) {
      const p = trackPoint(shape, -4.6, (k - 6) * 1.25 - 0.625 + 0.625);
      dummy.position.set(p.x, 1.15, p.z);
      dummy.rotation.set(0, p.heading, 0);
      dummy.scale.set(0.14, 2.3, 2.8);
      dummy.updateMatrix();
      gate.current?.setMatrixAt(k, dummy.matrix);
    }
    for (const mesh of [posts.current, poles.current, poleCaps.current, gate.current]) if (mesh) mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <>
      <mesh geometry={mownFar}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={mownOutside} receiveShadow>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={mownInside} receiveShadow>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={dirtEdge} receiveShadow>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={dirtMiddle} receiveShadow>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      {rails.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          <meshStandardMaterial color="#ffffff" side={THREE.DoubleSide} />
        </mesh>
      ))}
      <instancedMesh ref={posts} args={[undefined, undefined, postCount]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#f4f1ea" />
      </instancedMesh>
      <instancedMesh ref={poles} args={[undefined, undefined, poleCount]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" />
      </instancedMesh>
      <instancedMesh ref={poleCaps} args={[undefined, undefined, poleCount]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#c0392b" />
      </instancedMesh>
      <instancedMesh ref={gate} args={[undefined, undefined, 13]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#2f3a40" />
      </instancedMesh>
      {/* the photo-finish tower on the inside of the line */}
      <group position={[trackPoint(shape, 0, -TRACK_HALF_WIDTH - 4).x, 0, trackPoint(shape, 0, -TRACK_HALF_WIDTH - 4).z]}>
        <mesh position={[0, 3, 0]}>
          <boxGeometry args={[1.6, 6, 1.6]} />
          <meshStandardMaterial color="#d8cfbe" />
        </mesh>
        <mesh position={[0, 6.7, 0]}>
          <boxGeometry args={[3.2, 1.6, 3.2]} />
          <meshStandardMaterial color="#9fd3e8" emissive="#5aa9d6" emissiveIntensity={0.25} />
        </mesh>
        <mesh position={[0, 7.7, 0]}>
          <boxGeometry args={[3.8, 0.3, 3.8]} />
          <meshStandardMaterial color="#c0392b" />
        </mesh>
      </group>
    </>
  );
}
