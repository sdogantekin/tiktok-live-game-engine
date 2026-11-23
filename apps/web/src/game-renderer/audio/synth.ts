import type { SfxName } from './types';

/**
 * Original synthesised voices. Nothing is sampled: every sound is an oscillator or filtered noise shaped by an
 * envelope, so there are no recordings to license and no files to load. Each voice schedules itself at an absolute
 * audio time `when` (seconds) and connects to `out`.
 */
export interface VoiceContext {
  ctx: BaseAudioContext;
  noise: AudioBuffer;
}

const FLOOR = 0.0001;

/** One second of white noise, shared by every voice that needs noise. */
export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 12345; // deterministic, so offline renders are repeatable
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

/** A gain node that rises to `peak` over `attack` seconds then decays to silence over `decay` seconds. */
function percussive(ctx: BaseAudioContext, when: number, peak: number, attack: number, decay: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(FLOOR, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(FLOOR * 2, peak), when + attack);
  gain.gain.exponentialRampToValueAtTime(FLOOR, when + attack + decay);
  return gain;
}

function noiseBurst(v: VoiceContext, out: AudioNode, when: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, offset = 0): void {
  const source = v.ctx.createBufferSource();
  source.buffer = v.noise;
  const filter = v.ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = percussive(v.ctx, when + offset, peak, 0.002, decay);
  source.connect(filter).connect(gain).connect(out);
  source.start(when + offset, 0.1 + ((offset * 997) % 0.5));
  source.stop(when + offset + decay + 0.05);
}

function tone(ctx: BaseAudioContext, out: AudioNode, when: number, freq: number, peak: number, decay: number, type: OscillatorType = 'sine', attack = 0.004): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = percussive(ctx, when, peak, attack, decay);
  osc.connect(gain).connect(out);
  osc.start(when);
  osc.stop(when + attack + decay + 0.05);
}

// ---- Music voices -------------------------------------------------------------------------------------------

/** The big drum (davul): a mid-pitched thump (not a sub-bass) with a quick skin slap on top. */
export function bassDrum(v: VoiceContext, out: AudioNode, when: number, velocity: number): void {
  const osc = v.ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(170, when);
  osc.frequency.exponentialRampToValueAtTime(70, when + 0.1);
  const gain = percussive(v.ctx, when, 1.0 * velocity, 0.002, 0.3);
  osc.connect(gain).connect(out);
  osc.start(when);
  osc.stop(when + 0.35);
  // The skin slap: a short burst of mid-high noise gives the davul its attack.
  noiseBurst(v, out, when, 'bandpass', 1400, 0.8, 0.42 * velocity, 0.07);
  noiseBurst(v, out, when, 'lowpass', 500, 0.7, 0.25 * velocity, 0.05);
}

/** The thin stick on the rim (tek): a short bright tick with a hint of tone. */
export function rimDrum(v: VoiceContext, out: AudioNode, when: number, velocity: number): void {
  const osc = v.ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(620, when);
  osc.frequency.exponentialRampToValueAtTime(400, when + 0.04);
  const gain = percussive(v.ctx, when, 0.28 * velocity, 0.002, 0.06);
  osc.connect(gain).connect(out);
  osc.start(when);
  osc.stop(when + 0.12);
  noiseBurst(v, out, when, 'bandpass', 4200, 0.9, 0.5 * velocity, 0.055);
}

/** The reed lead (zurna): a bright, piercing, nasal tone (saw and square, formants high up) with a light late vibrato and a small scoop into each note. */
export function reed(v: VoiceContext, out: AudioNode, when: number, freq: number, duration: number, velocity: number): void {
  const { ctx } = v;
  const end = when + Math.max(0.05, duration);
  const mix = ctx.createGain();
  mix.gain.value = 0.5;
  const formant1 = ctx.createBiquadFilter();
  formant1.type = 'peaking';
  formant1.frequency.value = 1400;
  formant1.Q.value = 3;
  formant1.gain.value = 10;
  const formant2 = ctx.createBiquadFilter();
  formant2.type = 'peaking';
  formant2.frequency.value = 3200;
  formant2.Q.value = 4;
  formant2.gain.value = 8;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 9500;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(FLOOR, when);
  gain.gain.exponentialRampToValueAtTime(0.11 * velocity, when + 0.012);
  gain.gain.setValueAtTime(0.11 * velocity, Math.max(when + 0.014, end - 0.025));
  gain.gain.exponentialRampToValueAtTime(FLOOR, end + 0.03);
  mix.connect(formant1).connect(formant2).connect(lowpass).connect(gain).connect(out);

  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.setValueAtTime(0, when);
  vibratoDepth.gain.linearRampToValueAtTime(freq * 0.004, when + 0.3);
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.2;
  vibrato.connect(vibratoDepth);
  vibrato.start(when);
  vibrato.stop(end + 0.1);

  for (const [type, detune] of [
    ['sawtooth', -6],
    ['square', 6],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq * 0.98, when);
    osc.frequency.exponentialRampToValueAtTime(freq, when + 0.025);
    vibratoDepth.connect(osc.frequency);
    osc.connect(mix);
    osc.start(when);
    osc.stop(end + 0.1);
  }
  // A little breath on the attack.
  noiseBurst(v, out, when, 'bandpass', 3000, 0.8, 0.05 * velocity, 0.04);
}

