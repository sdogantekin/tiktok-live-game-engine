import { describe, expect, it } from 'vitest';
import { AvatarSlots, fillOrder } from './avatar-slots';

const TERM = 10_000;
const MARGIN = 4_000;

/** Team `a` gets 4 slots (capTotal 8 over two teams): slot 0 and slot 3 are its two line ends. */
function slotsWith(players: readonly string[]) {
  const slots = new AvatarSlots({ teamIds: ['a', 'b'], capTotal: 8, leaderTermMs: TERM, leaderMarginMs: MARGIN });
  slots.setRoster(players.map((id) => ({ id, teamId: 'a' })));
  return slots;
}

describe('fillOrder', () => {
  it('fills both ends first, then inwards', () => {
    expect(fillOrder(5)).toEqual([0, 4, 1, 3, 2]);
    expect(fillOrder(4)).toEqual([0, 3, 1, 2]);
    expect(fillOrder(2)).toEqual([0, 1]);
    expect(fillOrder(1)).toEqual([0]);
    expect(fillOrder(0)).toEqual([]);
  });
});

describe('line leaders (the two halaybaşı of a line)', () => {
  it('a line has a leader at each end, the second player already at the far end', () => {
    const slots = slotsWith(['p1', 'p2']);
    expect(slots.leaderSlots('a')).toEqual([0, 3]);
    expect(slots.leadersOf('a')).toEqual(['p1', 'p2']);
    expect(slots.slots('a')).toEqual(['p1', null, null, 'p2']);
    expect(slots.leadersOf('b')).toEqual([null, null]);
  });

  it('a player alone leads the first end only', () => {
    expect(slotsWith(['p1']).leadersOf('a')).toEqual(['p1', null]);
  });

  it('the two ends go to the two most recently active players once the leaders have served their term', () => {
    const slots = slotsWith(['p1', 'p2', 'p3', 'p4']); // p1 head, p2 tail, p3 and p4 in between
    slots.noteActivity('p1', 1_000);
    slots.noteActivity('p4', 20_000);
    expect([...slots.leadersOf('a')].sort()).toEqual(['p1', 'p4']);
    // The players who lost an end keep an avatar, in the slot a new leader left.
    for (const id of ['p2', 'p3']) {
      const slot = slots.slotOf(id)!;
      expect(slots.slots('a')[slot.index]).toBe(id);
      expect(slots.isLeaderSlot('a', slot.index)).toBe(false);
    }
  });

  it('never makes one player the leader of both ends', () => {
    const slots = slotsWith(['p1', 'p2', 'p3', 'p4']);
    for (let t = 1; t <= 30; t++) slots.noteActivity(`p${(t % 4) + 1}`, t * 11_000);
    const [head, tail] = slots.leadersOf('a');
    expect(head).not.toBeNull();
    expect(tail).not.toBeNull();
    expect(head).not.toBe(tail);
  });

  it('does not flicker: a new leader keeps the role for the whole term', () => {
    const slots = slotsWith(['p1', 'p2', 'p3', 'p4']);
    slots.noteActivity('p3', 20_000);
    expect(slots.leadersOf('a')[0]).toBe('p3'); // p3 took the first end
    slots.noteActivity('p4', 20_000 + TERM - 1); // active enough to challenge, but p3 has not served their term
    expect(slots.leadersOf('a')[0]).toBe('p3');
  });

  it('is not replaced by someone who is only slightly more active', () => {
    const slots = slotsWith(['p1', 'p2', 'p3']); // p1 head, p2 tail, p3 in between
    slots.noteActivity('p1', 30_000);
    slots.noteActivity('p2', 30_000);
    slots.noteActivity('p3', 30_000 + MARGIN - 1);
    expect(slots.leadersOf('a')).toEqual(['p1', 'p2']);
  });

  it('is chosen per team, and a leaving leader is replaced at once by the most active player left', () => {
    const slots = new AvatarSlots({ teamIds: ['a', 'b'], capTotal: 8, leaderTermMs: TERM, leaderMarginMs: MARGIN });
    slots.setRoster([
      { id: 'a1', teamId: 'a' },
      { id: 'a2', teamId: 'a' },
      { id: 'a3', teamId: 'a' },
      { id: 'b1', teamId: 'b' },
    ]);
    expect(slots.leadersOf('a')).toEqual(['a1', 'a2']);
    expect(slots.leadersOf('b')).toEqual(['b1', null]);
    slots.setRoster([
      { id: 'a2', teamId: 'a' },
      { id: 'a3', teamId: 'a' },
      { id: 'b1', teamId: 'b' },
    ]);
    expect(slots.leadersOf('a')[0]).toBe('a3'); // a2 stays at the other end; a3 steps up at the first end
    expect(slots.leadersOf('a')[1]).toBe('a2');
  });

  it('never gives one player two slots when leaders swap', () => {
    const slots = slotsWith(['p1', 'p2', 'p3', 'p4']);
    for (let t = 1; t <= 40; t++) slots.noteActivity(`p${(t % 4) + 1}`, t * 15_000);
    const occupied = slots.slots('a').filter((id): id is string => id !== null);
    expect(new Set(occupied).size).toBe(occupied.length);
    expect([...occupied].sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    for (const id of occupied) expect(slots.slots('a')[slots.slotOf(id)!.index]).toBe(id);
  });
});
