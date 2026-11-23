import { describe, expect, it } from 'vitest';
import { computeTagAnchors, floatingAnchors, floatingKey, projectToStage, slotKey, type SlotOccupant, tagShift, TagBoard } from './name-tags';
import type { CameraConfig, Formation } from './types';

const camera: CameraConfig = { position: [0, 22, 19], lookAt: [0, 0, -2.2], fov: 52 };

const formation: Formation = {
  avatar: (teamId, index, count) => {
    const side = teamId === 'gelin' ? -1 : 1;
    return { position: [side * (2.5 + index * 0.1), 0, -2 + (index / Math.max(1, count - 1)) * 6], rotationY: 0 };
  },
  crowd: () => ({ position: [0, 0, 0], rotationY: 0 }),
};

describe('projectToStage', () => {
  it('maps the look-at point near the middle and keeps left/right and up/down orientation', () => {
    const centre = projectToStage(camera, [0, 0, -2.2]);
    expect(centre.x).toBeCloseTo(0.5, 2);
    expect(centre.y).toBeCloseTo(0.5, 2);

    expect(projectToStage(camera, [-3, 0, -2.2]).x).toBeLessThan(0.5);
    expect(projectToStage(camera, [3, 0, -2.2]).x).toBeGreaterThan(0.5);
    expect(projectToStage(camera, [0, 2, -2.2]).y).toBeLessThan(0.5); // higher in the world = higher on screen
    expect(projectToStage(camera, [0, 0, 4]).y).toBeGreaterThan(0.5); // nearer the camera = lower on screen
  });
});

describe('computeTagAnchors', () => {
  const anchors = computeTagAnchors(camera, formation, { gelin: 3, damat: 3 });

  it('creates an anchor for every slot', () => {
    expect(Object.keys(anchors).sort()).toEqual(['damat-0', 'damat-1', 'damat-2', 'gelin-0', 'gelin-1', 'gelin-2']);
  });

  it('puts small tags on the side facing the middle and big tags above the head', () => {
    const left = anchors[slotKey('gelin', 1)]!;
    const right = anchors[slotKey('damat', 1)]!;
    expect(left.side).toBe('right');
    expect(right.side).toBe('left');
    expect(left.small.x).toBeGreaterThan(projectToStage(camera, formation.avatar('gelin', 1, 3).position).x);
    expect(right.small.x).toBeLessThan(projectToStage(camera, formation.avatar('damat', 1, 3).position).x);
    expect(left.big.y).toBeLessThan(left.small.y);
  });

  it('keeps neighbouring small tags apart vertically', () => {
    const ys = [0, 1, 2].map((i) => anchors[slotKey('gelin', i)]!.small.y);
    expect(ys[1]! - ys[0]!).toBeGreaterThan(0.01);
    expect(ys[2]! - ys[1]!).toBeGreaterThan(0.01);
  });
});

