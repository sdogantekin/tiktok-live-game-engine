import { SoundEngine } from './engine';
import { MusicScheduler } from './music-scheduler';
import type { MusicMode, SfxRequest, SoundDesign } from './types';

export interface OfflineOptions {
  seconds: number;
  bpm: number;
  /** Group energy held for the whole render, 0..1. */
  energy: number;
  mode?: MusicMode;
  volume?: number;
  /** Also return the mono signal at 22.05 kHz (for offline analysis such as spectral balance). */
  returnSamples?: boolean;
  /** Effects to play, with the time (seconds) each one starts. */
  effects?: readonly { at: number; request: SfxRequest }[];
}

export interface OfflineStats {
  /** Largest absolute sample, 0..1 (1 would clip). */
  peak: number;
  /** Root mean square level, 0..1. */
  rms: number;
  /** Fraction of 50 ms windows that are not silent. */
  audibleFraction: number;
  hasInvalidSamples: boolean;
  /** Mono samples at half the sample rate, only when asked for. */
  samples?: number[];
}

/**
 * Renders a game's sound offline (faster than real time) and measures it: the same engine, scheduler and voices as live
 * playback, just on an offline audio context. Used by the loudness / clipping check, since a machine cannot judge
 * whether it sounds good but can prove it is audible, not clipping, and not wildly louder at high energy.
 */
export async function renderOffline(design: SoundDesign, options: OfflineOptions): Promise<OfflineStats> {
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * options.seconds), sampleRate);
  const engine = new SoundEngine(ctx);
  if (design.score) engine.tuneTo(design.score);
  engine.setSettings({ muted: false, volume: options.volume ?? 1 });

  const scheduler = design.score ? new MusicScheduler(design.score, engine) : null;
  const step = 0.05;
  for (let t = 0; scheduler && t < options.seconds; t += step) {
    scheduler.update({ audioNow: t, beats: (t * options.bpm) / 60, bpm: options.bpm, energy: options.energy, mode: options.mode ?? 'full' });
  }
  for (const { at, request } of options.effects ?? []) engine.playEffect(request, at);

  const buffer = await ctx.startRendering();
  let peak = 0;
  let sumSquares = 0;
  let count = 0;
  let invalid = false;
  let audibleWindows = 0;
  const window = Math.floor(sampleRate * 0.05);
  const left = buffer.getChannelData(0);
  for (let start = 0; start < left.length; start += window) {
    let windowPeak = 0;
    for (let i = start; i < Math.min(left.length, start + window); i++) {
      const sample = left[i]!;
      if (!Number.isFinite(sample)) invalid = true;
      const abs = Math.abs(sample);
      peak = Math.max(peak, abs);
      windowPeak = Math.max(windowPeak, abs);
      sumSquares += sample * sample;
      count++;
    }
    if (windowPeak > 0.002) audibleWindows++;
  }
  const windows = Math.ceil(left.length / window);
  const stats: OfflineStats = { peak, rms: Math.sqrt(sumSquares / Math.max(1, count)), audibleFraction: audibleWindows / windows, hasInvalidSamples: invalid };
  if (options.returnSamples) stats.samples = Array.from({ length: Math.floor(left.length / 2) }, (_, i) => (left[2 * i]! + left[2 * i + 1]!) / 2);
  return stats;
}
