import { describe, expect, it } from 'vitest';
import { BUDGETS, CHARACTER_BONES, CHARACTER_CLIPS, COURTYARD_PIECES, CROWD_NODES, MODEL_URLS } from './assets.manifest';
import { readGlb } from './glb-info';
import { avatarModels, bandModels, courtyardLayout } from './scene-config';

const file = (url: string) => new URL(`../../../public${url}`, import.meta.url);

describe('character models', () => {
  for (const [look, url] of Object.entries(MODEL_URLS.characters)) {
    describe(look, () => {
      const info = readGlb(file(url));

      it('is one skinned, vertex-coloured mesh within the triangle budget', () => {
        expect(info.meshNames).toHaveLength(1);
        expect(info.primitivesPerMesh[info.meshNames[0]!]).toBe(1); // one draw call per avatar
        expect(info.withVertexColors).toBe(true);
        expect(info.triangles).toBeLessThanOrEqual(BUDGETS.characterTriangles);
        expect(info.images + info.textures).toBe(0);
      });

      it('has the 12-bone rig and exactly the agreed clips', () => {
        expect(info.jointCount).toBe(CHARACTER_BONES);
        expect([...info.clipNames].sort()).toEqual([...CHARACTER_CLIPS].sort());
      });

      it('has sensible clip lengths', () => {
        for (const [clip, seconds] of Object.entries(info.clipSeconds)) {
          expect(seconds, clip).toBeGreaterThan(0.3);
          expect(seconds, clip).toBeLessThan(2.5);
        }
      });
    });
  }

  it('shares one rig across the look variants', () => {
    const [first, ...rest] = Object.values(MODEL_URLS.characters).map((url) => readGlb(file(url)).nodeNames.filter((n) => !n.startsWith('Character')).sort());
    for (const other of rest) expect(other).toEqual(first);
  });
});

describe('crowd model', () => {
  const info = readGlb(file(MODEL_URLS.crowd));

  it('has the body and head meshes within budget', () => {
    for (const name of CROWD_NODES) expect(info.meshNames).toContain(name);
    expect(info.triangles).toBeLessThanOrEqual(BUDGETS.crowdTriangles);
    expect(info.withVertexColors).toBe(true);
    expect(info.images + info.textures).toBe(0);
  });
});

describe('courtyard kit', () => {
  const info = readGlb(file(MODEL_URLS.courtyard));

  it('contains every named piece, one draw call each, within the triangle budget', () => {
    for (const piece of COURTYARD_PIECES) {
      expect(info.meshNames, piece).toContain(piece);
      expect(info.primitivesPerMesh[piece], piece).toBe(1);
    }
    expect(info.triangles).toBeLessThanOrEqual(BUDGETS.courtyardTriangles);
    expect(info.withVertexColors).toBe(true);
    expect(info.images + info.textures).toBe(0);
  });
});

describe('asset set', () => {
  it('stays within the total download budget', () => {
    const urls = [...Object.values(MODEL_URLS.characters), MODEL_URLS.crowd, MODEL_URLS.courtyard];
    const total = urls.reduce((sum, url) => sum + readGlb(file(url)).bytes, 0);
    expect(total).toBeLessThanOrEqual(BUDGETS.totalBytes);
  });

  it('is referenced consistently by the scene configuration', () => {
    const pieces = new Set<string>(COURTYARD_PIECES);
    for (const placed of courtyardLayout) expect(pieces.has(placed.piece), placed.piece).toBe(true);

    const clips = new Set<string>(CHARACTER_CLIPS);
    for (const models of [avatarModels, bandModels]) {
      for (const [kind, clip] of Object.entries(models.clips)) expect(clips.has(clip), `${kind} -> ${clip}`).toBe(true);
      for (const clip of models.looping) expect(clips.has(clip), clip).toBe(true);
    }
  });
});
