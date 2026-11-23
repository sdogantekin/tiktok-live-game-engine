# Takı Takma Töreni art assets

Same toy-like style, rig and pipeline as Mahalle Halayı (see `../mahalle-halayi/README.md`): flat-shaded low-poly,
vertex colours on one shared material, 12-bone rig, no textures. One script builds everything:

```bash
pnpm assets:build   # needs Blender; runs scripts/build_taki_characters.py after the Halay scripts
pnpm test           # validates the GLBs (budgets, rig, exact clip lists, clips the scene uses)
```

`scripts/build_taki_characters.py` reuses the character builder from the Halay folder, adds this game's looks and clips,
and writes to `apps/web/public/game-modes/taki-takma/models/`. Editable `.blend` files are saved in `source-blend/`.

| File | Contents | Clips |
|---|---|---|
| `character_guest_gelin.glb`, `character_guest_damat.glb` | The guests of each side (veil / fez) | `idle`, `walk`, `pin`, `clap`, `jump` |
| `character_couple_bride.glb`, `character_couple_groom.glb` | The couple on the podium | `idle`, `receive`, `thank`, `clap` |
| `character_anne_gelin.glb`, `character_baba_gelin.glb`, `character_anne_damat.glb`, `character_baba_damat.glb` | The parents: mothers in a headscarf, fathers in a flat cap with grey hair and a moustache | `idle`, `clap`, `wipe_tears`, `cheer` |

The hall (parquet, carpet, podium, curtains, lamps, the two gold meters), the gold pieces guests carry, and the takı shower
are built in code from primitives in `apps/web/src/game-modes/taki-takma/`; there is no hall GLB.

No AI-generated meshes or images are used. Placeholders to review: character proportions of the parents, and a modelled hall
if the primitive one is not good enough on a real stream.
