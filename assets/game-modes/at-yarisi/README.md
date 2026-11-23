# At Yarışı art assets

Same toy-like style and tools as the other games (see `../mahalle-halayi/README.md`): flat-shaded low-poly, vertex colours on one
shared material, no textures. The horse has a four-legged rig of its own, so it has its own script.

```bash
pnpm assets:build   # needs Blender; runs scripts/build_horse.py after the other games' scripts
pnpm test           # validates the GLB (budgets, rig, exact clips, the clips the scene plays)
```

| File | Contents | Clips |
|---|---|---|
| `horse.glb` | One race horse with its jockey: three skinned meshes on one 14-bone skeleton, about 900 triangles | `idle`, `gallop` (one stride per second at the base tempo; the scene scales its speed with the horse's speed), `gallop_boost` (stretched out, jockey low), `victory` (rears up) |

The three meshes let the scene colour a horse without textures: **`Coat`** (vertex colour white) is tinted with the horse's coat colour,
**`Silks`** (the jockey's clothes, cap and saddle cloth) with the racer's colour, and **`Details`** (skin, boots, mane, tail, eyes, hooves)
keeps its own colours. Each horse gets its own copy of the two tinted materials; every horse is three draw calls.

The course, the stands with their spectators, the skyline and its tower, the trees, the blob shadows and the boost rings are built in code
from primitives in `apps/web/src/game-modes/at-yarisi/` (the stands, crowd, skyline and trees are instanced); there is no course GLB.
The tower and skyline are original shapes, not copies of any real place.

Editable `.blend` files are saved in `source-blend/`. No AI-generated meshes or images are used.
Placeholders to review: horse proportions and the gallop clip (a quick toy-style stride, not studied from real motion), and whether the
primitive course is good enough on a real stream.
