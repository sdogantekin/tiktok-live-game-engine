import { describe, expect, it } from 'vitest';
import { readGlb } from '../mahalle-halayi/glb-info';
import { BUDGETS, CHARACTER_BONES, CHARACTER_CLIPS, MODEL_URLS } from './assets.manifest';
import { figures, GUEST_VARIANTS, guestModels } from './scene-config';

const file = (url: string) => new URL(`../../../public${url}`, import.meta.url);

describe('Takı Takma Töreni character models', () => {
  for (const [look, url] of Object.entries(MODEL_URLS.characters) as [keyof typeof CHARACTER_CLIPS, string][]) {
    describe(look, () => {
      const info = readGlb(file(url));

      it('is one skinned, vertex-coloured mesh within the triangle budget', () => {
        expect(info.meshNames).toHaveLength(1);
        expect(info.primitivesPerMesh[info.meshNames[0]!]).toBe(1);
        expect(info.withVertexColors).toBe(true);
        expect(info.triangles).toBeLessThanOrEqual(BUDGETS.characterTriangles);
        expect(info.images + info.textures).toBe(0);
      });

      it('has the 12-bone rig and exactly the agreed clips, of sensible length', () => {
        expect(info.jointCount).toBe(CHARACTER_BONES);
        expect([...info.clipNames].sort()).toEqual([...CHARACTER_CLIPS[look]].sort());
        for (const [clip, seconds] of Object.entries(info.clipSeconds)) {
          expect(seconds, clip).toBeGreaterThan(0.3);
          expect(seconds, clip).toBeLessThan(2.5);
        }
      });
    });
  }

  it('shares one rig across the looks', () => {
    const [first, ...rest] = Object.values(MODEL_URLS.characters).map((url) => readGlb(file(url)).nodeNames.filter((n) => !n.startsWith('Character')).sort());
    for (const other of rest) expect(other).toEqual(first);
  });
});

describe('scene config uses clips that exist', () => {
  const clipsOf = (url: string) => new Set(readGlb(file(url)).clipNames);

  it('guests: every clip the scene plays is in every guest model, women and men', () => {
    for (const url of Object.values(GUEST_VARIANTS).flat()) {
      const clips = clipsOf(url);
      for (const clip of [...Object.values(guestModels.clips), 'walk']) expect(clips.has(clip), clip).toBe(true);
    }
  });

  it('couple and parents: every reaction clip is in their model', () => {
    for (const figure of figures) {
      const clips = clipsOf(figure.url);
      for (const clip of Object.values(figure.models.clips)) expect(clips.has(clip), `${figure.id} ${clip}`).toBe(true);
    }
  });
});
