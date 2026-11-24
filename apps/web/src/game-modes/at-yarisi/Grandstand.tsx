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

/**
 * The two stands look different so a viewer can tell which is which: the MAIN STAND (beside the start and finish line, on the right of the
 * track) is red and gold, with a red roof; the BACK STAND (on the far straight) is teal and blue, with a teal roof. The crowd in each wears
 * the colours of its stand, and each has a sign over its roof.
 */
const STANDS = {
  main: { roof: '#c0392b', fronts: ['#c0392b', '#f4f1ea'], shirts: ['#c0392b', '#f4f1ea', '#f2b705', '#e0457b', '#8c2f39', '#ff8a3d'], hats: ['#c0392b', '#f2b705', '#f4f1ea', '#1c1420'], scarves: ['#c0392b', '#f2b705', '#ffffff'], sign: 'MAIN STAND', signColor: '#8c2f39' },
  back: { roof: '#1f7a8c', fronts: ['#1f7a8c', '#f2b705'], shirts: ['#1f7a8c', '#2f6fdb', '#58b368', '#f4f1ea', '#1f9fb0', '#2b3a67'], hats: ['#2f6fdb', '#58b368', '#f4f1ea', '#1c1420'], scarves: ['#2f6fdb', '#58b368', '#ffffff'], sign: 'BACK STAND', signColor: '#1b4f5c' },
} as const;
/** Side +1 is the main stand (the start and finish line is on that side), side -1 the back stand. */
const standOf = (side: number) => (side > 0 ? STANDS.main : STANDS.back);

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
  /** Body size: a few children, a few tall ones. */
  size: number;
  hat: THREE.Color | null;
  scarf: THREE.Color | null;
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
  const sideArms = useRef<THREE.InstancedMesh>(null);
  const hats = useRef<THREE.InstancedMesh>(null);
  const scarves = useRef<THREE.InstancedMesh>(null);
  const flagPoles = useRef<THREE.InstancedMesh>(null);
  const flagCloths = useRef<THREE.InstancedMesh>(null);
  const seats = useRef<THREE.InstancedMesh>(null);
  const fronts = useRef<THREE.InstancedMesh>(null);
  const fenceMesh = useRef<THREE.InstancedMesh>(null);

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
            shirt: new THREE.Color(standOf(side).shirts[Math.floor(rnd() * standOf(side).shirts.length)]!),
            hair: new THREE.Color(HAIR[Math.floor(rnd() * HAIR.length)]),
            cheering: rnd() < 0.35,
            size: rnd() < 0.12 ? 0.72 : 0.92 + rnd() * 0.2, // some children, the rest a little different from each other
            hat: rnd() < 0.3 ? new THREE.Color(standOf(side).hats[Math.floor(rnd() * standOf(side).hats.length)]!) : null,
            scarf: rnd() < 0.4 ? new THREE.Color(standOf(side).scarves[Math.floor(rnd() * standOf(side).scarves.length)]!) : null,
          });
        }
      }
    }
    return out;
  }, []);
  const cheerers = useMemo(() => people.filter((p) => p.cheering), [people]);
  const resting = useMemo(() => people.filter((p) => !p.cheering), [people]);
  const hatted = useMemo(() => people.filter((p) => p.hat !== null), [people]);
  const scarved = useMemo(() => people.filter((p) => p.scarf !== null), [people]);
  /** Flags on poles, waved by the ones who brought them. */
  const flags = useMemo(() => {
    const rnd = seeded(77);
    return Array.from({ length: 36 }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const tier = 1 + Math.floor(rnd() * (TIERS - 1));
      return { x: side * (INNER + tier * TIER_DEPTH + 0.2), y: (tier + 1) * TIER_RISE, z: -LENGTH / 2 + rnd() * LENGTH, phase: rnd() * 6.28, color: new THREE.Color(SHIRTS[Math.floor(rnd() * SHIRTS.length)]), side };
    });
  }, []);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const put = (mesh: THREE.InstancedMesh | null, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      if (!mesh) return;
      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    };
    const color = new THREE.Color();
    let t = 0;
    let p = 0;
    let f = 0;
    let rail = 0;
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < TIERS; tier++) {
        const x = side * (INNER + tier * TIER_DEPTH + TIER_DEPTH / 2);
        // each tier is a block from the ground up to its own height
        put(tiers.current, t, x, ((tier + 1) * TIER_RISE) / 2, 0, TIER_DEPTH, (tier + 1) * TIER_RISE, LENGTH);
        // a seat bench along its top, and a coloured band on its front face (two colours in turn, like painted seats)
        put(seats.current, t, side * (INNER + tier * TIER_DEPTH + 0.55), (tier + 1) * TIER_RISE + 0.12, 0, 0.55, 0.12, LENGTH - 1);
        put(fronts.current, t, side * (INNER + tier * TIER_DEPTH - 0.02), (tier + 0.5) * TIER_RISE + 0.5 * TIER_RISE * 0, 0, 0.06, TIER_RISE * 0.8, LENGTH - 0.5);
        fronts.current?.setColorAt(t, color.set(standOf(side).fronts[tier % 2]!));
        t++;
      }
      // the roof over the upper rows, on posts at the back
      const roofX = side * (INNER + 3.5 * TIER_DEPTH + 1.5);
      put(roof.current, side === -1 ? 0 : 1, roofX, TIERS * TIER_RISE + 4.2, 0, TIER_DEPTH * 4.4, 0.35, LENGTH + 2);
      roof.current?.setColorAt(side === -1 ? 0 : 1, color.set(standOf(side).roof));
      for (let k = 0; k <= 8; k++) put(posts.current, p++, side * (INNER + TIERS * TIER_DEPTH + 0.2), (TIERS * TIER_RISE + 4.2) / 2, -LENGTH / 2 + (k * LENGTH) / 8, 0.35, TIERS * TIER_RISE + 4.2, 0.35);
      // a white rail along the front of the stand: posts and a top bar
      for (let k = 0; k <= 24; k++) put(fenceMesh.current, rail++, side * (INNER - 0.9), 0.55, -LENGTH / 2 + (k * LENGTH) / 24, 0.12, 1.1, 0.12);
      put(fenceMesh.current, rail++, side * (INNER - 0.9), 1.1, 0, 0.14, 0.12, LENGTH);
      // flagpoles in the stands
      for (const flag of flags.filter((fl) => fl.side === side)) {
        put(flagPoles.current, f, flag.x, flag.y + 2.2, flag.z, 0.1, 4.4, 0.1);
        flagCloths.current?.setColorAt(f, flag.color);
        f++;
      }
    }
    for (const mesh of [tiers.current, roof.current, posts.current, seats.current, fronts.current, fenceMesh.current, flagPoles.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (flagCloths.current?.instanceColor) flagCloths.current.instanceColor.needsUpdate = true;

    people.forEach((s, i) => {
      bodies.current?.setColorAt(i, s.shirt);
      heads.current?.setColorAt(i, s.skin);
      hairs.current?.setColorAt(i, s.hair);
    });
    resting.forEach((s, i) => sideArms.current?.setColorAt(i, s.shirt));
    cheerers.forEach((s, i) => arms.current?.setColorAt(i, s.shirt));
    hatted.forEach((s, i) => hats.current?.setColorAt(i, s.hat!));
    scarved.forEach((s, i) => scarves.current?.setColorAt(i, s.scarf!));
    for (const mesh of [bodies.current, heads.current, hairs.current, sideArms.current, arms.current, hats.current, scarves.current]) if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [people, cheerers, resting, hatted, scarved, flags]);

  // The crowd bounces: gently when nothing is happening, more when the race is on. (A few hundred matrices a frame is cheap.)
  const frames = useRef(0);
  useFrame(({ clock }) => {
    if (++frames.current % 2 !== 0) return;
    const time = clock.elapsedTime;
    const lively = 0.04 + 0.16 * excitement.current;
    const dummy = scratch;
    const place = (mesh: THREE.InstancedMesh | null, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      if (!mesh) return;
      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    };
    const hopOf = (s: Spectator) => Math.max(0, Math.sin(time * (3 + 3 * excitement.current) + s.phase)) * lively * (s.cheering ? 1.6 : 0.7) * s.size;
    const hops = new Map<Spectator, number>();
    people.forEach((s, i) => {
      const hop = hopOf(s);
      hops.set(s, hop);
      const k = s.size;
      place(bodies.current, i, s.x, s.y + 0.45 * k + hop, s.z, 0.5 * k, 0.7 * k, 0.36 * k);
      place(heads.current, i, s.x, s.y + 0.98 * k + hop, s.z, 0.3 * k, 0.3 * k, 0.3 * k);
      place(hairs.current, i, s.x, s.y + 1.06 * k + hop, s.z + 0.03 * (s.x > 0 ? 1 : -1), 0.33 * k, 0.2 * k, 0.33 * k);
    });
    resting.forEach((s, i) => {
      const k = s.size;
      const hop = hops.get(s) ?? 0;
      const sway = Math.sin(time * 1.5 + s.phase) * 0.03;
      for (const side of [-1, 1]) place(sideArms.current, i * 2 + (side === -1 ? 0 : 1), s.x, s.y + 0.52 * k + hop, s.z + side * (0.3 * k + sway), 0.14 * k, 0.5 * k, 0.14 * k);
    });
    cheerers.forEach((s, i) => {
      const hop = hops.get(s) ?? 0;
      const wave = Math.sin(time * 6 + s.phase) * 0.15;
      place(arms.current, i, s.x, s.y + 1.15 * s.size + hop, s.z, (0.62 + wave * 0.3) * s.size, 0.55 * s.size, 0.14 * s.size); // two raised arms read as one wide, waving bar from the camera
    });
    hatted.forEach((s, i) => place(hats.current, i, s.x, s.y + 1.2 * s.size + (hops.get(s) ?? 0), s.z, 0.36 * s.size, 0.1 * s.size, 0.36 * s.size));
    scarved.forEach((s, i) => place(scarves.current, i, s.x, s.y + 0.82 * s.size + (hops.get(s) ?? 0), s.z, 0.36 * s.size, 0.09 * s.size, 0.4 * s.size));
    flags.forEach((flag, i) => {
      const sway = Math.sin(time * (2 + 3 * excitement.current) + flag.phase);
      dummy.position.set(flag.x, flag.y + 4.1, flag.z + sway * 0.35);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.05, 0.9, 1.5 + sway * 0.2);
      dummy.updateMatrix();
      flagCloths.current?.setMatrixAt(i, dummy.matrix);
    });
    for (const mesh of [bodies.current, heads.current, hairs.current, arms.current, sideArms.current, hats.current, scarves.current, flagCloths.current]) if (mesh) mesh.instanceMatrix.needsUpdate = true;
  });

  const box = <boxGeometry args={[1, 1, 1]} />;
  return (
    <>
      <instancedMesh ref={tiers} args={[undefined, undefined, 2 * TIERS]} frustumCulled={false}>
        {box}
        <meshStandardMaterial color="#d8cfbe" />
      </instancedMesh>
      <instancedMesh ref={seats} args={[undefined, undefined, 2 * TIERS]} frustumCulled={false}>
        {box}
        <meshStandardMaterial color="#8a8f96" />
      </instancedMesh>
      <instancedMesh ref={fronts} args={[undefined, undefined, 2 * TIERS]} frustumCulled={false}>
        {box}
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={fenceMesh} args={[undefined, undefined, 2 * 26]} frustumCulled={false}>
        {box}
        <meshStandardMaterial color="#ffffff" />
      </instancedMesh>
      <instancedMesh ref={roof} args={[undefined, undefined, 2]} frustumCulled={false}>
        {box}
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={posts} args={[undefined, undefined, 18]} frustumCulled={false}>
        {box}
        <meshStandardMaterial color="#9aa0a6" />
      </instancedMesh>
      <instancedMesh ref={bodies} args={[undefined, undefined, people.length]} frustumCulled={false}>
        {box}
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
        {box}
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={sideArms} args={[undefined, undefined, resting.length * 2]} frustumCulled={false}>
        {box}
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={hats} args={[undefined, undefined, hatted.length]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 8]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={scarves} args={[undefined, undefined, scarved.length]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 8]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={flagPoles} args={[undefined, undefined, flags.length]} frustumCulled={false}>
        {box}
        <meshStandardMaterial color="#c9c9c9" />
      </instancedMesh>
      <StandSigns />
      <instancedMesh ref={flagCloths} args={[undefined, undefined, flags.length]} frustumCulled={false}>
        {box}
        <meshStandardMaterial />
      </instancedMesh>
    </>
  );
}

/** A sign for a stand, drawn on a canvas so the text is ours. */
function signTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#ffffff';
  g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The two signs over the stands' roofs, readable from the track. */
function StandSigns() {
  const textures = useMemo(() => [-1, 1].map((side) => signTexture(standOf(side).sign, standOf(side).signColor)), []);
  return (
    <>
      {[-1, 1].map((side, i) => (
        <mesh key={side} position={[side * (INNER + 3.5 * TIER_DEPTH + 0.1), TIERS * TIER_RISE + 5.6, 0]} rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
          <planeGeometry args={[34, 4.2]} />
          <meshBasicMaterial map={textures[i]} />
        </mesh>
      ))}
    </>
  );
}

const scratch = new THREE.Object3D();
