import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { COUPLE_Z, METER_FULL_AT, PODIUM_HEIGHT } from './scene-config';

const METER_Z = -7.55;
const METER_LENGTH = 4.6;
const METER_GAP = 0.35;
const METER_DEPTH = 0.55;

/** Evening light over a wedding hall. */
export function Lighting() {
  return (
    <>
      <color attach="background" args={['#3a2548']} />
      <fog attach="fog" args={['#3a2548', 34, 64]} />
      <hemisphereLight args={['#fff0d6', '#6a4a40', 1.2]} />
      <directionalLight
        position={[6, 15, 9]}
        intensity={2.1}
        color="#ffe6b8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={44}
      />
    </>
  );
}

/** How full a side's meter is (0..1) for a score: it counts as full at `METER_FULL_AT` points and stays full beyond. */
export const meterFill = (score: number) => Math.min(1, Math.max(0, score / METER_FULL_AT));

/** A gold bar on the floor that fills outwards from the middle as a side collects takı. Eased towards its target. */
function Meter({ side, score, color }: { side: -1 | 1; score: number; color: string }) {
  const fill = useRef<THREE.Mesh>(null);
  const shown = useRef(0);
  const target = meterFill(score);
  useFrame((_, delta) => {
    shown.current += (target - shown.current) * Math.min(1, delta * 4);
    const mesh = fill.current;
    if (!mesh) return;
    const length = Math.max(0.001, shown.current * METER_LENGTH);
    mesh.scale.x = length;
    mesh.position.x = side * (METER_GAP + length / 2);
  });

  return (
    <group position={[0, 0, METER_Z]}>
      <mesh position={[side * (METER_GAP + METER_LENGTH / 2), 0.03, 0]} receiveShadow>
        <boxGeometry args={[METER_LENGTH + 0.2, 0.06, METER_DEPTH + 0.2]} />
        <meshStandardMaterial color="#2b1d33" />
      </mesh>
      <mesh ref={fill} position={[side * METER_GAP, 0.09, 0]}>
        <boxGeometry args={[1, 0.1, METER_DEPTH]} />
        <meshStandardMaterial color="#ffd35a" emissive="#b8860b" emissiveIntensity={0.5} metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[side * (METER_GAP + METER_LENGTH + 0.2), 0.09, 0]}>
        <boxGeometry args={[0.25, 0.14, METER_DEPTH + 0.2]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

/** The wedding hall: parquet floor, a red carpet down the middle, the couple's podium, curtains, lamps and the two meters. */
export function Hall({ scores, colors }: { scores: Readonly<Record<string, number>>; colors: Readonly<Record<string, string>> }) {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[18, 26]} />
        <meshStandardMaterial color="#c9a26b" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 1.2]} receiveShadow>
        <planeGeometry args={[1.7, 17]} />
        <meshStandardMaterial color="#9b2335" />
      </mesh>
      {/* gold edging of the carpet */}
      {[-1, 1].map((side) => (
        <mesh key={side} rotation={[-Math.PI / 2, 0, 0]} position={[side * 0.88, 0.015, 1.2]}>
          <planeGeometry args={[0.07, 17]} />
          <meshStandardMaterial color="#ffd35a" />
        </mesh>
      ))}
      <mesh position={[0, PODIUM_HEIGHT / 2, COUPLE_Z - 0.05]} castShadow receiveShadow>
        <boxGeometry args={[9.6, PODIUM_HEIGHT, 2.1]} />
        <meshStandardMaterial color="#f1e3c8" />
      </mesh>
      <mesh position={[0, 0.2, COUPLE_Z + 1.02]}>
        <boxGeometry args={[9.6, 0.04, 0.06]} />
        <meshStandardMaterial color="#ffd35a" />
      </mesh>
      {/* back wall with curtains */}
      <mesh position={[0, 2.5, -9.4]} receiveShadow>
        <boxGeometry args={[18, 5, 0.3]} />
        <meshStandardMaterial color="#e9d7b5" />
      </mesh>
      {[-7, -3.6, 3.6, 7].map((x) => (
        <mesh key={x} position={[x, 2.4, -9.15]} castShadow>
          <boxGeometry args={[2.2, 4.6, 0.25]} />
          <meshStandardMaterial color="#8c2f39" />
        </mesh>
      ))}
      <mesh position={[0, 4.4, -9.1]}>
        <boxGeometry args={[18, 0.22, 0.3]} />
        <meshStandardMaterial color="#ffd35a" />
      </mesh>
      {/* lamps along the queues */}
      {[-1, 1].flatMap((side) => [-3, 3, 9].map((z) => ({ side, z }))).map(({ side, z }) => (
        <group key={`${side}-${z}`} position={[side * 5.9, 0, z]}>
          <mesh position={[0, 1.4, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 2.8, 6]} />
            <meshStandardMaterial color="#5a3b2e" />
          </mesh>
          <mesh position={[0, 2.95, 0]}>
            <sphereGeometry args={[0.28, 8, 6]} />
            <meshStandardMaterial color="#fff2c4" emissive="#ffd88a" emissiveIntensity={1.4} />
          </mesh>
        </group>
      ))}
      <Meter side={-1} score={scores.gelin ?? 0} color={colors.gelin ?? '#e0457b'} />
      <Meter side={1} score={scores.damat ?? 0} color={colors.damat ?? '#2f6fdb'} />
      <mesh position={[0, 0.02, METER_Z]}>
        <boxGeometry args={[0.5, 0.05, METER_DEPTH + 0.2]} />
        <meshStandardMaterial color="#6a4a40" />
      </mesh>
    </>
  );
}
