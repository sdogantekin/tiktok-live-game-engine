"""Builds the At Yarışı race horse with its jockey: one rigged model with animation clips.

Run:  blender -b --factory-startup --python build_horse.py [-- preview]

The horse is the CC0 horse from Quaternius' "Farm Animals Animated" pack (`assets/third-party/quaternius-farm-animals/Horse.blend`): its
mesh, 28-bone rig and animations are kept as they are. This script
  - keeps four of its animations and renames them: Run -> gallop, Idle -> idle, Walk -> walk, Jump -> victory,
  - splits the mesh by material into `Coat` (the scene tints it with the horse's colour) and `Details` (mane, tail, hooves, eyes),
  - adds our own jockey on the horse's back: `Silks` (clothes, cap and saddle cloth: the scene tints it with the racer's colour)
    and `Rider` (skin and boots, fixed colours), all bound to the horse's Torso bone so the jockey moves with the gallop.
The horse faces -Y and stands with its hooves at 0, in the pack's own units (about 4 units to its back): the scene scales the whole model
by `HORSE_SCALE` (see assets.manifest.ts).
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "mahalle-halayi", "scripts"))

import bpy  # noqa: E402
import assetlib  # noqa: E402
from assetlib import MeshBuilder, args_after_dashes, export_glb, make_material, render_preview, save_blend, triangle_count, world_bounds  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
SOURCE = os.path.join(ROOT, "assets", "third-party", "quaternius-farm-animals", "Horse.blend")
MODELS_DIR = os.path.join(ROOT, "apps", "web", "public", "game-modes", "at-yarisi", "models")
assetlib.BLEND_DIR = os.path.join(ROOT, "assets", "game-modes", "at-yarisi", "source-blend")

TRIANGLE_BUDGET = 2500
HORSE_SCALE = 0.3  # the scene's scale for the model; keep in step with assets.manifest.ts
HEIGHT_RANGE = (1.7, 2.6)  # metres at HORSE_SCALE: hooves to the top of the jockey's cap

# the animations we keep, by the pack's name, and what we call them
CLIPS = {"Run": "gallop", "Idle": "idle", "Walk": "walk", "Jump": "victory"}
COAT_RGB = (0.175, 0.074, 0.047)  # a bay brown; the scene tints it per horse
DETAIL_RGB = (0.03, 0.025, 0.025)
SILKS = "#ffffff"
SKIN = "#e8bd98"
BOOTS = "#3b2a20"


def plain_material(name, rgb, roughness=0.85):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    return material


def split_horse(horse):
    """Separates the horse mesh by material: returns (coat, details) objects, with simple materials of our own."""
    bpy.ops.object.select_all(action="DESELECT")
    horse.select_set(True)
    bpy.context.view_layer.objects.active = horse
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    pieces = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Horse")]
    by_tris = sorted(pieces, key=triangle_count, reverse=True)  # the coat is the bigger part
    coat, details = by_tris[0], by_tris[1]
    for obj, name, material in ((coat, "Coat", plain_material("CoatMat", COAT_RGB)), (details, "Details", plain_material("DetailsMat", DETAIL_RGB))):
        obj.name = name
        obj.data.name = name
        obj.data.materials.clear()
        obj.data.materials.append(material)
    return coat, details


def build_jockey(bone_names):
    """The jockey, in the pack's units, sitting on the horse's back (the back line is at z of about 4) and leaning over its neck."""
    silks = MeshBuilder("Silks", bone_names)
    rider = MeshBuilder("Rider", bone_names)
    bone = "Torso"
    silks.box((0, 0.4, 4.2), (2.6, 3.0, 0.2), SILKS, bone)  # a big saddle cloth: the racer's colour, seen from above
    silks.limb((0, 0.7, 4.4), (0, -0.45, 6.0), 0.95, 0.8, SILKS, bone, segments=8)  # torso, leaning forward over the withers
    for side in (-1, 1):
        silks.limb((0.85 * side, -0.35, 5.7), (0.62 * side, -1.8, 4.95), 0.32, 0.27, SILKS, bone, segments=5)  # arms down to the reins
    silks.sphere((0, -0.62, 6.78), 0.52, SILKS, bone, segments=8, rings=4, scale=(1, 1.1, 0.72))  # cap
    rider.sphere((0, -0.58, 6.5), 0.5, SKIN, bone, segments=8, rings=5)  # head
    for side in (-1, 1):
        rider.sphere((0.62 * side, -1.8, 4.95), 0.27, SKIN, bone, segments=4, rings=3)  # hands
        rider.limb((0.85 * side, 0.55, 4.5), (1.25 * side, 0.15, 3.15), 0.42, 0.34, BOOTS, bone, segments=5)  # legs and boots
    return [silks, rider]


def build(preview=False):
    bpy.ops.wm.open_mainfile(filepath=SOURCE)
    arm = bpy.data.objects["Armature"]
    horse = bpy.data.objects["Horse"]
    bone_names = [b.name for b in arm.data.bones]

    coat, details = split_horse(horse)
    toy = make_material("Toy")
    jockey = []
    for builder in build_jockey(bone_names):
        obj = builder.build_object(material=toy)
        obj.parent = arm
        modifier = obj.modifiers.new("Armature", "ARMATURE")
        modifier.object = arm
        jockey.append(obj)

    # keep four animations, renamed, as NLA tracks (the exporter's mode here); the rest of the pack's animations go
    arm.animation_data_create()
    for action in list(bpy.data.actions):
        if action.name not in CLIPS:
            bpy.data.actions.remove(action)
    arm.animation_data.action = None
    for track in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(track)
    for old, new in CLIPS.items():
        action = bpy.data.actions[old]
        action.name = new
        track = arm.animation_data.nla_tracks.new()
        track.name = new
        strip = track.strips.new(new, int(action.frame_range[0]), action)
        strip.name = new
        if hasattr(strip, "action_slot") and len(action.slots) > 0:
            strip.action_slot = action.slots[0]

    objects = [coat, details, *jockey]
    tris = sum(triangle_count(o) for o in objects)
    low, high = world_bounds(objects)
    height = (high.z - low.z) * HORSE_SCALE
    problems = []
    if tris > TRIANGLE_BUDGET:
        problems.append(f"{tris} triangles exceeds budget {TRIANGLE_BUDGET}")
    if not (HEIGHT_RANGE[0] <= height <= HEIGHT_RANGE[1]):
        problems.append(f"height {height:.2f} m at scale {HORSE_SCALE} outside {HEIGHT_RANGE}")
    if abs(low.z) > 0.05:
        problems.append(f"hooves at z={low.z:.3f}, expected 0")
    if problems:
        raise SystemExit("[horse] " + "; ".join(problems))

    path = os.path.join(MODELS_DIR, "horse.glb")
    os.makedirs(MODELS_DIR, exist_ok=True)
    size = export_glb([arm, *objects], path, animations=True)
    print(f"[horse] {tris} tris, height {height:.2f} m at scale {HORSE_SCALE}, {len(arm.data.bones)} bones, {len(CLIPS)} clips, {size / 1024:.1f} KB -> {path}")
    save_blend("horse.blend")

    if preview:
        previews = os.environ.get("PREVIEW_DIR", "/tmp")
        render_preview(os.path.join(previews, "horse_rest_side.png"), (16, 0, 4.5), (0, 0, 3.6), ortho_scale=11, resolution=(640, 420))
        for clip in CLIPS.values():
            action = bpy.data.actions[clip]
            frames = sorted({int(action.frame_range[0]), int(action.frame_range[0] + (action.frame_range[1] - action.frame_range[0]) * 0.33), int(action.frame_range[0] + (action.frame_range[1] - action.frame_range[0]) * 0.66)})
            for frame in frames:
                for track in arm.animation_data.nla_tracks:
                    track.mute = track.name != clip
                render_preview(os.path.join(previews, f"horse_{clip}_{frame}.png"), (16, 0, 4.5), (0, 0, 3.6), ortho_scale=11, resolution=(480, 320), frame=frame)


if __name__ == "__main__":
    build(preview="preview" in args_after_dashes())
