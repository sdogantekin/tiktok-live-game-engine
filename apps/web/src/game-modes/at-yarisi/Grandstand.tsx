import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { shape, TRACK_HALF_WIDTH } from './scene-config';

/** Small deterministic random numbers, so the stands look the same every time. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHIRTS = ['#e0457b', '#2f6fdb', '#f2b705', '#f4f1ea', '#58b368', '#c0392b', '#8e44ad', '#ff8a3d', '#1f9fb0', '#2b2b3a'];
const SKINS = ['#f1c9a5', '#e8bd98', '#d9a982', '#c68e6a', '#a9714f', '#7a4b33'];
const HAIR = ['#2a1d18', '#3b2a20', '#6b4423', '#c9a24a', '#8a8a8a', '#1c1420'];

const TIERS = 6;
const LENGTH = 96;
const PER_ROW = 52;
const TIER_RISE = 1.0;
const TIER_DEPTH = 1.7;
/** Where the stands begin, measured outwards from the track centre line. */
const INNER = shape.radius + TRACK_HALF_WIDTH + 6;

interface Spectator {
  x: number;
  y: number;
  z: number;
  phase: number;
  skin: THREE.Color;
  shirt: THREE.Color;
  hair: THREE.Color;
  /** True for the ones with their arms up. */
  cheering: boolean;
}

/**
 * The two grandstands beside the straights: stepped tiers with a roof on posts, a rail along the front, and spectators in rows
 * (a body, a head with hair, and some with arms up) who bounce a little. Everything is instanced: a handful of draw calls.
 */
export function Grandstand({ excitement }: { excitement: { current: number } }) {
  const tiers = useRef<THREE.InstancedMesh>(null);
  const roof = useRef<THREE.InstancedMesh>(null);
  const posts = useRef<THREE.InstancedMesh>(null);
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const hairs = useRef<THREE.InstancedMesh>(null);
  const arms = useRef<THREE.InstancedMesh>(null);

  const people = useMemo(() => {
    const rnd = seeded(11);
    const out: Spectator[] = [];
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < TIERS; tier++) {
        for (let k = 0; k < PER_ROW; k++) {
          if (rnd() < 0.08) continue; // a few empty seats
          out.push({
            x: side * (INNER + tier * TIER_DEPTH + 0.5),
            y: (tier + 1) * TIER_RISE,
            z: -LENGTH / 2 + (k + 0.2 + rnd() * 0.6) * (LENGTH / PER_ROW),
            phase: rnd() * Math.PI * 2,
            skin: new THREE.Color(SKINS[Math.floor(rnd() * SKINS.length)]),
            shirt: new THREE.Color(SHIRTS[Math.floor(rnd() * SHIRTS.length)]),
            hair: new THREE.Color(HAIR[Math.floor(rnd() * HAIR.length)]),
            cheering: rnd() < 0.35,
          });
        }
      }
    }
    return out;
  }, []);
  const cheerers = useMemo(() => people.filter((p) => p.cheering), [people]);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const put = (mesh: THREE.InstancedMesh | null, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      if (!mesh) return;
      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    };
    let t = 0;
    let p = 0;
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < TIERS; tier++) {
        // each tier is a block from the ground up to its own height
        put(tiers.current, t++, side * (INNER + tier * TIER_DEPTH + TIER_DEPTH / 2), ((tier + 1) * TIER_RISE) / 2, 0, TIER_DEPTH, (tier + 1) * TIER_RISE, LENGTH);
      }
      // the roof over the upper rows, on posts at the back
      const roofX = side * (INNER + 3.5 * TIER_DEPTH + 1.5);
      put(roof.current, side === -1 ? 0 : 1, roofX, TIERS * TIER_RISE + 4.2, 0, TIER_DEPTH * 4.4, 0.35, LENGTH + 2);
      for (let k = 0; k <= 8; k++) put(posts.current, p++, side * (INNER + TIERS * TIER_DEPTH + 0.2), (TIERS * TIER_RISE + 4.2) / 2, -LENGTH / 2 + (k * LENGTH) / 8, 0.35, TIERS * TIER_RISE + 4.2, 0.35);
    }
    for (const mesh of [tiers.current, roof.current, posts.current]) if (mesh) mesh.instanceMatrix.needsUpdate = true;

    people.forEach((s, i) => {
      for (const mesh of [bodies.current, heads.current, hairs.current]) {
        if (!mesh) continue;
        if (mesh === bodies.current) {
          mesh.setColorAt(i, s.shirt);
        } else if (mesh === heads.current) mesh.setColorAt(i, s.skin);
        else mesh.setColorAt(i, s.hair);
      }
    });
    for (const mesh of [bodies.current, heads.current, hairs.current]) if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
    cheerers.forEach((s, i) => arms.current?.setColorAt(i, s.shirt));
    if (arms.current?.instanceColor) arms.current.instanceColor.needsUpdate = true;
  }, [people, cheerers]);

  // The crowd bounces: gently when nothing is happening, more when the race is on. (A few hundred matrices a frame is cheap.)
  const frames = useRef(0);
  useFrame(({ clock }) => {
    if (++frames.current % 2 !== 0) return;
    const time = clock.elapsedTime;
    const lively = 0.04 + 0.16 * excitement.current;
    const dummy = scratch;
    people.forEach((s, i) => {
      const hop = Math.max(0, Math.sin(time * (3 + 3 * excitement.current) + s.phase)) * lively * (s.cheering ? 1.6 : 0.7);
      dummy.position.set(s.x, s.y + 0.45 + hop, s.z);
      dummy.scale.set(0.5, 0.7, 0.36);
      dummy.updateMatrix();
      bodies.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.x, s.y + 0.98 + hop, s.z);
      dummy.scale.set(0.3, 0.3, 0.3);
      dummy.updateMatrix();
      heads.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.x, s.y + 1.06 + hop, s.z + 0.03 * (s.x > 0 ? 1 : -1));
      dummy.scale.set(0.33, 0.2, 0.33);
      dummy.updateMatrix();
      hairs.current?.setMatrixAt(i, dummy.matrix);
    });
    cheerers.forEach((s, i) => {
      const hop = Math.max(0, Math.sin(time * (3 + 3 * excitement.current) + s.phase)) * lively * 1.6;
      const wave = Math.sin(time * 6 + s.phase) * 0.15;
      dummy.position.set(s.x, s.y + 1.15 + hop, s.z);
      dummy.scale.set(0.62 + wave * 0.3, 0.55, 0.14); // two raised arms read as one wide, waving bar from the camera
      dummy.updateMatrix();
      arms.current?.setMatrixAt(i, dummy.matrix);
    });
    for (const mesh of [bodies.current, heads.current, hairs.current, arms.current]) if (mesh) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={tiers} args={[undefined, undefined, 2 * TIERS]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#d8cfbe" />
      </instancedMesh>
      <instancedMesh ref={roof} args={[undefined, undefined, 2]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#c0392b" />
      </instancedMesh>
      <instancedMesh ref={posts} args={[undefined, undefined, 18]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#9aa0a6" />
      </instancedMesh>
      <instancedMesh ref={bodies} args={[undefined, undefined, people.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, people.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={hairs} args={[undefined, undefined, people.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={arms} args={[undefined, undefined, cheerers.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>
    </>
  );
}

const scratch = new THREE.Object3D();
