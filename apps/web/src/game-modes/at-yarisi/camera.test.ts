import { describe, expect, it } from 'vitest';
import { chaseCamera, damp, dampAngle, focusOf, gridCamera, turnBetween } from './camera';
import { trackShape } from './track';

describe('damping', () => {
  it('approaches the target without overshooting, at the same speed whatever the frame rate', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 10, 5, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = damp(b, 10, 5, 1 / 30);
    expect(a).toBeCloseTo(b, 5);
    expect(a).toBeGreaterThan(9);
    expect(a).toBeLessThanOrEqual(10);
  });

  it('turns the short way round an angle', () => {
    expect(turnBetween(3, -3)).toBeCloseTo(2 * Math.PI - 6, 5);
    expect(Math.abs(turnBetween(dampAngle(3.1, -3.1, 50, 1), -3.1))).toBeLessThan(0.05);
    expect(Math.abs(dampAngle(3.1, -3.1, 1, 0.01) - 3.1)).toBeLessThan(0.1);
  });
});

describe('focus and chase camera', () => {
  it('focuses on the middle of the leading group, using the horses furthest ahead', () => {
    const focus = focusOf([
      { x: 0, z: 0, heading: 0, distance: 300 },
      { x: 2, z: 2, heading: 0, distance: 290 },
      { x: 4, z: 4, heading: 0, distance: 280 },
      { x: 100, z: 100, heading: 0, distance: 10 },
    ])!;
    expect(focus.x).toBeCloseTo(2);
    expect(focus.z).toBeCloseTo(2);
    expect(focusOf([])).toBeNull();
  });

  it('averages headings around the wrap (just either side of north is still north)', () => {
    const focus = focusOf([
      { x: 0, z: 0, heading: Math.PI - 0.1, distance: 3 },
      { x: 0, z: 0, heading: -Math.PI + 0.1, distance: 2 },
    ])!;
    expect(Math.abs(Math.cos(focus.heading) + 1)).toBeLessThan(0.01);
  });

  it('sits behind and above the focus and looks ahead along its heading', () => {
    const camera = chaseCamera({ x: 10, z: 20, heading: 0 }); // facing +z
    expect(camera.position[2]).toBeLessThan(20);
    expect(camera.position[1]).toBeGreaterThan(5);
    expect(camera.lookAt[2]).toBeGreaterThan(20);
    const turned = chaseCamera({ x: 0, z: 0, heading: Math.PI / 2 }); // facing +x
    expect(turned.position[0]).toBeLessThan(0);
    expect(turned.lookAt[0]).toBeGreaterThan(0);
  });

  it('arcs round the start before the race', () => {
    const shape = trackShape(400);
    const early = gridCamera(shape, 0);
    const late = gridCamera(shape, 12);
    expect(early.position).not.toEqual(late.position);
    expect(gridCamera(shape, 99).position).toEqual(late.position); // it stops arcing
    expect(gridCamera(shape, -5).position).toEqual(early.position);
  });
});
