import { effectiveLayer, nextLayer, planStep } from './music-plan';
import type { MusicMode, NoteEvent, Score } from './types';

/** Where the scheduler sends notes. The real engine plays them; tests record them. */
export interface NoteSink {
  playNote(note: NoteEvent, when: number, secondsPerStep: number): void;
}

export interface MusicFrame {
  /** Current audio-clock time, seconds. */
  audioNow: number;
  /** The shared beat clock's beat count and tempo right now. */
  beats: number;
  bpm: number;
  /** Group energy, 0..1. */
  energy: number;
  mode: MusicMode;
}

/** How far ahead notes are handed to the audio clock. Longer is more robust to a slow frame, shorter follows tempo changes faster. */
export const LOOKAHEAD_SECONDS = 0.2;

/**
 * Plays a score on the scene's beat clock. Each frame it hands the audio clock every step that falls inside the
 * look-ahead window, at the exact audio time computed from the beat clock, so the music stays locked to the dancers
 * (tempo changes are slow, so the small mapping error between frames is inaudible).
 */
export class MusicScheduler {
  private nextStep: number | null = null;
  private energyLayer = 0;

  constructor(
    private readonly score: Score,
    private readonly sink: NoteSink,
    private readonly lookahead = LOOKAHEAD_SECONDS,
  ) {}

  /** Forget the position: the next frame starts from the beat clock again (after a pause or while the audio was suspended). */
  reset(): void {
    this.nextStep = null;
  }

  get layer(): number {
    return this.energyLayer;
  }

  update(frame: MusicFrame): void {
    this.energyLayer = nextLayer(this.energyLayer, frame.energy, this.score);
    if (frame.mode === 'off') {
      this.nextStep = null;
      return;
    }
    const layer = effectiveLayer(frame.mode, this.energyLayer);
    const stepNow = frame.beats * this.score.stepsPerBeat;
    // Start from the next step; if frames stalled for more than a step, skip ahead instead of playing a burst of old notes.
    if (this.nextStep === null || this.nextStep < Math.floor(stepNow) - 1) this.nextStep = Math.ceil(stepNow);
    const secondsPerStep = 60 / frame.bpm / this.score.stepsPerBeat;

    while ((this.nextStep - stepNow) * secondsPerStep < this.lookahead) {
      const when = frame.audioNow + Math.max(0, (this.nextStep - stepNow) * secondsPerStep);
      for (const note of planStep(this.score, this.nextStep, layer, frame.mode)) this.sink.playNote(note, when, secondsPerStep);
      this.nextStep++;
    }
  }
}
