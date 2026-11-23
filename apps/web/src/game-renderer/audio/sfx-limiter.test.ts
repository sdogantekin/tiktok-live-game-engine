import { describe, expect, it } from 'vitest';
import { MAX_SFX_VOICES, SFX_PROFILE, SfxLimiter } from './sfx-limiter';
import type { SfxName } from './types';

describe('SfxLimiter', () => {
  it('drops an effect that repeats faster than its minimum gap', () => {
    const limiter = new SfxLimiter();
    expect(limiter.tryPlay('clap', 1)).toBe(true);
    expect(limiter.tryPlay('clap', 1.05)).toBe(false);
    expect(limiter.tryPlay('clap', 1 + SFX_PROFILE.clap.gap + 0.001)).toBe(true);
  });

  it('keeps different effects independent', () => {
    const limiter = new SfxLimiter();
    expect(limiter.tryPlay('clap', 1)).toBe(true);
    expect(limiter.tryPlay('whoosh', 1)).toBe(true);
  });

  it('caps how many effects sound at once, and frees voices as they end', () => {
    const limiter = new SfxLimiter(3);
    const names: SfxName[] = ['clap', 'whoosh', 'chime', 'pop'];
    expect(names.map((name) => limiter.tryPlay(name, 5))).toEqual([true, true, true, false]);
    expect(limiter.active(5)).toBe(3);
    expect(limiter.tryPlay('pop', 5 + SFX_PROFILE.chime.duration + 0.1)).toBe(true);
  });

  it('survives a hostile crowd: 200 viewers clapping in one second plays only a handful of claps', () => {
    const limiter = new SfxLimiter();
    let played = 0;
    for (let i = 0; i < 200; i++) if (limiter.tryPlay('clap', 10 + (i / 200) * 1)) played++;
    expect(played).toBeLessThanOrEqual(Math.ceil(1 / SFX_PROFILE.clap.gap) + 1);
    expect(played).toBeGreaterThan(0);
  });

  it('never exceeds the default voice limit across all effect types', () => {
    const limiter = new SfxLimiter();
    const names = Object.keys(SFX_PROFILE) as SfxName[];
    for (let i = 0; i < 400; i++) limiter.tryPlay(names[i % names.length]!, 3 + i * 0.001);
    expect(limiter.active(3.4)).toBeLessThanOrEqual(MAX_SFX_VOICES);
  });
});
