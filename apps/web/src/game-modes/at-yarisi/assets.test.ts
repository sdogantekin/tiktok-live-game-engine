import { describe, expect, it } from 'vitest';
import { readGlb } from '../mahalle-halayi/glb-info';
import { BUDGETS, HORSE_BONES, HORSE_CLIPS, HORSE_MESHES, MODEL_URLS } from './assets.manifest';
import { horseModels } from './scene-config';

const file = (url: string) => new URL(`../../../public${url}`, import.meta.url);

describe('the horse model', () => {
  const info = readGlb(file(MODEL_URLS.horse));

  it('is three skinned meshes (coat, silks, rider) within the triangle budget', () => {
    expect([...info.meshNames].sort()).toEqual([...HORSE_MESHES].sort());
    for (const name of HORSE_MESHES) expect(info.primitivesPerMesh[name], name).toBe(1);
    expect(info.triangles).toBeLessThanOrEqual(BUDGETS.horseTriangles);
    expect(info.images + info.textures).toBe(0);
  });

  it('has the 28-bone rig and exactly the agreed clips, of sensible length', () => {
    expect(info.jointCount).toBe(HORSE_BONES);
    expect([...info.clipNames].sort()).toEqual([...HORSE_CLIPS].sort());
    expect(info.clipSeconds.gallop).toBeCloseTo(0.8, 0); // one stride in about 0.8 s at the base tempo
    for (const [clip, seconds] of Object.entries(info.clipSeconds)) {
      expect(seconds, clip).toBeGreaterThan(0.5);
      expect(seconds, clip).toBeLessThan(8); // the standing loop is a few seconds long
    }
  });

  it('has every clip the scene plays', () => {
    const clips = new Set(info.clipNames);
    for (const clip of [...Object.values(horseModels.clips), 'gallop']) expect(clips.has(clip), clip).toBe(true);
  });
});
