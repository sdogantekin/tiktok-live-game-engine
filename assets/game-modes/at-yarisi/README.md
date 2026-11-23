# At Yarışı art assets

Same toy-like style and tools as the other games (see `../mahalle-halayi/README.md`): flat-shaded low-poly, vertex colours on one
shared material, no textures. The horse has a four-legged rig of its own, so it has its own script.

```bash
pnpm assets:build   # needs Blender; runs scripts/build_horse.py after the other games' scripts
pnpm test           # validates the GLB (budgets, rig, exact clips, the clips the scene plays)
```

| File | Contents | Clips |
|---|---|---|
| `horse.glb` | The **CC0 horse from Quaternius' Farm Animals Animated pack** (its 28-bone rig and animations) with **our own jockey** on its back: four skinned meshes, about 940 triangles | `gallop` (the pack's Run, about 0.8 s a stride at the base tempo; the scene scales its speed with the horse's speed), `idle`, `walk`, `victory` (the pack's Jump) |
| `models/scenery/*.glb` | 17 trees, bushes, flowers, grass tufts and stones from the **CC0 Kenney Nature Kit**, copied unchanged | none |

The four meshes of the horse let the scene colour a horse without textures: **`Coat`** is tinted with the horse's coat colour, **`Silks`** (the jockey's
clothes, cap and saddle cloth) with the racer's colour, while **`Details`** (mane, tail, hooves, eyes) and **`Rider`** (skin and boots) keep their own
colours. Each horse gets its own copies of the two tinted materials; every horse is four draw calls. The model is in the pack's own units, so the scene
scales it by `HORSE_SCALE` (0.3).

Effects (all code, no assets): hoof dust, speed streaks behind boosted horses and the winner's confetti are fixed-size particle pools drawn as three instanced meshes (`RaceEffects.tsx`, `particles.ts`); a sun shadow follows the leaders (cast by the horses' coats and the jockeys' silks only); a boosted jockey glows in his silks colour; the camera drops in close and low over the last 70 m (`camera.ts`).

Third-party sources, their licences and what we changed are in `THIRD_PARTY_NOTICES.md` and `assets/third-party/`. Rebuild the horse with `pnpm assets:build`
(it needs the vendored `Horse.blend`).

The course, the grandstands with their bouncing spectators, the finish gantry, advertising boards, lamps, hedges, the skyline and its tower, the blob
shadows and the boost rings are built in code from primitives in `apps/web/src/game-modes/at-yarisi/` (all instanced); the trees and plants are the kit models above.
The tower and skyline are original shapes, not copies of any real place.

Editable `.blend` files are saved in `source-blend/`. No AI-generated meshes or images are used.
Our jockey is built from simple shapes but detailed for the distance it is seen from: a tinted jacket with white hoops, darker sleeves, bent arms, a helmet cover with a white band, peak and goggles, white breeches, black boots, stirrups, saddle, bridle, reins and a whip. The racing surface (mown stripes, worn dirt, rails on posts, furlong poles, the starting gate and the photo-finish tower), the grandstands (tiers with painted fronts, benches, a rail, a roof, flags and varied spectators with hats, scarves, children and waving arms) are code-built and instanced.

Placeholders to review: the spectators and the jockey are still simple shapes, and whether the course reads well enough on a real stream.
