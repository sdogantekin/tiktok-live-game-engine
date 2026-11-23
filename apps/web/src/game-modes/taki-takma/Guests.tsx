import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { SlotsStore } from '../../game-renderer/avatar-store';
import { useClipPlayer } from '../../game-renderer/model-utils';
import { perf } from '../../game-renderer/perf';
import type { AvatarModels } from '../../game-renderer/types';
import type { GoldPieces } from './gold';
import { FACING_COUPLE, GUEST_VARIANTS, GUEST_WALK, guestModels, guestVariantIndex, pinSpot, TEAM_IDS } from './scene-config';
import { TRIP_MS, tripPose, type Trips } from './trips';

const CARRY_HEIGHT = 2.3;

function Guest({ store, trips, gold, goldIndex, teamId, index, gltf, models }: { store: SlotsStore; trips: Trips; gold: GoldPieces; goldIndex: number; teamId: string; index: number; gltf: GLTF; models: AvatarModels }) {
  const root = useRef<THREE.Group>(null);
  const occupant = useRef<string | null>(null);
  const spawnedAt = useRef(0);
  const seenWalk = useRef(-1);
  const pinAnim = useRef({ kind: 'special' as const, start: 0, phase: 0 });
  const home = useMemo(() => store.placement(teamId, index).position, [store, teamId, index]);
  const spot = useMemo(() => pinSpot(teamId, index), [teamId, index]);
  const player = useClipPlayer(gltf, models);

  const showGold = (visible: boolean, x = 0, y = 0, z = 0, size = 1) => (visible ? gold.show(goldIndex, x, y, z, size) : gold.hide(goldIndex));

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const id = store.slots.slots(teamId)[index] ?? null;
    group.visible = id !== null;
    if (id === null) {
      if (occupant.current !== null) showGold(false);
      occupant.current = null;
      return;
    }
    const now = performance.now();
    if (occupant.current !== id) {
      occupant.current = id;
      spawnedAt.current = now;
      seenWalk.current = -1;
    }
    const { beats, bpm } = store.motion;
    const anim = store.anims.get(id);
    // A `tak` (or a gift) starts the walk to the couple; the same animation start is only taken once.
    if (anim?.kind === 'special' && anim.start !== seenWalk.current) {
      seenWalk.current = anim.start;
      trips.begin(id, now);
    }

    const trip = trips.active(id, now);
    if (trip) {
      const pose = tripPose(home, FACING_COUPLE, spot, FACING_COUPLE, (now - trip.start) / TRIP_MS);
      group.position.set(pose.position[0], 0, pose.position[2]);
      group.rotation.y = pose.rotationY;
      pinAnim.current.start = trip.start + pose.pinAt * TRIP_MS;
      const pinning = pose.phase === 'pin';
      player.update(delta, pinning ? pinAnim.current : undefined, now, { baseClip: pinning ? models.clips.idle : GUEST_WALK, beats, bpm });
      if (pose.phase === 'back') showGold(false);
      else showGold(true, pose.position[0], CARRY_HEIGHT + Math.sin(now / 160) * 0.06, pose.position[2], trip.size);
    } else {
      group.position.set(home[0], home[1], home[2]);
      group.rotation.y = FACING_COUPLE;
      const accent = anim && anim.kind !== 'special' && now - anim.start < anim.duration ? anim : undefined;
      player.update(delta, accent, now, { baseClip: models.clips.idle, beats, bpm });
      showGold(false);
    }
    group.scale.setScalar(Math.min(1, (now - spawnedAt.current) / 300)); // new guests pop in
  });

  return (
    <group ref={root} position={[...home]} rotation={[0, FACING_COUPLE, 0]} visible={false}>
      <primitive object={player.object} />
    </group>
  );
}

/** The guests of both sides in their queues, each able to walk up to the couple, pin a takı and walk back. */
export function Guests({ store, trips, gold }: { store: SlotsStore; trips: Trips; gold: GoldPieces }) {
  const gltfs = useLoader(GLTFLoader, TEAM_IDS.flatMap((teamId) => [...GUEST_VARIANTS[teamId]!]));
  const capacity = store.slots.slots(TEAM_IDS[0]).length;

  useEffect(() => {
    perf.modelsLoaded.avatars = true;
    return () => {
      perf.modelsLoaded.avatars = false;
    };
  }, []);

  return (
    <>
      {TEAM_IDS.flatMap((teamId, teamIndex) =>
        store.slots.slots(teamId).map((_, index) => (
          <Guest key={`${teamId}-${index}`} store={store} trips={trips} gold={gold} goldIndex={teamIndex * capacity + index} teamId={teamId} index={index} gltf={gltfs[teamIndex * 2 + guestVariantIndex(index)]!} models={guestModels} />
        )),
      )}
    </>
  );
}

/** The shared instanced mesh of carried gold. Hidden until a guest shows an instance. */
export function CarriedGold({ gold, count }: { gold: GoldPieces; count: number }) {
  return (
    <instancedMesh ref={(mesh) => gold.attach(mesh)} args={[undefined, undefined, count]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#ffd35a" emissive="#b8860b" emissiveIntensity={0.6} metalness={0.5} roughness={0.35} flatShading />
    </instancedMesh>
  );
}
