import { describe, expect, it } from 'vitest';
import { decideWinner, ScoringService } from './scoring-service';

describe('ScoringService', () => {
  it('accumulates per team and resets', () => {
    const scoring = new ScoringService(['gelin', 'damat']);
    scoring.add('gelin', 1);
    scoring.add('gelin', 2);
    scoring.add('damat', 1);
    expect(scoring.get('gelin')).toBe(3);
    expect(scoring.get('damat')).toBe(1);
    scoring.reset();
    expect(scoring.get('gelin')).toBe(0);
  });

  it('rejects invalid points and unknown teams', () => {
    const scoring = new ScoringService(['gelin']);
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => scoring.add('gelin', bad)).toThrow(RangeError);
    }
    expect(() => scoring.get('nope')).toThrow();
    expect(() => scoring.add('nope', 1)).toThrow();
  });
});

describe('decideWinner', () => {
  it('picks the highest score', () => {
    expect(decideWinner([{ id: 'a', score: 3 }, { id: 'b', score: 5 }])).toBe('b');
    expect(decideWinner([{ id: 'a', score: 9 }, { id: 'b', score: 5 }])).toBe('a');
  });

  it('returns null (draw) on a tie for first, including 0–0', () => {
    expect(decideWinner([{ id: 'a', score: 4 }, { id: 'b', score: 4 }])).toBeNull();
    expect(decideWinner([{ id: 'a', score: 0 }, { id: 'b', score: 0 }])).toBeNull();
    expect(decideWinner([{ id: 'a', score: 5 }, { id: 'b', score: 5 }, { id: 'c', score: 1 }])).toBeNull();
  });

  it('is not tied when only lower places are tied', () => {
    expect(decideWinner([{ id: 'a', score: 9 }, { id: 'b', score: 2 }, { id: 'c', score: 2 }])).toBe('a');
  });

  it('handles an empty list', () => {
    expect(decideWinner([])).toBeNull();
  });
});
