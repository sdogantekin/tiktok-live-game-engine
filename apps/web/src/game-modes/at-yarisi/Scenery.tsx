import { useLoader } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { seeded } from './Grandstand';
import { type ScatterRule, scatter, type Spot } from './scatter';
import { SCENERY_BASE, SCENERY_MODELS } from './assets.manifest';

/** Our own palette for the kit's materials, by material name, so the scenery sits with the rest of the course. */
const PALETTE: Readonly<Record<string, string>> = {
  leafsGreen: '#4f9d45',
  leafsDark: '#2f7a45',
  leafsAutumn: '#c9772a',
  woodBark: '#8b5a2b',
  woodBarkDark: '#6b4423',
  grass: '#5aa14f',
  stone: '#a3a39b',
  colorRed: '#d94a4a',
  colorYellow: '#f2b83a',
  colorPurple: '#9a5bd6',
};

interface Group {
  models: readonly string[];
  count: number;
  rule: ScatterRule;
  /** Size multiplier range: the kit's models are about a metre or two, so they are scaled up to read on a broadcast. */
  size: readonly [number, number];
}

const GROUPS: readonly Group[] = [
  // trees round the outside, in clumps and rows
  { models: ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_pineDefaultA', 'tree_pineTallA', 'tree_pineRoundA'], count: 160, rule: { min: 14, max: 110, where: 'outside' }, size: [4.2, 6.5] },
  // a few in the infield, away from the pond
  { models: ['tree_oak', 'tree_default', 'tree_pineRoundA'], count: 10, rule: { min: 14, max: 40, where: 'infield' }, size: [4, 5.5] },
  // bushes just outside the boards, and in the infield
  { models: ['plant_bush', 'plant_bushLarge', 'plant_bushDetailed'], count: 120, rule: { min: 12, max: 40, where: 'outside' }, size: [3, 5] },
  { models: ['plant_bush', 'plant_bushLarge'], count: 20, rule: { min: 9, max: 30, where: 'infield' }, size: [3, 4.5] },
  // flowers and grass tufts
  { models: ['flower_redA', 'flower_yellowA', 'flower_purpleA'], count: 120, rule: { min: 10, max: 50, where: 'both' }, size: [3, 4.5] },
  { models: ['grass_large'], count: 120, rule: { min: 9, max: 60, where: 'both' }, size: [3.5, 5] },
  // stones
  { models: ['stone_largeA', 'stone_largeC', 'stone_smallA'], count: 22, rule: { min: 10, max: 70, where: 'both' }, size: [2.4, 4.5] },
];

const urlOf = (name: string) => `${SCENERY_BASE}/${name}.glb`;

/**
 * Trees, bushes, flowers, grass and stones from the CC0 Kenney Nature Kit, scattered with a seeded random so the place looks
 * the same every time, never on the track (`scatter`). Every model is drawn with instancing: a few draw calls for hundreds of plants.
 */
export function Scenery() {
  const names = SCENERY_MODELS;
  const gltfs = useLoader(
    GLTFLoader,
    names.map(urlOf),
  );

  // For every model: which mesh parts it has, with their geometry, a recoloured material and their place inside the model.
  const parts = useMemo(() => {
    const byName = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 }[]>();
    names.forEach((name, i) => {
      const list: { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 }[] = [];
      const root = gltfs[i]!.scene;
      root.updateMatrixWorld(true);
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const material = (mesh.material as THREE.MeshStandardMaterial).clone();
        const recolor = PALETTE[material.name];
        if (recolor) material.color.set(recolor);
        material.metalness = 0;
        material.roughness = 0.95;
        list.push({ geometry: mesh.geometry, material, local: mesh.matrixWorld.clone() });
      });
      byName.set(name, list);
    });
    return byName;
  }, [gltfs, names]);

  // Where each model goes: every group's spots are shared out among its models.
  const placements = useMemo(() => {
    const rnd = seeded(33);
    const out = new Map<string, { spot: Spot; size: number }[]>();
    for (const group of GROUPS) {
      for (const spot of scatter(rnd, group.count, group.rule)) {
        const name = group.models[Math.floor(spot.pick * group.models.length)]!;
        const size = group.size[0] + rnd() * (group.size[1] - group.size[0]);
        (out.get(name) ?? out.set(name, []).get(name)!).push({ spot, size });
      }
    }
    return out;
  }, []);

  return (
    <>
      {[...placements].flatMap(([name, spots]) =>
        (parts.get(name) ?? []).map((part, i) => <InstancedPart key={`${name}-${i}`} part={part} spots={spots} />),
      )}
    </>
  );
}

function InstancedPart({ part, spots }: { part: { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 }; spots: { spot: Spot; size: number }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const placed = new THREE.Matrix4();
    const turn = new THREE.Matrix4();
    const scale = new THREE.Matrix4();
    spots.forEach(({ spot, size }, i) => {
      turn.makeRotationY(spot.turn);
      scale.makeScale(size, size, size);
      placed.makeTranslation(spot.x, 0, spot.z).multiply(turn).multiply(scale).multiply(part.local);
      mesh.setMatrixAt(i, placed);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [part, spots]);
  return <instancedMesh ref={ref} args={[part.geometry, part.material, spots.length]} frustumCulled={false} />;
}
