import { describe, expect, it } from 'vitest';
import { DOORS_OPEN_SECONDS, dividerLaterals, GATE_GONE_SECONDS, gateTimeline } from './gate';
import { laneOffset } from './scene-config';

describe('the starting gate', () => {
  it('stands with its doors shut until the start, opens them quickly, then goes away', () => {
    expect(gateTimeline(null)).toEqual({ open: 0, up: true });
    expect(gateTimeline(0)).toEqual({ open: 0, up: true });
    expect(gateTimeline(DOORS_OPEN_SECONDS / 2).open).toBeCloseTo(0.5, 5);
    expect(gateTimeline(DOORS_OPEN_SECONDS)).toEqual({ open: 1, up: true });
    expect(gateTimeline(GATE_GONE_SECONDS - 0.01).up).toBe(true);
    expect(gateTimeline(GATE_GONE_SECONDS)).toEqual({ open: 1, up: false });
    expect(gateTimeline(-1).open).toBe(0);
  });

  it('puts a divider between every pair of horses and one at each end, with each horse half a lane from both of its dividers', () => {
    for (const stalls of [1, 2, 7, 10, 12]) {
      const dividers = dividerLaterals(stalls);
      expect(dividers).toHaveLength(stalls + 1);
      for (let horse = 0; horse < stalls; horse++) {
        const lane = laneOffset(horse, stalls);
        expect(lane - dividers[horse]!).toBeCloseTo(dividers[horse + 1]! - lane, 6); // in the middle of its stall
        expect(dividers[horse]!).toBeLessThan(lane);
        expect(dividers[horse + 1]!).toBeGreaterThan(lane);
      }
    }
  });
});
