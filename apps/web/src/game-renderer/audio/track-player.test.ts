import { describe, expect, it, vi } from 'vitest';
import { BeatClock } from '../beat-clock';
import type { SoundEngine } from './engine';
import { effectsEnabled, type MediaLike, TrackPlayer, trackBeats, trackLevel, validateTrack } from './track-player';
import type { MusicTrack } from './types';

const track: MusicTrack = { url: '/music/song.mp3', bpm: 120, firstBeatSeconds: 0.5, gain: 0.8 };

describe('trackBeats', () => {
  it('counts beats from the first beat of the file, at its tempo, across loops', () => {
    const t = { ...track, bpm: 120 };
    expect(trackBeats(0.5, t)).toBe(0);
    expect(trackBeats(1.5, t)).toBe(2); // 120 BPM: two beats a second
    expect(trackBeats(0, t)).toBe(-1); // before the first beat
    expect(trackBeats(100.5, t)).toBe(200); // keeps counting; never wraps
    expect(trackBeats(3, { ...t, firstBeatSeconds: undefined })).toBe(6);
  });
});

describe('trackLevel', () => {
  it('follows the music mode and the track gain', () => {
    expect(trackLevel('off', track)).toBe(0);
    expect(trackLevel('calm', track)).toBeLessThan(trackLevel('build', track));
    expect(trackLevel('build', track)).toBeLessThan(trackLevel('full', track));
    expect(trackLevel('full', track)).toBeCloseTo(0.8);
    expect(trackLevel('full', { ...track, gain: undefined })).toBeCloseTo(0.9);
  });
});

describe('validateTrack', () => {
  it('accepts a sensible track (with or without a tempo) and names what is wrong with a bad one', () => {
    expect(validateTrack(track)).toEqual([]);
    expect(validateTrack({ url: '/a.mp3' })).toEqual([]);
    expect(validateTrack({ ...track, url: ' ' })).toContain('track needs a url');
    expect(validateTrack({ ...track, bpm: 10 })).toContain('track bpm must be between 40 and 240');
    expect(validateTrack({ ...track, bpm: Number.NaN })).toContain('track bpm must be between 40 and 240');
    expect(validateTrack({ ...track, firstBeatSeconds: -1 })).toContain('firstBeatSeconds must be 0 or more');
    expect(validateTrack({ ...track, gain: 2 })).toContain('gain must be between 0 and 1');
  });
});

describe('BeatClock.lockTo', () => {
  it('takes the file beat and tempo, and carries on from there when released', () => {
    const clock = new BeatClock();
    clock.tick(0, 0);
    clock.tick(100, 0);
    clock.lockTo(40, 120);
    expect(clock.beats).toBe(40);
    expect(clock.bpm).toBe(120);
    clock.tick(1100, 0); // released: integrates from the locked value, easing the tempo towards the energy target
    expect(clock.beats).toBeGreaterThan(40);
    expect(clock.beats).toBeLessThan(43);
  });
});

/** A tiny stand-in for the browser's audio graph and media element: records what the player asks of them. */
function fakes() {
  const log: string[] = [];
  const targets: number[] = [];
  const listeners: Record<string, () => void> = {};
  const media: MediaLike & { plays: number; paused: number } = {
    loop: false,
    currentTime: 5,
    plays: 0,
    paused: 0,
    play: async () => {
      media.plays++;
      log.push('play');
    },
    pause: () => {
      media.paused++;
      log.push('pause');
    },
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
  };
  const ctx = {
    currentTime: 0,
    createMediaElementSource: () => ({ connect: (node: unknown) => node }),
    createGain: () => ({
      gain: { value: 0, setTargetAtTime: (target: number) => targets.push(target), cancelScheduledValues: () => undefined },
      connect: (node: unknown) => node,
    }),
  };
  const stats = { track: 'none' };
  const engine = { ctx, musicInput: {}, stats } as unknown as SoundEngine;
  return { engine, ctx, media, log, targets, listeners, stats };
}

