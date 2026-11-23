import { describe, expect, it } from 'vitest';
import { BASE_BPM, BeatClock, bpmForEnergy, loopPhase, MAX_BPM, orbitPose, stepSide, triangleTravel } from './beat-clock';

describe('BeatClock', () => {
  it('counts beats at the tempo', () => {
    const clock = new BeatClock();
    clock.tick(0, 0);
    for (let t = 100; t <= 5000; t += 100) clock.tick(t, 0);
    expect(clock.beats).toBeCloseTo((5 * BASE_BPM) / 60, 1);
  });

  it('speeds up with energy, but gradually', () => {
    const clock = new BeatClock();
    clock.tick(0, 1);
    clock.tick(100, 1);
    expect(clock.bpm).toBeLessThan(BASE_BPM + 2); // no jump
    for (let t = 200; t <= 10_000; t += 100) clock.tick(t, 1);
    expect(clock.bpm).toBeCloseTo(MAX_BPM, 5);
  });

  it('never moves backwards and ignores long stalls', () => {
    const clock = new BeatClock();
    clock.tick(1000, 0);
    clock.tick(500, 0); // clock went backwards
    expect(clock.beats).toBe(0);
    clock.tick(60_000, 0); // tab was suspended for a minute
    expect(clock.beats).toBeLessThan(1);
  });

  it('maps energy to a bounded tempo', () => {
    expect(bpmForEnergy(-1)).toBe(BASE_BPM);
    expect(bpmForEnergy(0.5)).toBe((BASE_BPM + MAX_BPM) / 2);
    expect(bpmForEnergy(7)).toBe(MAX_BPM);
  });
});

describe('loopPhase', () => {
  it('wraps within 0..1', () => {
    expect(loopPhase(0, 2)).toBe(0);
    expect(loopPhase(1, 2)).toBe(0.5);
    expect(loopPhase(2, 2)).toBe(0);
    expect(loopPhase(5.5, 2)).toBeCloseTo(0.75);
  });
});

describe('triangleTravel', () => {
  it('walks one way, turns, and comes back at constant speed', () => {
    expect(triangleTravel(0, 8, 1.2)).toEqual({ distance: -1.2, direction: 1 });
    expect(triangleTravel(4, 8, 1.2).distance).toBeCloseTo(0);
    expect(triangleTravel(7.99, 8, 1.2).distance).toBeCloseTo(1.2, 1);
    const back = triangleTravel(12, 8, 1.2);
    expect(back.direction).toBe(-1);
    expect(back.distance).toBeCloseTo(0);
    expect(triangleTravel(16, 8, 1.2).distance).toBeCloseTo(-1.2);
  });

  it('stays within the amplitude', () => {
    for (let beat = 0; beat < 64; beat += 0.37) expect(Math.abs(triangleTravel(beat, 8, 1.2).distance)).toBeLessThanOrEqual(1.2 + 1e-9);
  });
});

describe('stepSide', () => {
  it('steps to the body-left when the line moves that way', () => {
    // The gelin line stands on the left of the stage facing +x (rotationY = +90°): its left is -z (away from the camera).
    expect(stepSide(Math.PI / 2, [0, -1])).toBe('left');
    expect(stepSide(Math.PI / 2, [0, 1])).toBe('right');
    // The damat line faces -x: the same world direction is the other side of the body.
    expect(stepSide(-Math.PI / 2, [0, -1])).toBe('right');
    expect(stepSide(-Math.PI / 2, [0, 1])).toBe('left');
  });
});

describe('orbitPose', () => {
  const orbit = { centre: [0, 0, 1] as const, radius: 0.6, phase: 0, beatsPerTurn: 12 };

  it('stays on the circle and faces the centre', () => {
    for (let beat = 0; beat < 24; beat += 0.7) {
      const { x, z, rotationY } = orbitPose(beat, orbit);
      expect(Math.hypot(x, z - 1)).toBeCloseTo(0.6);
      // Facing direction (sin, cos) of rotationY points from the dancer to the centre.
      expect(Math.sin(rotationY) * 0.6).toBeCloseTo(-x);
      expect(Math.cos(rotationY) * 0.6).toBeCloseTo(1 - z);
    }
  });

  it('walks along the circle, so a dancer facing the centre side-steps the same way all the way round', () => {
    for (let beat = 0; beat < 24; beat += 1.3) {
      const { x, z, rotationY, heading } = orbitPose(beat, orbit);
      expect(heading[0] * x + heading[1] * (z - 1)).toBeCloseTo(0); // tangent: no radial component
      expect(stepSide(rotationY, heading)).toBe(stepSide(orbitPose(0, orbit).rotationY, orbitPose(0, orbit).heading));
    }
  });

  it('keeps the two dancers opposite each other and completes a turn per beatsPerTurn', () => {
    const a = orbitPose(3, orbit);
    const b = orbitPose(3, { ...orbit, phase: Math.PI });
    expect(a.x + b.x).toBeCloseTo(0);
    expect(a.z + b.z).toBeCloseTo(2);
    expect(orbitPose(12, orbit).x).toBeCloseTo(orbitPose(0, orbit).x);
  });
});
