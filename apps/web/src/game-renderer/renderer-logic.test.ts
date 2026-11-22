import { describe, expect, it } from 'vitest';
import { AvatarSlots } from './avatar-slots';
import { CueBus, cuesFromBatch } from './cue-bus';
import { EffectQueue } from './effect-queue';

const TEAMS = ['gelin', 'damat'];
const roster = (n: number, teamOf: (i: number) => string | null = (i) => TEAMS[i % 2]!) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, teamId: teamOf(i) }));

describe('AvatarSlots', () => {
  it('splits the cap across teams and never exceeds it, even with 200 players', () => {
    const slots = new AvatarSlots({ teamIds: TEAMS, capTotal: 24 });
    slots.setRoster(roster(200));
    expect(slots.slots('gelin')).toHaveLength(12);
    expect(slots.slots('damat')).toHaveLength(12);
    expect(slots.visibleCount('gelin') + slots.visibleCount('damat')).toBe(24);
  });

  it('gives an odd cap to the first team and handles a cap smaller than the roster', () => {
    const slots = new AvatarSlots({ teamIds: TEAMS, capTotal: 5 });
    slots.setRoster(roster(50));
    expect(slots.slots('gelin')).toHaveLength(3);
    expect(slots.slots('damat')).toHaveLength(2);
  });

  it('fills slots in join order at first and is deterministic', () => {
    const a = new AvatarSlots({ teamIds: TEAMS, capTotal: 4 });
    const b = new AvatarSlots({ teamIds: TEAMS, capTotal: 4 });
    a.setRoster(roster(20));
    b.setRoster(roster(20));
    expect(a.slots('gelin')).toEqual(['p0', 'p2']);
    expect(a.slots('damat')).toEqual(['p1', 'p3']);
    expect(b.slots('gelin')).toEqual(a.slots('gelin'));
  });

  it('is sticky: reapplying the roster or adding players does not move existing avatars', () => {
    const slots = new AvatarSlots({ teamIds: TEAMS, capTotal: 4 });
    slots.setRoster(roster(4));
    const before = [...slots.slots('gelin')];
    expect(slots.setRoster(roster(40))).toBe(false);
    expect(slots.slots('gelin')).toEqual(before);
  });

  it('ignores players without a team or on unknown teams', () => {
    const slots = new AvatarSlots({ teamIds: TEAMS, capTotal: 4 });
    slots.setRoster([
      { id: 'lurker', teamId: null },
      { id: 'alien', teamId: 'mars' },
      { id: 'a', teamId: 'gelin' },
    ]);
    expect(slots.slotOf('lurker')).toBeNull();
    expect(slots.slotOf('alien')).toBeNull();
    expect(slots.slotOf('a')).toEqual({ teamId: 'gelin', index: 0 });
  });

  it('frees a slot when a player leaves or changes team, and refills it', () => {
    const slots = new AvatarSlots({ teamIds: TEAMS, capTotal: 2 });
    slots.setRoster([
      { id: 'a', teamId: 'gelin' },
      { id: 'b', teamId: 'damat' },
      { id: 'c', teamId: 'gelin' },
    ]);
    expect(slots.slots('gelin')).toEqual(['a']);

    // a leaves: c takes the slot.
    expect(slots.setRoster([{ id: 'b', teamId: 'damat' }, { id: 'c', teamId: 'gelin' }])).toBe(true);
    expect(slots.slots('gelin')).toEqual(['c']);

    // c switches team: gelin slot empties, damat has no room (cap 1) so c waits.
    slots.setRoster([{ id: 'b', teamId: 'damat' }, { id: 'c', teamId: 'damat' }]);
    expect(slots.slots('gelin')).toEqual([null]);
    expect(slots.slots('damat')).toEqual(['b']);
    expect(slots.slotOf('c')).toBeNull();
  });

  describe('activity', () => {
    function full() {
      const slots = new AvatarSlots({ teamIds: ['gelin'], capTotal: 2, hysteresisMs: 5_000 });
      slots.setRoster([
        { id: 'a', teamId: 'gelin' },
        { id: 'b', teamId: 'gelin' },
        { id: 'c', teamId: 'gelin' },
      ]);
      return slots;
    }

    it('promotes an active player without an avatar over the longest-idle avatar', () => {
      const slots = full();
      slots.noteActivity('a', 1_000);
      slots.noteActivity('b', 2_000);
      expect(slots.noteActivity('c', 10_000)).toBe(true); // a idle 9 s >= 5 s
      expect(slots.slots('gelin')).toEqual(['c', 'b']);
      expect(slots.slotOf('a')).toBeNull();
    });

    it('does not churn: a recently active avatar is not displaced', () => {
      const slots = full();
      slots.noteActivity('a', 9_000);
      slots.noteActivity('b', 9_500);
      expect(slots.noteActivity('c', 10_000)).toBe(false);
      expect(slots.slots('gelin')).toEqual(['a', 'b']);
    });

    it('takes a free slot immediately and never touches players outside the roster', () => {
      const slots = new AvatarSlots({ teamIds: ['gelin'], capTotal: 3 });
      slots.setRoster([{ id: 'a', teamId: 'gelin' }]);
      expect(slots.noteActivity('ghost', 1)).toBe(false);
      expect(slots.noteActivity('a', 1)).toBe(false); // already has one
    });

    it('prefers active players when refilling after someone leaves', () => {
      const slots = new AvatarSlots({ teamIds: ['gelin'], capTotal: 1 });
      slots.setRoster([{ id: 'a', teamId: 'gelin' }, { id: 'b', teamId: 'gelin' }, { id: 'c', teamId: 'gelin' }]);
      slots.noteActivity('c', 50_000);
      slots.setRoster([{ id: 'b', teamId: 'gelin' }, { id: 'c', teamId: 'gelin' }]); // a leaves
      expect(slots.slots('gelin')).toEqual(['c']);
    });

    it('stays bounded under a long stream of churn', () => {
      const slots = new AvatarSlots({ teamIds: TEAMS, capTotal: 24, hysteresisMs: 1_000 });
      slots.setRoster(roster(200));
      for (let t = 0; t < 5_000; t++) slots.noteActivity(`p${(t * 7) % 200}`, t * 100);
      expect(slots.visibleCount('gelin')).toBeLessThanOrEqual(12);
      expect(slots.visibleCount('damat')).toBeLessThanOrEqual(12);
      const occupied = [...slots.slots('gelin'), ...slots.slots('damat')].filter(Boolean);
      expect(new Set(occupied).size).toBe(occupied.length); // nobody holds two slots
    });
  });
});

