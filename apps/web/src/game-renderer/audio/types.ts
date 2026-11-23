import type { Phase } from '@live-game/contracts';
import type { Cue } from '../cue-bus';

/** The renderer's own sound-effect vocabulary. A game maps its cues onto these (see `SoundDesign`). */
export type SfxName = 'pop' | 'clap' | 'whoosh' | 'sparkle' | 'chime' | 'tick' | 'go' | 'fanfare' | 'roll' | 'cheer';

export interface SfxRequest {
  name: SfxName;
  /** 0..1, default 1. */
  velocity?: number;
  /** Delay after the triggering moment, in ms. */
  delayMs?: number;
}

/** What the music does in a phase: nothing, a quiet bed, a building beat, or the full energy-driven arrangement. */
export type MusicMode = 'off' | 'calm' | 'build' | 'full';

/**
 * A piece of music as data. One step is a fraction of a beat (`stepsPerBeat` per beat); every pattern string has one
 * character per step and the same length, so the pattern repeats as one unit.
 */
export interface Score {
  stepsPerBeat: number;
  stepsPerBar: number;
  /** Fundamental of the piece, Hz. The drone holds it, the lead sings `leadOctaves` above. */
  rootHz: number;
  leadOctaves: number;
  /** Scale as semitones above the root; the last entry is normally the octave. */
  scale: readonly number[];
  /** Drum pattern: `D` bass drum, `d` soft bass, `t` rim hit, `k` ghost rim hit, `.` rest. */
  drums: string;
  /** Hand claps: `c` on a step, `.` rest. */
  claps: string;
  /** Shaker / tambourine texture: `S` accent, `s` soft, `.` rest. */
  shaker: string;
  /** Rhythmic bass plucks: a digit is a scale degree plucked on that step, `.` rest. */
  bass: string;
  /** Lead phrases: a digit is a scale degree that starts a note, `-` holds it, `.` rests. Played in turn, a phrase per pattern. */
  phrases: readonly string[];
  /** Energy needed to climb into arrangement layers 1, 2, 3 (and, lower, to fall back out of them). */
  layerUp: readonly [number, number, number];
  layerDown: readonly [number, number, number];
}

/**
 * A music file supplied by the game; its producer is responsible for the rights to it. If the track states a tempo, the
 * scene's beat clock locks to it while it plays. Loops should then be a whole number of bars, so the dancers' beat counts
 * on without a jump when the file wraps.
 */
export interface MusicTrack {
  /** Where the browser fetches the file from (any format it can decode: mp3, ogg, wav, m4a). */
  url: string;
  /**
   * The file's tempo in beats per minute, if it has one steady tempo. Then the scene's beat clock locks to the file, so
   * the dancers dance exactly to it. Leave it out for a file with a changing or unknown tempo: the dancers then keep their
   * own (energy-driven) beat and the file simply plays.
   */
  bpm?: number;
  /** Seconds from the start of the file to its first beat (default 0). */
  firstBeatSeconds?: number;
  /** Loop the file while the music should play (default true). */
  loop?: boolean;
  /** Level of the file against the effects, 0..1 (default 0.9). */
  gain?: number;
}

/** Everything a game decides about its sound. The renderer provides the synthesis, scheduling and limits. */
export interface SoundDesign {
  /** Built-in synthesised music. Plays when there is no track, or while the track is loading or failed to load. */
  score?: Score;
  /** A music file the game supplies; takes over from the synthesised score once loaded. */
  track?: MusicTrack;
  /**
   * Whether the engine's built-in sound effects also play over the game's music file. Default false: effects written for
   * the built-in music would clash with a file, so they stay silent while a file is in use (the game's own music is the
   * whole soundtrack). Has no effect without a track.
   */
  effectsOverTrack?: boolean;
  music: Readonly<Record<Phase, MusicMode>>;
  /** Sound effects for a cue. */
  cue(cue: Cue): readonly SfxRequest[];
  /** Sound effects when the game enters a phase. */
  phaseEntered(phase: Phase): readonly SfxRequest[];
  /** The tick for the last seconds of a countdown, or null. */
  countdownTick(secondsLeft: number): SfxRequest | null;
}

/** One thing the music asks a voice to play. */
export type NoteEvent =
  | { voice: 'bassDrum' | 'rimDrum'; velocity: number }
  | { voice: 'reed'; freq: number; steps: number; velocity: number }
  | { voice: 'drone'; freq: number; steps: number }
  | { voice: 'clap'; velocity: number }
  | { voice: 'shaker'; velocity: number }
  | { voice: 'bass'; freq: number; velocity: number };
