"""Builds the At Yarışı race horse with its jockey: one rigged model with animation clips.

Run:  blender -b --factory-startup --python build_horse.py [-- preview]

The horse is the CC0 horse from Quaternius' "Farm Animals Animated" pack (`assets/third-party/quaternius-farm-animals/Horse.blend`): its
mesh, 28-bone rig and animations are kept as they are. This script
  - keeps four of its animations and renames them: Run -> gallop, Idle -> idle, Walk -> walk, Jump -> victory,
  - splits the mesh by material into `Coat` (the scene tints it with the horse's colour) and the dark details (mane, tail, hooves, eyes),
  - adds our own jockey and tack on the horse: `Silks` (clothes, cap, saddle cloth and blinkers: the scene tints it with the racer's colour)
    and `Rider` (everything with a fixed colour: skin, boots, saddle, bridle and, merged in, the horse's own dark details), the jockey bound
    to the horse's Torso bone so he moves with the gallop. Three meshes in all: three draw calls a horse.
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
DETAIL_HEX = "#1c1513"  # the horse's mane, tail, hooves and eyes
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
    """The jockey and the tack, in the pack's units (the horse's back line is at z of about 4), crouched over its neck.

    Two meshes: `Silks` is tinted with the racer's colour (jacket, sleeves, helmet cover, saddle cloth; the sleeves are a shade darker so the
    jacket and sleeves read as two tones) and `Rider` has fixed colours (skin, hoops on the jacket, breeches, boots, helmet band and peak,
    goggles, saddle, stirrups, bridle, reins, whip)."""
    silks = MeshBuilder("Silks", bone_names)
    rider = MeshBuilder("Rider", bone_names)
    bone = "Torso"
    leather = "#6b3f1f"
    dark = "#241a17"

    # the saddle and cloth under him
    silks.box((0, 0.4, 4.2), (2.7, 3.2, 0.2), SILKS, bone)  # a big saddle cloth: the racer's colour, seen from above
    rider.box((0, 0.35, 4.42), (1.5, 2.0, 0.26), leather, bone)  # the saddle
    rider.box((0, -0.55, 4.55), (1.2, 0.35, 0.3), leather, bone)  # its pommel

    # body: jacket (tinted) with two white hoops, leaning forward over the withers
    silks.limb((0, 0.7, 4.45), (0, -0.45, 6.0), 0.95, 0.8, SILKS, bone, segments=8)
    for t in (0.35, 0.65):
        x0, y0, z0 = 0.0, 0.7 - 1.15 * t, 4.45 + 1.55 * t
        rider.limb((x0, y0 + 0.12, z0 - 0.08), (x0, y0 - 0.12, z0 + 0.08), 0.99 - 0.15 * t, 0.99 - 0.15 * t, "#ffffff", bone, segments=8)
    # arms: bent at the elbow, hands low on the reins (a shade darker than the jacket)
    for side in (-1, 1):
        silks.limb((0.85 * side, -0.35, 5.72), (1.0 * side, -1.05, 5.2), 0.34, 0.3, "#d8d8d8", bone, segments=5)
        silks.limb((1.0 * side, -1.05, 5.2), (0.62 * side, -1.85, 4.95), 0.3, 0.26, "#d8d8d8", bone, segments=5)
        rider.sphere((0.62 * side, -1.85, 4.95), 0.28, "#f4f4f4", bone, segments=5, rings=3)  # gloves
    # head: face, helmet cover in the silks, a white band, a dark peak and goggles
    rider.sphere((0, -0.6, 6.48), 0.5, SKIN, bone, segments=8, rings=5)
    silks.sphere((0, -0.6, 6.78), 0.56, SILKS, bone, segments=8, rings=4, scale=(1, 1.12, 0.78))
    rider.limb((0, -0.6, 6.55), (0, -0.6, 6.68), 0.58, 0.58, "#ffffff", bone, segments=8)  # helmet band
    rider.box((0, -1.12, 6.6), (0.8, 0.55, 0.09), dark, bone)  # peak
    rider.box((0, -1.02, 6.4), (0.84, 0.16, 0.26), "#7fc4e8", bone)  # goggles
    rider.limb((0, -0.4, 5.92), (0, -0.5, 6.08), 0.66, 0.66, "#ffffff", bone, segments=8)  # a white collar
    for side in (-1, 1):
        rider.limb((0.7 * side, -1.62, 4.98), (0.62 * side, -1.8, 4.95), 0.34, 0.34, "#ffffff", bone, segments=5)  # white cuffs
    # blinkers on the horse, in the racer's colours
    for side in (-1, 1):
        silks.box((0.58 * side, -3.95, 6.05), (0.2, 0.55, 0.55), SILKS, "Head")
    # legs: white breeches, black boots, stirrups on leathers
    for side in (-1, 1):
        rider.limb((0.6 * side, 0.55, 4.55), (1.05 * side, 0.15, 3.75), 0.46, 0.4, "#f4f4f4", bone, segments=5)
        rider.limb((1.05 * side, 0.15, 3.75), (1.18 * side, 0.05, 3.05), 0.4, 0.34, dark, bone, segments=5)
        rider.limb((0.95 * side, 0.35, 4.35), (1.22 * side, 0.1, 3.0), 0.05, 0.05, leather, bone, segments=3)  # stirrup leather
        rider.box((1.22 * side, 0.1, 2.95), (0.45, 0.4, 0.07), "#b9bcc2", bone)  # stirrup iron
    # whip in the right hand, reins to the bit, cheek straps on the bridle
    rider.limb((0.62, -1.85, 4.95), (0.45, -3.2, 5.8), 0.06, 0.04, dark, bone, segments=3)
    for side in (-1, 1):
        rider.limb((0.62 * side, -1.85, 4.95), (0.38 * side, -4.5, 5.45), 0.04, 0.04, dark, "Neck", segments=3)  # reins
        rider.limb((0.46 * side, -3.7, 6.0), (0.38 * side, -4.6, 5.4), 0.07, 0.07, leather, "Head", segments=3)  # cheek strap
    rider.limb((-0.4, -4.55, 5.42), (0.4, -4.55, 5.42), 0.09, 0.09, leather, "Head", segments=4)  # noseband
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

    # one mesh for everything with a fixed colour: the horse's dark details get a vertex colour and join the rider and tack
    layer = details.data.color_attributes.get("Col") or details.data.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    dark = assetlib.srgb(DETAIL_HEX)
    for item in layer.data:
        item.color = dark
    details.data.color_attributes.active_color = layer
    details.data.materials.clear()
    details.data.materials.append(toy)
    rider = next(o for o in jockey if o.name.startswith("Rider"))
    bpy.ops.object.select_all(action="DESELECT")
    details.select_set(True)
    rider.select_set(True)
    bpy.context.view_layer.objects.active = rider
    bpy.ops.object.join()
    rider.name = "Rider"
    rider.data.name = "Rider"
    jockey = [o for o in jockey if o.name != "Rider" and o.name.startswith("Silks")] + [rider]
    objects = [coat, *jockey]
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
