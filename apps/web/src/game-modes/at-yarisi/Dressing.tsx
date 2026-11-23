import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { seeded } from './Grandstand';
import { shape, TRACK_HALF_WIDTH } from './scene-config';
import { trackPoint } from './track';

const BOARD_COLORS = ['#e0457b', '#2f6fdb', '#f2b705', '#58b368', '#ff8a3d', '#8e44ad', '#1f9fb0'];

/** A banner drawn on a canvas, so the text is ours and nothing is fetched. */
function bannerTexture(text: string, background: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const g = canvas.getContext('2d')!;
  g.fillStyle = background;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) g.fillRect(i * 32, j * 24, 32, 24);
  for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) g.fillRect(i * 32, 160 - 48 + j * 24, 32, 24);
  g.fillStyle = '#ffffff';
  g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The finish gantry over the start/finish line, with a banner readable from both sides. */
function Gantry() {
  const line = trackPoint(shape, 0);
  const texture = useMemo(() => bannerTexture('BİTİŞ', '#1c1420'), []);
  const half = TRACK_HALF_WIDTH + 1.6;
  return (
    <group position={[line.x, 0, line.z]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * half, 4, 0]}>
          <boxGeometry args={[0.7, 8, 0.7]} />
          <meshStandardMaterial color="#f4f1ea" />
        </mesh>
      ))}
      <mesh position={[0, 8.2, 0]}>
        <boxGeometry args={[2 * half + 0.7, 0.5, 0.6]} />
        <meshStandardMaterial color="#c0392b" />
      </mesh>
      {[0, Math.PI].map((turn) => (
        <mesh key={turn} position={[0, 6.7, turn === 0 ? 0.36 : -0.36]} rotation={[0, turn, 0]}>
          <planeGeometry args={[2 * half - 0.4, 2 * half * 0.1]} />
          <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  );
}

/** Advertising boards on the outside rail, lamp posts, hedges on the inside, and a few clouds: the dressing of the course. */
export function Dressing() {
  const boards = useRef<THREE.InstancedMesh>(null);
  const lamps = useRef<THREE.InstancedMesh>(null);
  const lampHeads = useRef<THREE.InstancedMesh>(null);
  const hedges = useRef<THREE.InstancedMesh>(null);
  const clouds = useRef<THREE.InstancedMesh>(null);
  const boardCount = 28;
  const lampCount = 12;
  const hedgeCount = 134;
  const cloudCount = 10;

  useLayoutEffect(() => {
    const rnd = seeded(5);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < boardCount; i++) {
      const p = trackPoint(shape, (i / boardCount) * shape.lapLength + 7, TRACK_HALF_WIDTH + 1.4);
      dummy.position.set(p.x, 0.7, p.z);
      dummy.rotation.set(0, p.heading, 0);
      dummy.scale.set(0.15, 1.3, 7);
      dummy.updateMatrix();
      boards.current?.setMatrixAt(i, dummy.matrix);
      boards.current?.setColorAt(i, color.set(BOARD_COLORS[i % BOARD_COLORS.length]!));
    }
    for (let i = 0; i < lampCount; i++) {
      const p = trackPoint(shape, (i / lampCount) * shape.lapLength + 20, TRACK_HALF_WIDTH + 4);
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(p.x, 5, p.z);
      dummy.scale.set(0.25, 10, 0.25);
      dummy.updateMatrix();
      lamps.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, 10.4, p.z);
      dummy.scale.set(1, 0.6, 1);
      dummy.updateMatrix();
      lampHeads.current?.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < hedgeCount; i++) {
      const p = trackPoint(shape, (i / hedgeCount) * shape.lapLength, -TRACK_HALF_WIDTH - 2);
      dummy.position.set(p.x, 0.5, p.z);
      dummy.rotation.set(0, p.heading, 0);
      dummy.scale.set(1.1, 1, 3.4);
      dummy.updateMatrix();
      hedges.current?.setMatrixAt(i, dummy.matrix);
      hedges.current?.setColorAt(i, color.setHSL(0.3, 0.55, 0.22 + rnd() * 0.08));
    }
    for (let i = 0; i < cloudCount; i++) {
      const angle = rnd() * Math.PI * 2;
      dummy.position.set(Math.cos(angle) * (90 + rnd() * 120), 70 + rnd() * 40, Math.sin(angle) * (90 + rnd() * 120));
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(25 + rnd() * 25, 5 + rnd() * 3, 12 + rnd() * 8);
      dummy.updateMatrix();
      clouds.current?.setMatrixAt(i, dummy.matrix);
    }
    for (const mesh of [boards.current, lamps.current, lampHeads.current, hedges.current, clouds.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, []);

  return (
    <>
      <Gantry />
      <instancedMesh ref={boards} args={[undefined, undefined, boardCount]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[undefined, undefined, lampCount]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial color="#8a8f96" />
      </instancedMesh>
      <instancedMesh ref={lampHeads} args={[undefined, undefined, lampCount]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#fff2c4" emissive="#ffe08a" emissiveIntensity={0.9} />
      </instancedMesh>
      <instancedMesh ref={hedges} args={[undefined, undefined, hedgeCount]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={clouds} args={[undefined, undefined, cloudCount]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 6]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.35} transparent opacity={0.9} />
      </instancedMesh>
    </>
  );
}
