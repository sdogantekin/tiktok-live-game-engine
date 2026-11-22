import * as THREE from 'three';
import type { Vec3 } from './types';

const GRAVITY = -9;
const dummy = new THREE.Object3D();

interface Particle {
  alive: boolean;
  born: number;
  life: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: number;
}

export interface ConfettiBurst {
  count: number;
  colors: readonly string[];
  origin: Vec3;
  spread: number;
  lift: number;
}

/** Fixed-size confetti simulation, so a spam of gifts can never grow memory. */
export class ConfettiPool {
  private readonly particles: Particle[];
  private cursor = 0;

  constructor(readonly size: number) {
    this.particles = Array.from({ length: size }, () => ({
      alive: false,
      born: 0,
      life: 1,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      spin: 0,
    }));
  }

  /** Starts a burst; the oldest particles are recycled if the pool is full. Colours are written to `mesh`. */
  spawn(burst: ConfettiBurst, now: number, mesh: THREE.InstancedMesh | null): void {
    const colors = burst.colors.map((c) => new THREE.Color(c));
    for (let i = 0; i < burst.count; i++) {
      const index = this.cursor++ % this.size;
      const particle = this.particles[index]!;
      particle.alive = true;
      particle.born = now;
      particle.life = 1400 + Math.random() * 1200;
      particle.pos.set(burst.origin[0] + (Math.random() - 0.5) * 0.6, burst.origin[1] + 0.8, burst.origin[2] + (Math.random() - 0.5) * 0.6);
      particle.vel.set((Math.random() - 0.5) * burst.spread * 2, burst.lift * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * burst.spread * 2);
      particle.spin = (Math.random() - 0.5) * 12;
      mesh?.setColorAt(index, colors[i % colors.length]!);
    }
    if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Advances the simulation and writes every instance matrix (dead particles collapse to scale 0). */
  step(mesh: THREE.InstancedMesh, now: number, dtSeconds: number): void {
    const dt = Math.min(dtSeconds, 0.05);
    for (let i = 0; i < this.size; i++) {
      const p = this.particles[i]!;
      if (p.alive && now - p.born > p.life) p.alive = false;
      if (!p.alive) {
        dummy.scale.setScalar(0);
      } else {
        p.vel.y += GRAVITY * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.pos.y < 0.05) {
          p.pos.y = 0.05;
          p.vel.set(p.vel.x * 0.4, 0, p.vel.z * 0.4);
        }
        const age = (now - p.born) / 1000;
        dummy.position.copy(p.pos);
        dummy.rotation.set(p.spin * age, p.spin * 0.7 * age, 0);
        dummy.scale.setScalar(0.16);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

export interface RingState {
  visible: boolean;
  x: number;
  z: number;
  scale: number;
  opacity: number;
  color: THREE.Color;
}

/** Expanding ground rings from a fixed pool. */
export class RingPool {
  private readonly rings: ({ start: number; duration: number; x: number; z: number; color: THREE.Color } | null)[];
  private cursor = 0;

  constructor(readonly size: number) {
    this.rings = Array.from({ length: size }, () => null);
  }

  spawn(count: number, color: string, origin: Vec3, now: number): void {
    for (let i = 0; i < count; i++) {
      this.rings[this.cursor++ % this.size] = {
        start: now + i * 220,
        duration: 1100,
        x: origin[0],
        z: origin[2],
        color: new THREE.Color(color),
      };
    }
  }

  state(index: number, now: number, out: RingState): RingState {
    const ring = this.rings[index];
    const progress = ring ? (now - ring.start) / ring.duration : 2;
    out.visible = ring != null && progress >= 0 && progress <= 1;
    if (ring && out.visible) {
      out.x = ring.x;
      out.z = ring.z;
      out.scale = 0.6 + progress * 5.5;
      out.opacity = 0.85 * (1 - progress);
      out.color = ring.color;
    }
    return out;
  }
}
