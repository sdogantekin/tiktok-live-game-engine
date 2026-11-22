import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { perf } from './perf';
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

/**
 * Plays model clips on a rigged character: switches (with a short cross-fade) when the store starts
 * an animation, and returns to idle when it ends.
 */
export function useClipPlayer(gltf: Gltf, models: AvatarModels) {
  const model = useMemo(() => cloneModel(gltf), [gltf]);
  const current = useRef<{ name: string; start: number } | null>(null);

  // Only stop playback on cleanup: React StrictMode runs cleanup then setup again on the same memoised mixer,
  // so un-caching its root here would corrupt it. The mixer is garbage-collected with the avatar.
  useEffect(
    () => () => {
      model.mixer.stopAllAction();
    },
    [model],
  );

  const update = (delta: number, anim: { kind: AnimKind; start: number; phase: number } | undefined, now: number) => {
    const name = anim ? models.clips[anim.kind] : models.clips.idle;
    const marker = anim ? anim.start : -1;
    if (current.current?.name !== name || (anim && current.current.start !== marker)) {
      const next = model.actions.get(name);
      if (next) {
        const previous = current.current ? model.actions.get(current.current.name) : undefined;
        const loops = models.looping.includes(name);
        next.reset();
        next.setLoop(loops ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        next.clampWhenFinished = true;
        // Desynchronise avatars: start looping clips at a per-avatar offset.
        if (loops) next.time = ((anim?.phase ?? now / 1000) % 1) * next.getClip().duration;
        next.fadeIn(FADE_SECONDS).play();
        perf.clipStarts[name] = (perf.clipStarts[name] ?? 0) + 1;
        if (previous && previous !== next) previous.fadeOut(FADE_SECONDS);
      }
      current.current = { name, start: marker };
    }
    model.mixer.update(delta);
  };

  return { object: model.object, update };
}