describe('TrackPlayer', () => {
  it('stays silent until the file can play, and a file that cannot load leaves it failed (the game falls back to its own music)', async () => {
    const f = fakes();
    const player = new TrackPlayer(f.engine, track, () => f.media);
    const loading = player.load();
    expect(player.state).toBe('loading');
    expect(player.update('full')).toBeNull();
    f.listeners.canplay!();
    await loading;
    expect(player.state).toBe('ready');
    expect(f.media.loop).toBe(true);
    expect(f.stats.track).toBe('ready');

    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = fakes();
    const failing = new TrackPlayer(broken.engine, track, () => broken.media);
    const failedLoad = failing.load();
    broken.listeners.error!();
    await failedLoad;
    expect(failing.state).toBe('failed');
    expect(broken.stats.track).toBe('failed');
    expect(failing.update('full')).toBeNull();
  });

  it('starts when the music should play, locks the beat to a file with a tempo, fades with the mode, and pauses when off', async () => {
    vi.useFakeTimers();
    const f = fakes();
    const player = new TrackPlayer(f.engine, track, () => f.media);
    const loading = player.load();
    f.listeners.canplay!();
    await loading;

    f.ctx.currentTime = 10;
    expect(player.update('off')).toBeNull();
    expect(player.playing).toBe(false);

    expect(player.update('full')).toEqual({ beats: -1, bpm: 120 }); // 0 s in, half a second before the first beat
    expect(f.log).toEqual(['play']);
    expect(f.stats.track).toBe('playing');
    expect(f.media.currentTime).toBe(0); // always from the top
    expect(f.targets.at(-1)).toBeCloseTo(0.8);

    f.ctx.currentTime = 12.5;
    expect(player.update('calm')).toEqual({ beats: 4, bpm: 120 });
    expect(f.log).toEqual(['play']); // the same playback, not restarted
    expect(f.targets.at(-1)).toBeLessThan(0.8);

    expect(player.update('off')).toBeNull();
    expect(f.targets.at(-1)).toBe(0); // faded out...
    expect(f.stats.track).toBe('ready');
    vi.advanceTimersByTime(1000);
    expect(f.log).toEqual(['play', 'pause']); // ...then paused

    f.ctx.currentTime = 20;
    expect(player.update('full')).toEqual({ beats: -1, bpm: 120 }); // a new start begins from the top
    expect(f.log).toEqual(['play', 'pause', 'play']);
    vi.useRealTimers();
  });

  it('plays without locking the dancers when the file states no tempo', async () => {
    const f = fakes();
    const player = new TrackPlayer(f.engine, { url: '/mix.mp3' }, () => f.media);
    const loading = player.load();
    f.listeners.canplay!();
    await loading;
    expect(player.update('full')).toBeNull(); // nothing to lock to
    expect(player.playing).toBe(true); // but the music plays
    expect(f.log).toEqual(['play']);
  });

  it('plays once when the track says not to loop', async () => {
    const f = fakes();
    const player = new TrackPlayer(f.engine, { ...track, loop: false }, () => f.media);
    const loading = player.load();
    f.listeners.canplay!();
    await loading;
    expect(f.media.loop).toBe(false);
  });
});

describe('effectsEnabled', () => {
  const withTrack = { track: { url: '/a.mp3' } };

  it('keeps the built-in effects off while the game music file is in use, so they cannot break it', () => {
    expect(effectsEnabled(withTrack, 'ready')).toBe(false);
  });

  it('plays them when there is no file, and while the file is still loading or failed (the built-in music plays then)', () => {
    expect(effectsEnabled({}, null)).toBe(true);
    expect(effectsEnabled({ track: undefined }, 'ready')).toBe(true);
    expect(effectsEnabled(withTrack, 'loading')).toBe(true);
    expect(effectsEnabled(withTrack, 'failed')).toBe(true);
    expect(effectsEnabled(withTrack, null)).toBe(true);
  });

  it('lets a game opt back in to effects over its file', () => {
    expect(effectsEnabled({ ...withTrack, effectsOverTrack: true }, 'ready')).toBe(true);
  });
});