/** The held note under the music (the second zurna's ıson): two detuned saws through a gentle low-pass, kept light. */
export function drone(v: VoiceContext, out: AudioNode, when: number, freq: number, duration: number): void {
  const { ctx } = v;
  const end = when + duration;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 1500;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(FLOOR, when);
  gain.gain.exponentialRampToValueAtTime(0.022, when + 0.15);
  gain.gain.setValueAtTime(0.022, Math.max(when + 0.16, end - 0.1));
  gain.gain.exponentialRampToValueAtTime(FLOOR, end + 0.25);
  lowpass.connect(gain).connect(out);
  for (const detune of [-5, 5]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(lowpass);
    osc.start(when);
    osc.stop(end + 0.3);
  }
}

/** A shaker / tambourine tick: a very short burst of high noise. */
export function shaker(v: VoiceContext, out: AudioNode, when: number, velocity: number): void {
  noiseBurst(v, out, when, 'highpass', 5200, 0.7, 0.26 * velocity, 0.04);
}

/** A short plucked bass note (a bağlama-like low pluck, not a sustained drone): fundamental plus a touch of upper harmonic. */
export function bass(v: VoiceContext, out: AudioNode, when: number, freq: number, velocity: number): void {
  for (const [type, ratio, level] of [
    ['sine', 1, 0.5],
    ['triangle', 2, 0.18],
  ] as const) {
    const osc = v.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq * ratio;
    const gain = percussive(v.ctx, when, level * velocity, 0.004, 0.22);
    osc.connect(gain).connect(out);
    osc.start(when);
    osc.stop(when + 0.3);
  }
}

export function clap(v: VoiceContext, out: AudioNode, when: number, velocity: number): void {
  noiseBurst(v, out, when, 'bandpass', 1500, 1.2, 0.3 * velocity, 0.1);
  noiseBurst(v, out, when, 'bandpass', 1900, 1.4, 0.25 * velocity, 0.12, 0.011);
}

// ---- Sound effects ------------------------------------------------------------------------------------------

/** Plays one sound effect. `root` and `scale` (semitones) tune the melodic ones to the game's music. */
export function playSfx(v: VoiceContext, out: AudioNode, name: SfxName, when: number, velocity: number, root: number, scale: readonly number[]): void {
  const { ctx } = v;
  const note = (degree: number, octaves = 2) => root * 2 ** (octaves + (scale[degree % (scale.length - 1)]! + 12 * Math.floor(degree / (scale.length - 1))) / 12);
  switch (name) {
    case 'pop': {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(720, when);
      osc.frequency.exponentialRampToValueAtTime(340, when + 0.07);
      const gain = percussive(ctx, when, 0.16 * velocity, 0.003, 0.08);
      osc.connect(gain).connect(out);
      osc.start(when);
      osc.stop(when + 0.15);
      break;
    }
    case 'clap':
      clap(v, out, when, velocity);
      break;
    case 'whoosh': {
      const source = ctx.createBufferSource();
      source.buffer = v.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 2;
      filter.frequency.setValueAtTime(500, when);
      filter.frequency.exponentialRampToValueAtTime(3000, when + 0.32);
      const gain = percussive(ctx, when, 0.22 * velocity, 0.1, 0.25);
      source.connect(filter).connect(gain).connect(out);
      source.start(when, 0.2);
      source.stop(when + 0.45);
      break;
    }
    case 'sparkle':
      [0, 2, 4].forEach((degree, i) => tone(ctx, out, when + i * 0.045, note(degree, 4), 0.07 * velocity, 0.25));
      break;
    case 'chime':
      [
        [1, 0.22, 1.4],
        [2.76, 0.1, 0.9],
        [5.4, 0.05, 0.5],
        [8.9, 0.025, 0.3],
      ].forEach(([ratio, level, decay]) => tone(ctx, out, when, note(4, 3) * ratio!, level! * velocity, decay!, 'sine', 0.002));
      break;
    case 'tick':
      tone(ctx, out, when, 880, 0.18 * velocity, 0.08, 'sine', 0.002);
      break;
    case 'go':
      tone(ctx, out, when, 1320, 0.2 * velocity, 0.4, 'sine', 0.002);
      tone(ctx, out, when, 1760, 0.12 * velocity, 0.3, 'sine', 0.002);
      bassDrum(v, out, when, velocity);
      break;
    case 'roll':
      // A fast alternating drum roll that swells.
      for (let i = 0; i < 14; i++) {
        const at = when + i * 0.045;
        const level = velocity * (0.35 + 0.65 * (i / 13));
        if (i % 2 === 0) bassDrum(v, out, at, level * 0.7);
        else rimDrum(v, out, at, level);
      }
      break;
    case 'fanfare':
      // A rising reed call and a big drum hit.
      [0, 2, 3, 4, 6].forEach((degree, i, all) => reed(v, out, when + i * 0.13, note(degree), i === all.length - 1 ? 0.7 : 0.14, 0.9 * velocity));
      bassDrum(v, out, when, velocity);
      bassDrum(v, out, when + 0.65, velocity);
      break;
    case 'cheer': {
      // A crowd "hooray": two bands of noise swelling together.
      for (const [freq, level] of [
        [900, 0.16],
        [1900, 0.1],
      ] as const) {
        const source = ctx.createBufferSource();
        source.buffer = v.noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = freq;
        filter.Q.value = 0.9;
        const gain = percussive(ctx, when, level * velocity, 0.35, 0.9);
        source.connect(filter).connect(gain).connect(out);
        source.start(when, 0.05);
        source.stop(when + 1.35);
      }
      break;
    }
  }
}
