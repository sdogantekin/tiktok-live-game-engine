import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { HorseFrame } from './Horses';
import { ParticlePool } from './particles';
import { laneOffset, shape } from './scene-config';
import { racerColor, trackPoint } from './track';

/** What the scene can ask of the effects. */
export interface RaceFx {
  /** A shower of confetti over a place on the ground (the winner). */
  burst(x: number, z: number): void;
}

const CONFETTI = ['#ffd35a', '#ffffff', '#e0457b', '#2f6fdb', '#58b368', '#ff8a3d', '#8e44ad', '#f2b705'].map((c) => new THREE.Color(c));
const dummy = new THREE.Object3D();
const color = new THREE.Color();

const DUST_EVERY = 0.1; // seconds between puffs from one running horse
const STREAK_EVERY = 0.05;

/**
 * Hoof dust behind every running horse, bright speed streaks behind a boosted one, and the winner's confetti. Each is a fixed-size pool
 * drawn as one instanced mesh, so any number of horses and any burst of gifts cost three draw calls and bounded memory.
 */
export function RaceEffects({ frame, fxRef }: { frame: { current: HorseFrame }; fxRef: { current: RaceFx | null } }) {
  const dustMesh = useRef<THREE.InstancedMesh>(null);
  const streakMesh = useRef<THREE.InstancedMesh>(null);
  const confettiMesh = useRef<THREE.InstancedMesh>(null);
  const dust = useMemo(() => new ParticlePool(180), []);
  const streaks = useMemo(() => new ParticlePool(120), []);
  const confetti = useMemo(() => new ParticlePool(320), []);
  const timers = useRef(new Map<string, { dust: number; streak: number }>());

  useEffect(() => {
    fxRef.current = {
      burst(x, z) {
        for (let i = 0; i < 260; i++) {
          confetti.spawn({
            x: x + (Math.random() - 0.5) * 3,
            y: 1.5,
            z: z + (Math.random() - 0.5) * 3,
            vx: (Math.random() - 0.5) * 12,
            vy: 9 + Math.random() * 7,
            vz: (Math.random() - 0.5) * 12,
            life: 3 + Math.random() * 1.5,
            size0: 0.45,
            size1: 0.45,
            gravity: 11,
            heading: Math.random() * 6.28,
            tint: Math.floor(Math.random() * CONFETTI.length),
          });
        }
      },
    };
    return () => {
      fxRef.current = null;
    };
  }, [fxRef, confetti]);

  useFrame((_, delta) => {
    const { racers, stage } = frame.current;
    const live = timers.current;
    const seen = new Set<string>();
    if (stage === 'racing') {
      racers.forEach((racer, lane) => {
        if (racer.place !== null || racer.speed < 4) return;
        seen.add(racer.id);
        const t = live.get(racer.id) ?? { dust: Math.random() * DUST_EVERY, streak: 0 };
        live.set(racer.id, t);
        t.dust += delta;
        t.streak += delta;
        const p = trackPoint(shape, racer.distance, laneOffset(lane, racers.length));
        const fx_ = Math.sin(p.heading);
        const fz_ = Math.cos(p.heading);
        while (t.dust >= DUST_EVERY) {
          t.dust -= DUST_EVERY;
          dust.spawn({
            x: p.x - fx_ * 1.5 + (Math.random() - 0.5) * 0.9,
            y: 0.2,
            z: p.z - fz_ * 1.5 + (Math.random() - 0.5) * 0.9,
            vx: -fx_ * 1.2 + (Math.random() - 0.5) * 1.5,
            vy: 0.7 + Math.random() * 0.8,
            vz: -fz_ * 1.2 + (Math.random() - 0.5) * 1.5,
            life: 0.7 + Math.random() * 0.5,
            size0: 0.2,
            size1: 1.05,
            gravity: 0,
            heading: 0,
            tint: 0,
          });
        }
        if (racer.boost > 0.25) {
          while (t.streak >= STREAK_EVERY) {
            t.streak -= STREAK_EVERY;
            const side = (Math.random() - 0.5) * 1.6;
            streaks.spawn({
              x: p.x - fx_ * 2.2 + fz_ * side,
              y: 0.4 + Math.random() * 1.6,
              z: p.z - fz_ * 2.2 - fx_ * side,
              vx: -fx_ * 2,
              vy: 0,
              vz: -fz_ * 2,
              life: 0.4,
              size0: 0.5,
              size1: 3.6,
              gravity: 0,
              heading: p.heading,
              tint: lane,
            });
          }
        } else t.streak = 0;
      });
    }
    for (const id of [...live.keys()]) if (!seen.has(id)) live.delete(id);

    dust.step(delta);
    streaks.step(delta);
    confetti.step(delta);

    const dustTarget = dustMesh.current;
    if (dustTarget) {
      dust.forEach(
        (p, i) => {
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(p.size * (1 - p.t * 0.4));
          dummy.updateMatrix();
          dustTarget.setMatrixAt(i, dummy.matrix);
        },
        (i) => {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          dustTarget.setMatrixAt(i, dummy.matrix);
        },
      );
      dustTarget.instanceMatrix.needsUpdate = true;
    }
    const streakTarget = streakMesh.current;
    if (streakTarget) {
      streaks.forEach(
        (p, i) => {
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(0, p.heading, 0);
          dummy.scale.set(0.09, 0.09, p.size * (1 - p.t * 0.7));
          dummy.updateMatrix();
          streakTarget.setMatrixAt(i, dummy.matrix);
          const racer = frame.current.racers[p.tint];
          streakTarget.setColorAt(i, color.set(racer ? racerColor(racer.id) : '#ffd35a').lerp(CONFETTI[1]!, 0.5));
        },
        (i) => {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          streakTarget.setMatrixAt(i, dummy.matrix);
        },
      );
      streakTarget.instanceMatrix.needsUpdate = true;
      if (streakTarget.instanceColor) streakTarget.instanceColor.needsUpdate = true;
    }
    const confettiTarget = confettiMesh.current;
    if (confettiTarget) {
      confetti.forEach(
        (p, i) => {
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(p.heading + p.age * 7, p.heading * 0.5 + p.age * 5, 0);
          dummy.scale.setScalar(p.size);
          dummy.updateMatrix();
          confettiTarget.setMatrixAt(i, dummy.matrix);
          confettiTarget.setColorAt(i, CONFETTI[p.tint % CONFETTI.length]!);
        },
        (i) => {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          confettiTarget.setMatrixAt(i, dummy.matrix);
        },
      );
      confettiTarget.instanceMatrix.needsUpdate = true;
      if (confettiTarget.instanceColor) confettiTarget.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={dustMesh} args={[undefined, undefined, 180]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#d9c49c" transparent opacity={0.34} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={streakMesh} args={[undefined, undefined, 120]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
      <instancedMesh ref={confettiMesh} args={[undefined, undefined, 320]} frustumCulled={false}>
        <boxGeometry args={[1, 0.6, 0.06]} />
        <meshBasicMaterial />
      </instancedMesh>
    </>
  );
}
