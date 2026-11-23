import type { SoundEngine } from './engine';
import type { MusicMode, MusicTrack, SoundDesign } from './types';

/** Beat position of the file, `elapsedSeconds` after it started (negative before its first beat). Counts on across loops. */
export function trackBeats(elapsedSeconds: number, track: MusicTrack & { bpm: number }): number {
  return ((elapsedSeconds - (track.firstBeatSeconds ?? 0)) * track.bpm) / 60;
}

const MODE_LEVEL: Readonly<Record<MusicMode, number>> = { off: 0, calm: 0.55, build: 0.8, full: 1 };

/** How loud the file plays in a music mode. */
export function trackLevel(mode: MusicMode, track: MusicTrack): number {
  return MODE_LEVEL[mode] * (track.gain ?? 0.9);
}

/** Problems with a track definition a game producer should fix (checked by tests, so a typo cannot ship). */
export function validateTrack(track: MusicTrack): string[] {
  const problems: string[] = [];
  if (track.url.trim() === '') problems.push('track needs a url');
  if (track.bpm !== undefined && (!Number.isFinite(track.bpm) || track.bpm < 40 || track.bpm > 240)) problems.push('track bpm must be between 40 and 240');
  if (track.firstBeatSeconds !== undefined && (!Number.isFinite(track.firstBeatSeconds) || track.firstBeatSeconds < 0)) problems.push('firstBeatSeconds must be 0 or more');
  if (track.gain !== undefined && (track.gain < 0 || track.gain > 1)) problems.push('gain must be between 0 and 1');
  return problems;
}

/**
 * Whether the built-in sound effects should play. With a music file in use they stay silent (they would break the file's
 * music) unless the game opts in; while the file is still loading, or if it failed, the built-in music and effects play.
 */
export function effectsEnabled(design: Pick<SoundDesign, 'track' | 'effectsOverTrack'>, trackState: TrackState | null): boolean {
  if (!design.track || trackState !== 'ready') return true;
  return design.effectsOverTrack === true;
}

const FADE_SECONDS = 0.6;

export type TrackState = 'loading' | 'ready' | 'failed';

/** The parts of an `HTMLAudioElement` the player uses (so tests can stand in for it). */
export interface MediaLike {
  loop: boolean;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: 'canplay' | 'error', listener: () => void, options?: { once: boolean }): void;
}

/**
 * Plays a game-supplied music file through the engine's music bus. The file is streamed through an audio element (a long
 * track is never decoded into memory), faded in and out with the music mode, and, if the track states its tempo, its beat
 * position is reported so the scene's clock can lock to it.
 */
export class TrackPlayer {
  private media: MediaLike | null = null;
  private gain: GainNode | null = null;
  private _state: TrackState = 'loading';
  private playingNow = false;
  private startedAt = 0;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly engine: SoundEngine,
    private readonly track: MusicTrack,
    private readonly createMedia: (url: string) => MediaLike = (url) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      return audio;
    },
  ) {}

  get state(): TrackState {
    return this._state;
  }

  get playing(): boolean {
    return this.playingNow;
  }

  /** Starts fetching the file. Resolves when it can play; a failure leaves the state `failed` and the game on its built-in music. */
  load(): Promise<void> {
    this.engine.stats.track = 'loading';
    return new Promise((resolve) => {
      try {
        const media = this.createMedia(this.track.url);
        media.loop = this.track.loop ?? true;
        media.addEventListener(
          'canplay',
          () => {
            try {
              const source = (this.engine.ctx as AudioContext).createMediaElementSource(media as HTMLMediaElement);
              const gain = this.engine.ctx.createGain();
              gain.gain.value = 0;
              source.connect(gain).connect(this.engine.musicInput);
              this.media = media;
              this.gain = gain;
              this._state = 'ready';
              this.engine.stats.track = 'ready';
            } catch (error) {
              this.fail(error);
            }
            resolve();
          },
          { once: true },
        );
        media.addEventListener(
          'error',
          () => {
            this.fail(new Error('the browser could not load or decode the file'));
            resolve();
          },
          { once: true },
        );
      } catch (error) {
        this.fail(error);
        resolve();
      }
    });
  }

  private fail(error: unknown): void {
    this._state = 'failed';
    this.engine.stats.track = 'failed';
    console.warn(`[sound] could not use the music file ${this.track.url}:`, error);
  }

  /**
   * Call once a frame. Starts, fades and stops the file as the music mode requires. Returns the beat position and tempo
   * the scene's clock should lock to while the file is audible, or null when it is not playing or has no stated tempo.
   */
  update(mode: MusicMode): { beats: number; bpm: number } | null {
    if (this._state !== 'ready' || !this.media || !this.gain) return null;
    const ctx = this.engine.ctx;

    if (mode === 'off') {
      this.stop();
      return null;
    }
    if (!this.playingNow) this.start();
    this.gain.gain.setTargetAtTime(trackLevel(mode, this.track), ctx.currentTime, FADE_SECONDS / 3);
    const bpm = this.track.bpm;
    return bpm === undefined ? null : { beats: trackBeats(ctx.currentTime - this.startedAt, { ...this.track, bpm }), bpm };
  }

  private start(): void {
    const media = this.media!;
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
    media.currentTime = 0;
    this.playingNow = true;
    this.engine.stats.track = 'playing';
    this.startedAt = this.engine.ctx.currentTime;
    media.play().catch((error: unknown) => {
      this.playingNow = false; // e.g. the browser wants a click first: try again next frame
      console.warn('[sound] the music file could not start yet:', error);
    });
  }

  /** Fades out and pauses. Starting again later begins the file from the top. */
  stop(): void {
    if (!this.playingNow || !this.media || !this.gain) return;
    const ctx = this.engine.ctx;
    this.gain.gain.cancelScheduledValues(ctx.currentTime);
    this.gain.gain.setTargetAtTime(0, ctx.currentTime, FADE_SECONDS / 3);
    this.playingNow = false;
    this.engine.stats.track = 'ready';
    const media = this.media;
    this.pauseTimer = setTimeout(() => media.pause(), FADE_SECONDS * 1000 + 100);
  }
}
