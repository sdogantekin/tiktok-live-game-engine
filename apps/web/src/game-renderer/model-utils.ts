import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CLIP_BPM, loopPhase } from './beat-clock';
import { addMixerMs, PERF_ENABLED, perf } from './perf';
import type { AnimKind, AvatarModels } from './types';

const FADE_SECONDS = 0.12;
type Gltf = GLTF;

/** Clones a loaded rigged model so each avatar gets its own skeleton, sharing geometry and material. */
export function cloneModel(gltf: Gltf) {
  const object = SkeletonUtils.clone(gltf.scene);
  object.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) {
      node.castShadow = true;
      node.frustumCulled = false; // skinned bounds do not follow the animation (e.g. a high jump)
    }
  });
  const mixer = new THREE.AnimationMixer(object);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
  return { object, mixer, actions };
}

/** What the shared beat clock says right now, and which clip to dance while no accent is playing. */
export interface BeatState {
  baseClip: string;
  beats: number;
  bpm: number;
}

/**
 * Plays model clips on a rigged character: switches (with a short cross-fade) when the store starts
 * an animation, and returns to the base clip (idle, or the beat-synced dance) when it ends. Clips listed in
 * `models.loopBeats` are sampled from the shared beat clock every frame instead of free-running, so every
 * dancer is on the same beat; accents play at the tempo's speed.
 */
export function useClipPlayer(gltf: Gltf, models: AvatarModels) {
  const model = useMemo(() => cloneModel(gltf), [gltf]);
  const current = useRef<{ name: string; start: number; loopBeats: number | null } | null>(null);

  // Only stop playback on cleanup: React StrictMode runs cleanup then setup again on the same memoised mixer,
  // so un-caching its root here would corrupt it. The mixer is garbage-collected with the avatar.
  useEffect(
    () => () => {
      model.mixer.stopAllAction();
    },
    [model],
  );

  const update = (delta: number, anim: { kind: AnimKind; start: number; phase: number } | undefined, now: number, beat?: BeatState) => {
    const name = anim ? models.clips[anim.kind] : (beat?.baseClip ?? models.clips.idle);
    const marker = anim ? anim.start : -1;
    if (current.current?.name !== name || (anim && current.current.start !== marker)) {
      const next = model.actions.get(name);
      const synced = beat && models.looping.includes(name) ? (models.loopBeats?.[name] ?? null) : null;
      if (next) {
        const previous = current.current ? model.actions.get(current.current.name) : undefined;
        const loops = models.looping.includes(name);
        next.reset();
        next.setLoop(loops ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        next.clampWhenFinished = true;
        // Beat-synced clips are positioned from the clock each frame (so they must not advance themselves);
        // accents run at the tempo; other loops are desynchronised with a per-avatar offset.
        next.setEffectiveTimeScale(synced ? 0 : beat ? beat.bpm / CLIP_BPM : 1);
        if (loops && !synced) next.time = ((anim?.phase ?? now / 1000) % 1) * next.getClip().duration;
        next.fadeIn(FADE_SECONDS).play();
        perf.clipStarts[name] = (perf.clipStarts[name] ?? 0) + 1;
        if (previous && previous !== next) previous.fadeOut(FADE_SECONDS);
      }
      current.current = { name, start: marker, loopBeats: synced };
    }
    const active = current.current;
    if (beat && active?.loopBeats) {
      const action = model.actions.get(active.name);
      if (action) action.time = loopPhase(beat.beats, active.loopBeats) * action.getClip().duration;
    }
    if (PERF_ENABLED) {
      const t = performance.now();
      model.mixer.update(delta);
      addMixerMs(performance.now() - t);
    } else {
      model.mixer.update(delta);
    }
  };

  return { object: model.object, update };
}

