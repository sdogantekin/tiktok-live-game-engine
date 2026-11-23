import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { SlotsStore } from './avatar-store';
import type { EnergyMeter } from './crowd-energy';
import { perf } from './perf';
import type { AvatarLook, Formation, TeamCount } from './types';

const BODY = new THREE.CapsuleGeometry(0.22, 0.36, 3, 6);
const HEAD = new THREE.SphereGeometry(0.18, 8, 6);
const dummy = new THREE.Object3D();

export interface CrowdGeometries {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
}

function CrowdTeam({ teamId, capacity, store, formation, energy, look, countRef, geometries }: {
  teamId: string;
  capacity: number;
  store: SlotsStore;
  formation: Formation;
  energy: EnergyMeter;
  look: AvatarLook;
  countRef: React.RefObject<Record<string, number>>;
  /** Modelled crowd figure (origin at the feet). Without it, the crowd is drawn from simple primitives. */
  geometries?: CrowdGeometries;
}) {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const placements = useMemo(() => Array.from({ length: capacity }, (_, i) => formation.crowd(teamId, i)), [capacity, formation, teamId]);
  const materials = useMemo(
    () =>
      geometries
        ? {
            body: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }),
            head: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }),
          }
        : {
            body: new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.8 }),
            head: new THREE.MeshStandardMaterial({ color: look.headColor, flatShading: true, roughness: 0.8 }),
          },
    [look.headColor, geometries],
  );
  // Modelled figures already contain their own body/head offsets; the primitives need them added here.
  const bodyLift = geometries ? 0 : 0.4;
  const headLift = geometries ? 0 : 0.95;

  // Give each crowd member a slightly different shade of the team colour, once.
  useLayoutEffect(() => {
    const mesh = bodies.current;
    if (!mesh) return;
    const base = new THREE.Color(look.bodyColor);
    const color = new THREE.Color();
    for (let i = 0; i < capacity; i++) {
      color.copy(base).offsetHSL(0, 0, ((i * 37) % 13) / 100 - 0.06);
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [capacity, look.bodyColor]);

  useFrame(() => {
    const body = bodies.current;
    const head = heads.current;
    if (!body || !head) return;
    const now = performance.now();
    const beats = store.motion.beats; // the crowd bobs on the same beat as the lines
    const total = countRef.current?.[teamId] ?? 0;
    const visible = Math.min(capacity, Math.max(0, total - store.slots.visibleCount(teamId)));
    const lively = energy.get(teamId, now);
    body.count = visible;
    head.count = visible;

    for (let i = 0; i < visible; i++) {
      const place = placements[i]!;
      const lag = (i % 4) * 0.12; // a little spread so the crowd is not a single block, but always on the beat
      const hop = (0.05 + 0.16 * lively) * Math.abs(Math.sin(Math.PI * (beats + lag)));
      const sway = (0.05 + 0.1 * lively) * Math.sin(Math.PI * (beats + lag));
      const [x, y, z] = place.position;

      dummy.position.set(x + sway, y + bodyLift + hop, z);
      dummy.rotation.set(0, place.rotationY, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x + sway, y + headLift + hop, z);
      dummy.updateMatrix();
      head.setMatrixAt(i, dummy.matrix);
    }
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    perf.crowdVisible += visible;
  });

  return (
    <>
      <instancedMesh ref={bodies} args={[geometries?.body ?? BODY, materials.body, capacity]} castShadow frustumCulled={false} />
      <instancedMesh ref={heads} args={[geometries?.head ?? HEAD, materials.head, capacity]} castShadow frustumCulled={false} />
    </>
  );
}

/**
 * Everyone without an individual avatar is drawn as part of an instanced crowd (two draw calls per
 * team), so 200 participants never mean 200 animated characters.
 */
export function Crowd({ teamIds, teams, capacityPerTeam, store, formation, energy, looks, geometries }: {
  teamIds: readonly string[];
  teams: readonly TeamCount[];
  capacityPerTeam: number;
  store: SlotsStore;
  formation: Formation;
  energy: EnergyMeter;
  looks: Readonly<Record<string, AvatarLook>>;
  geometries?: CrowdGeometries;
}) {
  const counts = useRef<Record<string, number>>({});
  useEffect(() => {
    counts.current = Object.fromEntries(teams.map((team) => [team.id, team.playerCount]));
  }, [teams]);

  // Reset the per-frame total the teams add to (the probe reads it after all teams have run).
  useFrame(() => {
    perf.crowdVisible = 0;
  }, -1);

  return (
    <>
      {teamIds.map((teamId) => (
        <CrowdTeam
          key={teamId}
          teamId={teamId}
          capacity={capacityPerTeam}
          store={store}
          formation={formation}
          energy={energy}
          look={looks[teamId]!}
          countRef={counts}
          geometries={geometries}
        />
      ))}
    </>
  );
}
