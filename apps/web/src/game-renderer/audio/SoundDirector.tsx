import { useFrame } from '@react-three/fiber';
import type { Phase } from '@live-game/contracts';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { BeatClock } from '../beat-clock';
import type { CueBus } from '../cue-bus';
import type { SoundEngine } from './engine';
import { MusicScheduler } from './music-scheduler';
import { effectsEnabled, TrackPlayer } from './track-player';
import type { SfxRequest, SoundDesign } from './types';

/**
 * Drives the sound for a scene: schedules the music on the scene's beat clock, plays effects for cues and phase
 * changes, and counts the last seconds of a countdown. Renders nothing. Must run after the clock has ticked
 * (it uses a later frame priority).
 */
export function SoundDirector({ engine, design, clock, energyOf, phase, paused, secondsLeft, cues }: {
  engine: SoundEngine;
  design: SoundDesign;
  clock: BeatClock;
  /** Group energy now, 0..1. */
  energyOf: (now: number) => number;
  phase: Phase;
  paused: boolean;
  secondsLeft: number | null;
  cues: CueBus;
}) {
  const scheduler = useMemo(() => (design.score ? new MusicScheduler(design.score, engine) : null), [design, engine]);
  useEffect(() => {
    if (design.score) engine.tuneTo(design.score);
  }, [engine, design]);

  // A music file the game supplies: loaded once, then it takes over from the synthesised score.
  const player = useMemo(() => (design.track ? new TrackPlayer(engine, design.track) : null), [design, engine]);
  useEffect(() => {
    void player?.load();
    return () => player?.stop();
  }, [player]);

  useFrame(() => {
    const mode = paused ? 'off' : design.music[phase];
    if (!engine.running) {
      scheduler?.reset(); // nothing can be heard yet: do not queue notes; start fresh when sound comes on
      return;
    }
    // The game's own music file, once loaded: the dancers' beat locks to the file's tempo and the built-in music rests.
    if (player?.state === 'ready') {
      const lock = player.update(mode);
      scheduler?.reset();
      if (lock) clock.lockTo(lock.beats, lock.bpm);
      return;
    }
    if (!scheduler || engine.isMuted) {
      scheduler?.reset();
      return;
    }
    scheduler.update({ audioNow: engine.ctx.currentTime, beats: clock.beats, bpm: clock.bpm, energy: energyOf(performance.now()), mode });
  }, -1);

  const play = useCallback(
    (requests: readonly SfxRequest[]) => {
      if (!engine.running || engine.isMuted) return;
      // A game's own music file is the whole soundtrack: the built-in effects would break it.
      if (!effectsEnabled(design, player?.state ?? null)) return;
      for (const request of requests) engine.playEffect(request, engine.ctx.currentTime);
    },
    [engine, design, player],
  );

  useEffect(() => cues.subscribe((cue) => play(design.cue(cue))), [cues, design, play]);

  const previousPhase = useRef(phase);
  useEffect(() => {
    if (previousPhase.current !== phase) play(design.phaseEntered(phase));
    previousPhase.current = phase;
  }, [phase, design, play]);

  useEffect(() => {
    if (phase !== 'countdown' || paused || secondsLeft === null) return;
    const tick = design.countdownTick(secondsLeft);
    if (tick) play([tick]);
  }, [secondsLeft, phase, paused, design, play]);

  return null;
}
