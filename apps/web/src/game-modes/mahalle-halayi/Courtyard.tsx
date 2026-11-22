import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { EffectDirector } from '../../game-renderer/effect-director';
import { FLOOR_CENTER_Z, looks } from './scene-config';

/** Two-tone tile pattern from a 2×2 texture, repeated: no image assets needed. */
function useTileTexture() {
  return useMemo(() => {
    const light = [233, 200, 146, 255];
    const dark = [217, 178, 116, 255];
    const data = new Uint8Array([...light, ...dark, ...dark, ...light]);
    const texture = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(15, 20);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, []);
}

function Lamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.07, 0.1, 3.2, 8]} />
        <meshStandardMaterial color="#4a3b34" flatShading />
      </mesh>
      <mesh position={[0, 3.3, 0]}>
        <sphereGeometry args={[0.22, 10, 8]} />
        <meshStandardMaterial color="#fff2b8" emissive="#ffd877" emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

const FLAG_COLORS = ['#e0457b', '#ffd35a', '#2f6fdb', '#7bd88f', '#ffffff'];

/** A string of triangular flags sagging between two points. */
export function Bunting({ from, to, count = 14 }: { from: [number, number, number]; to: [number, number, number]; count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      dummy.position.set(
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t - 0.55 * Math.sin(Math.PI * t),
        from[2] + (to[2] - from[2]) * t,
      );
      dummy.rotation.set(Math.PI, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(FLAG_COLORS[i % FLAG_COLORS.length]!));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [from, to, count]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <coneGeometry args={[0.22, 0.4, 3]} />
      <meshStandardMaterial flatShading side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

function Banner({ x, color }: { x: number; color: string }) {
  return (
    <group position={[x, 0, FLOOR_CENTER_Z - 5.4]}>
      <mesh position={[0, 1.8, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 3.6, 6]} />
        <meshStandardMaterial color="#4a3b34" flatShading />
      </mesh>
      <mesh position={[0, 2.8, 0.02]}>
        <boxGeometry args={[1.1, 1.5, 0.06]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </group>
  );
}

function House({ x, width, height, wall, roof }: { x: number; width: number; height: number; wall: string; roof: string }) {
  return (
    <group position={[x, 0, -11.5]}>
      <mesh position={[0, height / 2, 0]} receiveShadow>
        <boxGeometry args={[width, height, 2.4]} />
        <meshStandardMaterial color={wall} flatShading />
      </mesh>
      <mesh position={[0, height + 0.35, 0]}>
        <boxGeometry args={[width + 0.4, 0.7, 2.8]} />
        <meshStandardMaterial color={roof} flatShading />
      </mesh>
      {[-1, 0, 1].map((i) => (
        <mesh key={i} position={[i * (width / 3.2), height * 0.55, 1.25]}>
          <boxGeometry args={[0.7, 0.9, 0.08]} />
          <meshStandardMaterial color="#5b3b52" emissive="#ffcf7a" emissiveIntensity={0.5} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Musician({ x, instrument }: { x: number; instrument: 'davul' | 'zurna' }) {
  return (
    <group position={[x, 0.5, -7.4]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.5, 4, 8]} />
        <meshStandardMaterial color={instrument === 'davul' ? '#7a3b2e' : '#3e6b5a'} flatShading />
      </mesh>
      <mesh position={[0, 1.3, 0]} castShadow>
        <sphereGeometry args={[0.24, 12, 10]} />
        <meshStandardMaterial color="#e1b48d" flatShading />
      </mesh>
      {instrument === 'davul' ? (
        <mesh position={[0, 0.7, 0.45]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.38, 0.38, 0.35, 14]} />
          <meshStandardMaterial color="#b8793d" flatShading />
        </mesh>
      ) : (
        <mesh position={[0, 1.15, 0.5]} rotation={[Math.PI / 2.4, 0, 0]} castShadow>
          <coneGeometry args={[0.2, 0.8, 8]} />
          <meshStandardMaterial color="#d8a24a" flatShading />
        </mesh>
      )}
    </group>
  );
}

/** The band on the stage; bounces for a while when a big celebration starts. */
function Band({ director }: { director: EffectDirector }) {
  const group = useRef<THREE.Group>(null);
  const boost = useRef(0);
  useEffect(
    () =>
      director.subscribe((start) => {
        if (start.recipe.musicians === 'bounce') boost.current = performance.now() + 4000;
      }),
    [director],
  );
  useFrame(() => {
    const now = performance.now();
    if (!group.current) return;
    const active = now < boost.current;
    group.current.position.y = active ? 0.18 * Math.abs(Math.sin(now / 130)) : 0.03 * Math.sin(now / 420);
  });
  return (
    <group ref={group}>
      <Musician x={-1.7} instrument="zurna" />
      <Musician x={0} instrument="davul" />
      <Musician x={1.7} instrument="zurna" />
    </group>
  );
}

/** The wedding courtyard built from primitives: the fallback if the modelled courtyard cannot load. */
export function PrimitiveCourtyard({ director }: { director: EffectDirector }) {
  const tiles = useTileTexture();
  const bunting = useMemo(
    () => ({
      backLeft: [-5.2, 3.3, -3.5] as [number, number, number],
      backRight: [5.2, 3.3, -3.5] as [number, number, number],
      frontLeft: [-5.2, 3.3, 5.5] as [number, number, number],
      frontRight: [5.2, 3.3, 5.5] as [number, number, number],
    }),
    [],
  );

  return (
    <>
      {/* ground and tiles */}
      <mesh position={[0, -0.2, -2]} receiveShadow>
        <boxGeometry args={[40, 0.4, 44]} />
        <meshStandardMaterial color="#7a5a45" flatShading />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 2]} receiveShadow>
        <planeGeometry args={[30, 40]} />
        <meshStandardMaterial map={tiles} roughness={0.9} />
      </mesh>

      {/* dance floor */}
      <mesh position={[0, 0.03, FLOOR_CENTER_Z]} receiveShadow>
        <cylinderGeometry args={[3.9, 3.9, 0.06, 40]} />
        <meshStandardMaterial color="#b0553f" flatShading />
      </mesh>
      <mesh position={[0, 0.07, FLOOR_CENTER_Z]} receiveShadow>
        <cylinderGeometry args={[3.5, 3.5, 0.06, 40]} />
        <meshStandardMaterial color="#f3dfb6" flatShading />
      </mesh>

      {/* stage and band */}
      <mesh position={[0, 0.25, -7.6]} castShadow receiveShadow>
        <boxGeometry args={[6.4, 0.5, 2.6]} />
        <meshStandardMaterial color="#8c5a3c" flatShading />
      </mesh>
      <Band director={director} />

      <House x={-5} width={5} height={4} wall="#e6b88a" roof="#b3472f" />
      <House x={0.5} width={4.4} height={5.2} wall="#c9806b" roof="#8f3a2c" />
      <House x={5.4} width={5} height={3.6} wall="#e0a56f" roof="#b3472f" />

      <Lamp position={[-5.2, 0, -3.5]} />
      <Lamp position={[5.2, 0, -3.5]} />
      <Lamp position={[-5.2, 0, 5.5]} />
      <Lamp position={[5.2, 0, 5.5]} />
      <Bunting from={bunting.backLeft} to={bunting.backRight} />
      <Bunting from={bunting.frontLeft} to={bunting.frontRight} />
      <Bunting from={bunting.backLeft} to={bunting.frontLeft} count={10} />
      <Bunting from={bunting.backRight} to={bunting.frontRight} count={10} />

      <Banner x={-3.2} color={looks.gelin!.bodyColor} />
      <Banner x={3.2} color={looks.damat!.bodyColor} />
    </>
  );
}

/** Sky colour, fog and lights, shared by the modelled and primitive courtyards. */
export function Lighting() {
  return (
    <>
      <color attach="background" args={['#6a4a85']} />
      <fog attach="fog" args={['#6a4a85', 30, 60]} />
      <hemisphereLight args={['#ffe6c4', '#5b4036', 1.15]} />
      <directionalLight
        position={[7, 14, 8]}
        intensity={2.2}
        color="#ffe2b0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={40}
      />
    </>
  );
}