describe('TagBoard', () => {
  const anchors = computeTagAnchors(camera, formation, { gelin: 2, damat: 2 });
  const occupant = (key: string, playerId: string | null, name = playerId ?? ''): SlotOccupant => ({ slotKey: key, playerId, name, teamId: key.split('-')[0]! });

  function setup() {
    let now = 1000;
    const board = new TagBoard(anchors, () => now, 2500);
    let notifications = 0;
    board.subscribe(() => notifications++);
    return { board, advance: (ms: number) => (now += ms), notifications: () => notifications };
  }

  it('shows one label per occupied slot and hides empty ones', () => {
    const { board } = setup();
    board.setOccupants([occupant('gelin-0', 'a', 'Ayşe'), occupant('gelin-1', null), occupant('damat-0', 'b', 'Burak')]);
    expect(board.getSnapshot().map((l) => [l.key, l.name, l.emphasized])).toEqual([
      ['gelin-0', 'Ayşe', false],
      ['damat-0', 'Burak', false],
    ]);
  });

  it('ignores slots it has no anchor for', () => {
    const { board } = setup();
    board.setOccupants([occupant('gelin-9', 'a')]);
    expect(board.getSnapshot()).toEqual([]);
  });

  it('emphasises on activity and returns to quiet after the emphasis time', () => {
    const { board, advance } = setup();
    board.setOccupants([occupant('gelin-0', 'a'), occupant('damat-0', 'b')]);
    board.emphasize('a');
    expect(board.getSnapshot().map((l) => l.emphasized)).toEqual([true, false]);

    advance(2400);
    board.tick();
    expect(board.getSnapshot()[0]!.emphasized).toBe(true);
    advance(200);
    board.tick();
    expect(board.getSnapshot()[0]!.emphasized).toBe(false);
  });

  it('extends emphasis when the player acts again', () => {
    const { board, advance } = setup();
    board.setOccupants([occupant('gelin-0', 'a')]);
    board.emphasize('a');
    advance(2000);
    board.emphasize('a');
    advance(2000);
    board.tick();
    expect(board.getSnapshot()[0]!.emphasized).toBe(true);
  });

  it('ignores emphasis for players without an avatar', () => {
    const { board, notifications } = setup();
    board.setOccupants([occupant('gelin-0', 'a')]);
    const before = notifications();
    board.emphasize('crowd-member');
    expect(notifications()).toBe(before);
    expect(board.getSnapshot()[0]!.emphasized).toBe(false);
  });

  it('follows a slot when its occupant changes and keeps the snapshot stable when nothing changed', () => {
    const { board, notifications } = setup();
    board.setOccupants([occupant('gelin-0', 'a', 'Ayşe')]);
    const first = board.getSnapshot();
    const count = notifications();

    board.setOccupants([occupant('gelin-0', 'a', 'Ayşe')]);
    expect(board.getSnapshot()).toBe(first);
    expect(notifications()).toBe(count);

    board.setOccupants([occupant('gelin-0', 'c', 'Can')]);
    expect(board.getSnapshot()[0]!.name).toBe('Can');
    expect(notifications()).toBe(count + 1);
  });

  it('shows what a player said as a bubble, then lets it expire', () => {
    const { board, advance } = setup();
    board.setOccupants([occupant('gelin-0', 'a'), occupant('damat-0', 'b')]);
    board.say('a', 'selam <b>herkes</b>');
    expect(board.getSnapshot().map((l) => l.bubble)).toEqual(['selam <b>herkes</b>', null]);
    advance(4400);
    board.tick();
    expect(board.getSnapshot()[0]!.bubble).not.toBeNull();
    advance(200);
    board.tick();
    expect(board.getSnapshot()[0]!.bubble).toBeNull();
  });

  it('keeps at most three bubbles, dropping the oldest, and ignores players without an avatar', () => {
    const { board, advance } = setup();
    const keys = ['gelin-0', 'gelin-1', 'damat-0', 'damat-1'];
    board.setOccupants(keys.map((key, i) => occupant(key, `p${i}`)));
    for (let i = 0; i < 4; i++) {
      board.say(`p${i}`, `söz ${i}`);
      advance(100);
    }
    expect(board.getSnapshot().map((l) => l.bubble)).toEqual([null, 'söz 1', 'söz 2', 'söz 3']);
    board.say('nobody', 'hello');
    expect(board.getSnapshot().filter((l) => l.bubble).length).toBe(3);
  });

  it('carries names through untouched (rendering escapes them)', () => {
    const { board } = setup();
    board.setOccupants([occupant('gelin-0', 'a', '<img src=x onerror=alert(1)>')]);
    expect(board.getSnapshot()[0]!.name).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('tags following a travelling line', () => {
  const anchors = computeTagAnchors(camera, formation, { gelin: 3, damat: 3 });

  it('moves a tag down the screen when its line walks towards the camera, and back up the other way', () => {
    const { perMetre } = anchors[slotKey('gelin', 1)]!;
    expect(tagShift(perMetre, [0, 0, 1]).y).toBeGreaterThan(0);
    expect(tagShift(perMetre, [0, 0, -1]).y).toBeLessThan(0);
    expect(tagShift(perMetre, [0, 0, 0])).toEqual({ x: 0, y: 0 });
  });

  it('matches projecting the moved avatar closely enough for the allowed travel', () => {
    const [x, , z] = formation.avatar('gelin', 1, 3).position;
    const anchor = anchors[slotKey('gelin', 1)]!;
    const inward = x < 0 ? 0.5 : -0.5;
    const exact = projectToStage(camera, [x + inward, 1.1, z + 1.2]);
    const shift = tagShift(anchor.perMetre, [0, 0, 1.2]);
    expect(anchor.small.y + shift.y).toBeCloseTo(exact.y, 2);
    expect(anchor.small.x + shift.x).toBeCloseTo(exact.x, 2);
  });
});

describe('floating tags (subjects the scene moves itself)', () => {
  it('has anchors for as many subjects as asked, all alike', () => {
    const anchors = floatingAnchors(3);
    expect(Object.keys(anchors)).toEqual([floatingKey(0), floatingKey(1), floatingKey(2)]);
  });

  it('shows a label per occupied floating slot and keeps their spots outside React state', () => {
    const board = new TagBoard(floatingAnchors(2), () => 0);
    let notifications = 0;
    board.subscribe(() => notifications++);
    board.setOccupants([{ slotKey: floatingKey(0), playerId: 'a', name: 'Ayşe', teamId: 'racers' }]);
    expect(board.getSnapshot().map((l) => l.key)).toEqual([floatingKey(0)]);
    const before = notifications;
    board.setDynamic(floatingKey(0), { small: { x: 0.2, y: 0.3 }, big: { x: 0.2, y: 0.25 }, visible: true });
    board.setDynamic(floatingKey(0), { small: { x: 0.3, y: 0.4 }, big: { x: 0.3, y: 0.35 }, visible: false });
    expect(notifications).toBe(before); // moving every frame never re-renders
    expect(board.dynamic.get(floatingKey(0))).toMatchObject({ small: { x: 0.3 }, visible: false });
  });
});
