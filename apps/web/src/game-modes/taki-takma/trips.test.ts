import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../game-renderer/types';
import { milestonesPassed, ReactionGate, TRIP_MS, tripPose, Trips, turnBetween } from './trips';

const home: Vec3 = [2.3, 0, 3];
const spot: Vec3 = [1, 0, -4.5];
const FACING = Math.PI; // faces -z, towards the couple

describe('tripPose', () => {
  it('starts and ends in the queue facing the couple', () => {
    const start = tripPose(home, FACING, spot, FACING, 0);
    const end = tripPose(home, FACING, spot, FACING, 1);
    for (const pose of [start, end]) {
      expect(pose.position[0]).toBeCloseTo(home[0], 5);
      expect(pose.position[2]).toBeCloseTo(home[2], 5);
      expect(Math.abs(turnBetween(pose.rotationY, FACING))).toBeLessThan(1e-6);
    }
    expect(start.phase).toBe('out');
  });

  it('walks to the spot, stands there while pinning, then walks back', () => {
    expect(tripPose(home, FACING, spot, FACING, 0.2).phase).toBe('out');
    const pinning = tripPose(home, FACING, spot, FACING, 0.5);
    expect(pinning.phase).toBe('pin');
    expect(pinning.position[0]).toBeCloseTo(spot[0], 5);
    expect(pinning.position[2]).toBeCloseTo(spot[2], 5);
    expect(Math.abs(turnBetween(pinning.rotationY, FACING))).toBeLessThan(1e-6);
    expect(tripPose(home, FACING, spot, FACING, 0.8).phase).toBe('back');
  });

  it('moves towards the spot on the way out and towards home on the way back', () => {
    const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
    expect(dist(tripPose(home, FACING, spot, FACING, 0.3).position, spot)).toBeLessThan(dist(tripPose(home, FACING, spot, FACING, 0.1).position, spot));
    expect(dist(tripPose(home, FACING, spot, FACING, 0.95).position, home)).toBeLessThan(dist(tripPose(home, FACING, spot, FACING, 0.7).position, home));
  });

  it('turns the short way round and clamps progress', () => {
    expect(turnBetween(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(Math.abs(turnBetween(3, -3))).toBeLessThan(0.3);
    expect(tripPose(home, FACING, spot, FACING, -5).position).toEqual(tripPose(home, FACING, spot, FACING, 0).position);
    expect(tripPose(home, FACING, spot, FACING, 9).phase).toBe('back');
  });
});

describe('Trips', () => {
  it('starts one trip at a time and ends it after the trip time', () => {
    const trips = new Trips();
    expect(trips.begin('a', 1000)).toBe(true);
    expect(trips.begin('a', 2000)).toBe(false);
    expect(trips.active('a', 1000 + TRIP_MS - 1)).not.toBeNull();
    expect(trips.active('a', 1000 + TRIP_MS)).toBeNull();
    expect(trips.begin('a', 1000 + TRIP_MS)).toBe(true);
  });

  it('carries the biggest announced takı, once', () => {
    const trips = new Trips();
    trips.announce('a', 3);
    trips.announce('a', 2);
    trips.begin('a', 0);
    expect(trips.active('a', 1)?.size).toBe(3);
    trips.begin('a', TRIP_MS + 1);
    expect(trips.active('a', TRIP_MS + 2)?.size).toBe(1);
  });

  it('forgets guests who left the screen', () => {
    const trips = new Trips();
    trips.begin('a', 0);
    trips.begin('b', 0);
    trips.keepOnly(new Set(['b']));
    expect(trips.active('a', 1)).toBeNull();
    expect(trips.active('b', 1)).not.toBeNull();
  });
});

describe('ReactionGate and milestones', () => {
  it('allows a reaction once per gap, per key', () => {
    const gate = new ReactionGate(1000);
    expect(gate.allow('bride', 0)).toBe(true);
    expect(gate.allow('bride', 999)).toBe(false);
    expect(gate.allow('groom', 999)).toBe(true);
    expect(gate.allow('bride', 1000)).toBe(true);
  });

  it('counts the milestones a score passes', () => {
    expect(milestonesPassed(0, 24, 25)).toBe(0);
    expect(milestonesPassed(24, 25, 25)).toBe(1);
    expect(milestonesPassed(20, 80, 25)).toBe(3);
    expect(milestonesPassed(80, 0, 25)).toBe(0); // a new round resets the score
  });
});

describe('Reactions', () => {
  it('plays a reaction for its duration, then the figure goes back to standing', async () => {
    const { Reactions } = await import('./trips');
    const reactions = new Reactions();
    expect(reactions.playing('bride', 0)).toBeUndefined();
    reactions.fire('bride', 'special', 100);
    expect(reactions.playing('bride', 1000)).toMatchObject({ kind: 'special', start: 100 });
    expect(reactions.playing('bride', 100 + 1700)).toBeUndefined();
    expect(reactions.playing('groom', 1000)).toBeUndefined();
  });
});
