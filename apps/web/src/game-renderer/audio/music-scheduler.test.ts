import { describe, expect, it } from 'vitest';
import { LOOKAHEAD_SECONDS, MusicScheduler, type MusicFrame, type NoteSink } from './music-scheduler';
import { testScore as score } from './test-score';
import type { NoteEvent } from './types';

function setup() {
  const played: { note: NoteEvent; when: number; secondsPerStep: number }[] = [];
  const sink: NoteSink = { playNote: (note, when, secondsPerStep) => played.push({ note, when, secondsPerStep }) };
  const scheduler = new MusicScheduler(score, sink);
  /** Runs frames at 60 fps from `from` to `to` seconds of a steady 120 BPM beat (audio clock = wall clock). */
  const run = (from: number, to: number, overrides: Partial<MusicFrame> = {}, bpm = 120) => {
    for (let t = from; t < to; t += 1 / 60) scheduler.update({ audioNow: t, beats: (t * bpm) / 60, bpm, energy: 0, mode: 'full', ...overrides });
  };
  return { played, scheduler, run };
}

describe('MusicScheduler', () => {
  it('schedules each step exactly once, at the audio time the beat clock says', () => {
    const { played, run } = setup();
    run(0, 4);
    const drones = played.filter((p) => p.note.voice === 'drone');
    // 120 BPM, 2 steps per beat, 8 steps per bar: a bar every 2 s, so drones at (about) 0, 2, 4 s.
    const whens = drones.map((d) => d.when);
    expect(whens.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < whens.length; i++) expect(whens[i]! - whens[i - 1]!).toBeCloseTo(2, 3);
    // Every step is planned once: no duplicates of the same (step, voice) time.
    const keys = played.map((p) => `${p.note.voice}@${p.when.toFixed(4)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('stays within the look-ahead window', () => {
    const { played, run } = setup();
    run(0, 2);
    expect(Math.max(...played.map((p) => p.when))).toBeLessThanOrEqual(2 + LOOKAHEAD_SECONDS + 0.26);
  });

  it('keeps time on the beat clock: notes land on step boundaries (0.25 s at 120 BPM)', () => {
    const { played, run } = setup();
    run(0, 3);
    for (const { when } of played) expect((when / 0.25) % 1).toSatisfy((x: number) => Math.abs(x) < 1e-6 || Math.abs(x - 1) < 1e-6);
  });

  it('follows a tempo change: faster tempo, shorter steps', () => {
    const { played, run } = setup();
    run(0, 1, {}, 120);
    const before = played.length;
    run(1, 2, {}, 132);
    expect(played.length).toBeGreaterThan(before);
    expect(played.at(-1)!.secondsPerStep).toBeCloseTo(60 / 132 / 2, 6);
  });

  it('plays nothing while off, and starts from the beat clock again afterwards', () => {
    const { played, run } = setup();
    run(0, 1, { mode: 'off' });
    expect(played).toEqual([]);
    run(1, 1.5, { mode: 'full' });
    expect(played.length).toBeGreaterThan(0);
    expect(Math.min(...played.map((p) => p.when))).toBeGreaterThanOrEqual(1);
  });

  it('skips ahead after a long stall instead of playing a burst of old notes', () => {
    const { played, scheduler } = setup();
    scheduler.update({ audioNow: 0, beats: 0, bpm: 120, energy: 0, mode: 'full' });
    const before = played.length;
    scheduler.update({ audioNow: 30, beats: 60, bpm: 120, energy: 0, mode: 'full' }); // 30 s later
    expect(played.length - before).toBeLessThan(12); // roughly one look-ahead window, not 120 steps
    expect(Math.min(...played.slice(before).map((p) => p.when))).toBeGreaterThanOrEqual(30);
  });

  it('adds layers as energy rises and keeps them while it hovers', () => {
    const { played, scheduler, run } = setup();
    run(0, 3, { energy: 0.05 });
    expect(played.some((p) => p.note.voice === 'reed')).toBe(false);
    run(3, 6, { energy: 0.5 });
    expect(played.some((p) => p.note.voice === 'reed')).toBe(true);
    expect(scheduler.layer).toBe(2);
    run(6, 8, { energy: 0.25 }); // below layerUp[1] but above layerDown[1]
    expect(scheduler.layer).toBe(2);
  });

  it('resets on demand', () => {
    const { played, scheduler, run } = setup();
    run(0, 1);
    scheduler.reset();
    const before = played.length;
    scheduler.update({ audioNow: 5, beats: 10, bpm: 120, energy: 0, mode: 'full' });
    expect(played.slice(before).every((p) => p.when >= 5)).toBe(true);
  });
});