describe('EffectQueue', () => {
  const limits = { big: { durationMs: 1_000, maxConcurrent: 1, maxQueued: 2 }, small: { durationMs: 100, maxConcurrent: 3, maxQueued: 0 } };

  it('starts up to the concurrency limit, queues a few, and drops the rest', () => {
    const queue = new EffectQueue<string>(limits);
    expect(queue.request('big', 'a', 0)).toBe('start');
    expect(queue.request('big', 'b', 10)).toBe('queued');
    expect(queue.request('big', 'c', 20)).toBe('queued');
    expect(queue.request('big', 'd', 30)).toBe('dropped');
    expect(queue.request('mystery', 'x', 0)).toBe('dropped');
  });

  it('starts queued effects in order as slots free up', () => {
    const queue = new EffectQueue<string>(limits);
    queue.request('big', 'a', 0);
    queue.request('big', 'b', 10);
    queue.request('big', 'c', 20);
    expect(queue.update(500)).toEqual([]);
    expect(queue.update(1_000)).toEqual([{ effect: 'big', payload: 'b' }]);
    expect(queue.update(1_500)).toEqual([]);
    expect(queue.update(2_000)).toEqual([{ effect: 'big', payload: 'c' }]);
    expect(queue.update(5_000)).toEqual([]);
    expect(queue.request('big', 'e', 5_000)).toBe('start');
  });

  it('tracks effects independently', () => {
    const queue = new EffectQueue(limits);
    expect(queue.request('big', undefined, 0)).toBe('start');
    for (let i = 0; i < 3; i++) expect(queue.request('small', undefined, 0)).toBe('start');
    expect(queue.request('small', undefined, 50)).toBe('dropped');
    expect(queue.request('small', undefined, 100)).toBe('start');
  });
});

describe('CueBus', () => {
  it('delivers to subscribers until they unsubscribe', () => {
    const bus = new CueBus();
    const seen: string[] = [];
    const off = bus.subscribe((cue) => seen.push(cue.type));
    bus.emit({ type: 'celebration', effect: 'gg' });
    off();
    bus.emit({ type: 'celebration', effect: 'gg' });
    expect(seen).toEqual(['celebration']);
  });

  it('turns a presentation batch into scene cues, dropping hints and keeping crowd folds', () => {
    const cues = cuesFromBatch({
      events: [
        { type: 'player_joined', playerId: 'a', teamId: 'gelin' },
        { type: 'hint', playerId: 'a', reason: 'no_team' },
        { type: 'player_action', playerId: 'a', animation: 'halay' },
        { type: 'celebration', effect: 'rose', playerId: 'a' },
      ],
      crowd: [{ teamId: 'damat', actions: 12 }],
    });
    expect(cues.map((c) => c.type)).toEqual(['player_joined', 'player_action', 'celebration', 'crowd']);
    expect(cues.at(-1)).toEqual({ type: 'crowd', teamId: 'damat', actions: 12 });
  });
});
