import { describe, expect, it } from 'vitest';
import { formatGap, formatTime, gapLabel, gapSeconds, type GapRacer } from './gaps';

const racer = (distance: number, speed = 16, place: number | null = null, finishTime: number | null = null): GapRacer => ({ distance, speed, place, finishTime });
const LINE = 2400;

describe('formatGap', () => {
  it('reads like a timing screen', () => {
    expect(formatGap(0)).toBe('');
    expect(formatGap(0.04)).toBe('');
    expect(formatGap(0.8)).toBe('+0.8s');
    expect(formatGap(9.94)).toBe('+9.9s');
    expect(formatGap(12.4)).toBe('+12s');
    expect(formatGap(65)).toBe('+1:05');
    expect(formatGap(Number.NaN)).toBe('');
    expect(formatGap(-3)).toBe('');
  });

  it('writes a finishing time as minutes, seconds and a tenth', () => {
    expect(formatTime(151.43)).toBe('2:31.4');
    expect(formatTime(59.96)).toBe('1:00.0'); // rounds up across the minute
    expect(formatTime(5)).toBe('0:05.0');
    expect(formatTime(-1)).toBe('0:00.0');
  });
});

describe('gapSeconds', () => {
  it('is the distance behind divided by the racer\'s own speed while racing', () => {
    expect(gapSeconds(racer(1000), racer(984, 16), LINE)).toBeCloseTo(1, 6);
    expect(gapSeconds(racer(1000), racer(900, 20), LINE)).toBeCloseTo(5, 6);
    expect(gapSeconds(racer(1000), racer(1000), LINE)).toBe(0);
    expect(gapSeconds(racer(1000), racer(1010), LINE)).toBe(0); // never negative
  });

  it('copes with a standing horse (it never divides by zero)', () => {
    expect(Number.isFinite(gapSeconds(racer(1000), racer(900, 0), LINE))).toBe(true);
  });

  it('is the difference of the finishing times between two finishers', () => {
    expect(gapSeconds(racer(LINE, 0, 1, 150.2), racer(LINE, 0, 2, 150.9), LINE)).toBeCloseTo(0.7, 6);
  });

  it('measures a horse still running to the line once the winner is home', () => {
    expect(gapSeconds(racer(LINE, 0, 1, 150), racer(LINE - 32, 16), LINE)).toBeCloseTo(2, 6);
  });
});

describe('gapLabel', () => {
  it('shows nothing for a leader still racing, the time for a finished winner and the gap for the rest', () => {
    const leader = racer(1000);
    expect(gapLabel(leader, leader, LINE)).toBe('');
    expect(gapLabel(leader, racer(984), LINE)).toBe('+1.0s');
    const winner = racer(LINE, 0, 1, 151.43);
    expect(gapLabel(winner, winner, LINE)).toBe('2:31.4');
    expect(gapLabel(winner, racer(LINE, 0, 2, 152.1), LINE)).toBe('+0.7s');
  });
});
