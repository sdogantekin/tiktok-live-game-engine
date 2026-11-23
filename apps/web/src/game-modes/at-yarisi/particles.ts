/** What a particle starts with. Positions are metres, velocities metres per second, times seconds. */
export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** How long it lives. */
  life: number;
  /** Its size when born and when it dies; in between it grows and shrinks smoothly (a puff swells, then thins away). */
  size0: number;
  size1: number;
  /** Downwards pull (metres per second squared); 0 for smoke and streaks. */
  gravity: number;
  /** Rotation about the vertical axis, for things that point along something (a streak). */
  heading: number;
  /** An index for the caller to look up a colour with. */
  tint: number;
}

export interface Particle extends ParticleSpec {
  age: number;
  /** 0 when born, 1 when it dies. */
  t: number;
  /** Its size right now. */
  size: number;
}

/** A fixed number of particles: spawning when it is full recycles the oldest, so a flood can never grow memory. Pure: no rendering. */
export class ParticlePool {
  private readonly slots: (Particle | null)[];
  private cursor = 0;

  constructor(readonly capacity: number) {
    this.slots = Array.from({ length: capacity }, () => null);
  }

  spawn(spec: ParticleSpec): void {
    this.slots[this.cursor++ % this.capacity] = { ...spec, age: 0, t: 0, size: spec.size0 };
  }

  get alive(): number {
    return this.slots.reduce((n, p) => n + (p ? 1 : 0), 0);
  }

  /** Moves, ages and sizes everything; the dead are dropped. */
  step(dtSeconds: number): void {
    const dt = Math.min(dtSeconds, 0.05);
    for (let i = 0; i < this.slots.length; i++) {
      const p = this.slots[i];
      if (!p) continue;
      p.age += dt;
      if (p.age >= p.life) {
        this.slots[i] = null;
        continue;
      }
      p.t = p.age / p.life;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.gravity > 0 && p.y < 0.05) {
        p.y = 0.05; // confetti lands and slides to a stop
        p.vy = 0;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      // grow to the middle of its life, then thin away
      p.size = p.size0 + (p.size1 - p.size0) * Math.sin(Math.PI * p.t);
    }
  }

  /** Calls `visit` for every live particle (or `empty` for each free slot, so a renderer can hide it). */
  forEach(visit: (p: Particle, slot: number) => void, empty?: (slot: number) => void): void {
    this.slots.forEach((p, i) => (p ? visit(p, i) : empty?.(i)));
  }
}
