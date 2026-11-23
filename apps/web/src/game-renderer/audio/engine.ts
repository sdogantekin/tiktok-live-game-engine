import type { SoundSettings } from '@live-game/contracts';
import type { NoteSink } from './music-scheduler';
import { SfxLimiter, SFX_PROFILE } from './sfx-limiter';
import { bass, bassDrum, clap, drone, makeNoise, playSfx, reed, rimDrum, shaker, type VoiceContext } from './synth';
import type { NoteEvent, Score, SfxRequest } from './types';

/** Master volume 0..1 → gain. Squared so the slider feels even to the ear; kept below 1 to leave headroom. */
export function volumeToGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return v * v * 0.9;
}

/** A gentle saturation curve: whatever the compressor lets through is rounded off instead of clipping. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(2048 * 4));
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(1.2 * x) / Math.tanh(1.2);
  }
  return curve;
}

/**
 * The scene's sound: a master chain (compressor, soft clip, volume) with a music bus (which can be ducked) and an
 * effects bus. Works on a real or an offline audio context, and takes explicit times, so the same code that plays
 * live is rendered offline in tests. Game-neutral: the music itself comes from a `Score`.
 */
export class SoundEngine implements NoteSink {
  readonly ctx: BaseAudioContext;
  private readonly master: GainNode;
  private readonly duckGain: GainNode;
  private readonly musicBus: GainNode;
  private readonly sfxBus: GainNode;
  private readonly voices: VoiceContext;
  private readonly limiter = new SfxLimiter();
  private readonly listeners = new Set<() => void>();
  /** Counters for the browser tests and the perf overlay: what the engine has been asked to play. */
  readonly stats: { notes: number; effects: number; effectsDropped: number; track: 'none' | 'loading' | 'ready' | 'failed' | 'playing' } = {
    notes: 0,
    effects: 0,
    effectsDropped: 0,
    track: 'none',
  };
  private settings: SoundSettings = { muted: false, volume: 0.7 };
  private tuning: { root: number; scale: readonly number[] } = { root: 146.83, scale: [0, 2, 4, 5, 7, 9, 11, 12] };

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.voices = { ctx, noise: makeNoise(ctx) };

    this.master = ctx.createGain();
    const clipper = ctx.createWaveShaper();
    clipper.curve = softClipCurve();
    clipper.oversample = '2x';
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 8;
    compressor.ratio.value = 10;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    this.duckGain = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.musicBus.connect(this.duckGain).connect(compressor);
    this.sfxBus.connect(compressor);
    compressor.connect(clipper).connect(this.master).connect(ctx.destination);

    this.applySettings(0);
    ctx.addEventListener?.('statechange', () => this.listeners.forEach((listener) => listener()));
  }

  /** Where a music source connects (so it is ducked under big moments like the synthesised music). */
  get musicInput(): AudioNode {
    return this.musicBus;
  }

  /** Tunes the melodic effects to a score. */
  tuneTo(score: Score): void {
    this.tuning = { root: score.rootHz, scale: score.scale };
  }

  get running(): boolean {
    return this.ctx.state === 'running';
  }

  /** Browsers start audio suspended until the page has had a user gesture; call this from one. */
  async unlock(): Promise<void> {
    const ctx = this.ctx as AudioContext;
    if (ctx.state === 'suspended') await ctx.resume?.();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setSettings(settings: SoundSettings): void {
    this.settings = settings;
    this.applySettings(this.ctx.currentTime);
  }

  get isMuted(): boolean {
    return this.settings.muted;
  }

  private applySettings(at: number): void {
    const target = this.settings.muted ? 0 : volumeToGain(this.settings.volume);
    this.master.gain.cancelScheduledValues(at);
    this.master.gain.setTargetAtTime(target, at, 0.04);
  }

  /** One note of the music (called by the scheduler). */
  playNote(note: NoteEvent, when: number, secondsPerStep: number): void {
    const out = this.musicBus;
    this.stats.notes++;
    switch (note.voice) {
      case 'bassDrum':
        bassDrum(this.voices, out, when, note.velocity);
        break;
      case 'rimDrum':
        rimDrum(this.voices, out, when, note.velocity);
        break;
      case 'reed':
        reed(this.voices, out, when, note.freq, note.steps * secondsPerStep * 0.92, note.velocity);
        break;
      case 'drone':
        drone(this.voices, out, when, note.freq, note.steps * secondsPerStep);
        break;
      case 'clap':
        clap(this.voices, out, when, note.velocity);
        break;
      case 'shaker':
        shaker(this.voices, out, when, note.velocity);
        break;
      case 'bass':
        bass(this.voices, out, when, note.freq, note.velocity);
        break;
    }
  }

  /** A sound effect at audio time `when`. Returns false if the limiter dropped it. */
  playEffect(request: SfxRequest, when: number): boolean {
    const at = when + (request.delayMs ?? 0) / 1000;
    if (!this.limiter.tryPlay(request.name, at)) {
      this.stats.effectsDropped++;
      return false;
    }
    this.stats.effects++;
    playSfx(this.voices, this.sfxBus, request.name, at, request.velocity ?? 1, this.tuning.root, this.tuning.scale);
    if (SFX_PROFILE[request.name].duck) this.duck(0.45, at, SFX_PROFILE[request.name].duration + 0.3);
    return true;
  }

  /** Lowers the music to `amount` of its level for `seconds`, so a big moment is heard over it. */
  duck(amount: number, when: number, seconds: number): void {
    const g = this.duckGain.gain;
    g.setTargetAtTime(amount, when, 0.03);
    g.setTargetAtTime(1, when + seconds, 0.25);
  }
}
