"""Builds the At Yarışı race horse with its jockey: one rigged, toy-like model with animation clips.

Run:  blender -b --factory-startup --python build_horse.py [-- preview]

Same style and tools as the Mahalle Halayı characters (flat shading, vertex colours, one shared material, no textures), but
a four-legged rig, so it has its own bones. The horse faces -Y in Blender (+Z in glTF) and stands with its hooves at 0.
Three meshes share one skeleton, so the runtime can colour them separately without textures:
  Coat     the horse (vertex colour white: the runtime tints it with the coat colour)
  Silks    the jockey's clothes, cap and saddle cloth (white: tinted with the racer's colour)
  Details  everything with a fixed colour: skin, boots, mane, tail, eyes, hooves
Clips are authored for a base tempo of 120 BPM at 24 fps (one beat is 12 frames):
  idle           standing, breathing, a swishing tail (loops, 2 s)
  gallop         the running stride, one stride per 24 frames (loops); the runtime scales its speed with the horse's speed
  gallop_boost   the same stride, stretched out with the jockey low (loops)
  victory        rears up and comes down (plays once)
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "mahalle-halayi", "scripts"))

import bpy  # noqa: E402
import assetlib  # noqa: E402
from assetlib import MeshBuilder, args_after_dashes, export_glb, make_material, render_preview, reset_scene, save_blend, triangle_count, world_bounds  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
MODELS_DIR = os.path.join(ROOT, "apps", "web", "public", "game-modes", "at-yarisi", "models")
assetlib.BLEND_DIR = os.path.join(ROOT, "assets", "game-modes", "at-yarisi", "source-blend")

TRIANGLE_BUDGET = 2500
HEIGHT_RANGE = (1.9, 2.6)  # hooves to the top of the jockey's cap

WHITE = "#ffffff"
DARK = "#2a1d18"
MANE = "#1c1420"
SKIN = "#e8bd98"
BOOTS = "#3b2a20"
EYES = "#0f0a12"

LEGS = {"FL": (0.2, -0.5), "FR": (-0.2, -0.5), "BL": (0.2, 0.55), "BR": (-0.2, 0.55)}

# name, parent, head, tail. The horse faces -Y; the left side is +X.
BONES = [
    ("Root", None, (0, 0, 0), (0, 0, 0.15)),
    ("Body", "Root", (0, 0.7, 1.15), (0, -0.7, 1.15)),
    ("Neck", "Body", (0, -0.55, 1.3), (0, -0.95, 1.75)),
    ("Head", "Neck", (0, -0.95, 1.75), (0, -1.42, 1.55)),
    ("Tail", "Body", (0, 0.85, 1.3), (0, 1.2, 0.8)),
    ("Rider", "Body", (0, 0.05, 1.5), (0, -0.1, 1.98)),
]
for _leg, (_x, _y) in LEGS.items():
    BONES.append((f"UpperLeg.{_leg}", "Body", (_x, _y, 1.05), (_x, _y, 0.55)))
    BONES.append((f"LowerLeg.{_leg}", f"UpperLeg.{_leg}", (_x, _y, 0.55), (_x, _y, 0.08)))
BONE_NAMES = [b[0] for b in BONES]


def build_meshes():
    """The three meshes. Every part is bound rigidly to one bone."""
    coat = MeshBuilder("Coat", BONE_NAMES)
    silks = MeshBuilder("Silks", BONE_NAMES)
    details = MeshBuilder("Details", BONE_NAMES)

    # the horse: a chunky barrel body, a neck and a head with a long muzzle
    coat.sphere((0, 0.05, 1.15), 0.45, WHITE, "Body", segments=10, rings=6, scale=(0.85, 1.5, 0.9))
    coat.sphere((0, -0.5, 1.2), 0.34, WHITE, "Body", segments=8, rings=5)  # chest
    coat.sphere((0, 0.55, 1.18), 0.36, WHITE, "Body", segments=8, rings=5)  # rump
    coat.limb((0, -0.55, 1.3), (0, -0.95, 1.78), 0.21, 0.14, WHITE, "Neck", segments=8)
    coat.limb((0, -0.98, 1.8), (0, -1.38, 1.58), 0.15, 0.1, WHITE, "Head", segments=8)  # head and muzzle
    for side in (-1, 1):
        coat.limb((0.07 * side, -1.0, 1.9), (0.09 * side, -1.02, 2.08), 0.05, 0.02, WHITE, "Head", segments=4)  # ears
    for leg, (x, y) in LEGS.items():
        coat.limb((x, y, 1.05), (x, y, 0.55), 0.115, 0.085, WHITE, f"UpperLeg.{leg}")
        coat.limb((x, y, 0.55), (x, y, 0.1), 0.08, 0.065, WHITE, f"LowerLeg.{leg}")
        details.box((x, y, 0.045), (0.14, 0.2, 0.09), DARK, f"LowerLeg.{leg}")  # hooves

    # fixed-colour details of the horse: mane along the neck, a long tail, eyes
    for i in range(5):
        t = i / 4
        details.sphere((0, -0.58 - 0.38 * t + 0.1, 1.38 + 0.4 * t + 0.1), 0.085, MANE, "Neck", segments=5, rings=3)
    details.limb((0, 0.85, 1.32), (0, 1.25, 0.72), 0.1, 0.045, MANE, "Tail", segments=6)
    for side in (-1, 1):
        details.sphere((0.11 * side, -1.1, 1.78), 0.035, EYES, "Head", segments=4, rings=3)

    # the jockey: crouched forward over the neck, hands on the reins, in the racer's silks and cap
    silks.box((0, 0.05, 1.53), (0.72, 0.95, 0.05), WHITE, "Body")  # a big saddle cloth: the racer's colour, seen from above
    silks.limb((0, 0.05, 1.55), (0, -0.14, 1.97), 0.21, 0.18, WHITE, "Rider", segments=8)  # torso
    for side in (-1, 1):
        silks.limb((0.19 * side, -0.1, 1.92), (0.15 * side, -0.52, 1.74), 0.07, 0.06, WHITE, "Rider", segments=5)  # arms
    silks.sphere((0, -0.2, 2.17), 0.16, WHITE, "Rider", segments=8, rings=4, scale=(1, 1.1, 0.75))  # cap
    details.sphere((0, -0.2, 2.08), 0.135, SKIN, "Rider", segments=8, rings=5)  # head
    for side in (-1, 1):
        details.sphere((0.15 * side, -0.52, 1.74), 0.06, SKIN, "Rider", segments=4, rings=3)  # hands
        details.limb((0.2 * side, 0.0, 1.58), (0.26 * side, -0.05, 1.28), 0.09, 0.07, BOOTS, "Rider", segments=5)  # legs and boots

    return [coat, silks, details]


# ---------------------------------------------------------------------------------------------
# Animation. A pose is {bone: (rx, ry, rz) or (rx, ry, rz, sideways, forward, up)} in degrees and metres; only Root moves.
# For a bone that points up or down, +rx swings its tip backwards (a leg) or leans it forward (the jockey); for the neck,
# +rx lowers the head forward. Keys are generated from the stride phase, so all the clips stay in step.
# ---------------------------------------------------------------------------------------------

TAU = 2 * math.pi
LEG_PHASE = {"FL": 0.0, "FR": 0.08, "BL": 0.5, "BR": 0.58}


def stride_pose(phase, stretch=1.0, crouch=0.0):
    """The gallop at `phase` (0..1 over one stride). `stretch` widens the stride, `crouch` lowers the jockey (degrees)."""
    pose = {}
    for leg, offset in LEG_PHASE.items():
        x = phase - offset
        front = leg[0] == "F"
        swing = (40 if front else 34) * stretch
        pose[f"UpperLeg.{leg}"] = (-swing * math.cos(TAU * x) + (6 if front else 10), 0, 0)
        # the knee folds while the leg comes forward again
        pose[f"LowerLeg.{leg}"] = (70 * stretch * max(0.0, -math.sin(TAU * x)) + 8, 0, 0)
    bob = 0.1 * stretch * (1 + math.cos(TAU * 2 * (phase - 0.1))) / 2
    pose["Root"] = (0, 0, 0, 0, 0, bob)
    # Body, Neck and Head point towards -Y, so their local X axis is mirrored: for them +rx raises the front.
    pose["Body"] = (-6 * stretch * math.sin(TAU * phase), 0, 0)
    pose["Neck"] = (-10 - 8 * stretch * math.sin(TAU * (phase - 0.2)) - 6 * crouch / 20, 0, 0)  # stretched forward and low
    pose["Head"] = (6 * math.sin(TAU * (phase - 0.3)), 0, 0)
    pose["Tail"] = (18 + 16 * math.sin(TAU * (phase - 0.3)), 0, 0)
    pose["Rider"] = (18 + crouch + 4 * math.sin(TAU * phase), 0, 0)
    return pose


def keys_for(frames, pose_at, last=None):
    """Key a pose at each frame; if `last` is given the final key repeats the first so the clip loops cleanly."""
    keys = [(frame, pose_at(frame)) for frame in frames]
    if last is not None:
        keys[-1] = (frames[-1], keys[0][1])
    return keys


CLIPS = {}
# one stride is 24 frames (keys every 3 frames), looping
_stride_frames = list(range(1, 26, 3))
CLIPS["gallop"] = keys_for(_stride_frames, lambda f: stride_pose((f - 1) / 24), last=True)
CLIPS["gallop_boost"] = keys_for(_stride_frames, lambda f: stride_pose((f - 1) / 24, stretch=1.3, crouch=14), last=True)

# standing: slow breathing, a nodding head and a swishing tail (48 frames, loops)
CLIPS["idle"] = keys_for(
    list(range(1, 50, 6)),
    lambda f: {
        "Body": (-1.5 * math.sin(TAU * (f - 1) / 48), 0, 0),
        "Neck": (4 - 3 * math.sin(TAU * ((f - 1) / 48 - 0.2)), 0, 0),
        "Head": (-4 * math.sin(TAU * ((f - 1) / 48 - 0.4)), 0, 0),
        "Tail": (8 + 10 * math.sin(TAU * ((f - 1) / 48 - 0.25)), 0, 0),
        "Rider": (8 + 1.5 * math.sin(TAU * (f - 1) / 48), 0, 0),
        **{f"UpperLeg.{leg}": (4 if leg[0] == "B" else 0, 0, 0) for leg in LEGS},
    },
    last=True,
)

# victory: the horse rears up, holds it, and comes back down (36 frames, plays once)
_rest = CLIPS["idle"][0][1]
_rear = {
    "Root": (0, 0, 0, 0, 0.12, 0.15),
    "Body": (38, 0, 0),
    "Neck": (8, 0, 0),
    "Head": (-10, 0, 0),
    "Tail": (30, 0, 0),
    "Rider": (-8, 0, 0),
    **{f"UpperLeg.F{s}": (-75, 0, 0) for s in "LR"},
    **{f"LowerLeg.F{s}": (95, 0, 0) for s in "LR"},
    **{f"UpperLeg.B{s}": (14, 0, 0) for s in "LR"},
}
CLIPS["victory"] = [(1, _rest), (10, _rear), (22, _rear), (34, _rest), (37, _rest)]

CLIP_NAMES = ["idle", "gallop", "gallop_boost", "victory"]


def make_armature():
    data = bpy.data.armatures.new("Armature")
    arm = bpy.data.objects.new("Armature", data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, parent, head, tail in BONES:
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def build_actions(arm):
    arm.animation_data_create()
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
    for name in CLIP_NAMES:
        keys = CLIPS[name]
        action = bpy.data.actions.new(name)
        arm.animation_data.action = action
        for frame, pose in keys:
            for pb in arm.pose.bones:
                values = pose.get(pb.name, (0, 0, 0))
                x, forward, up = values[3:6] if len(values) == 6 else (0, 0, 0)
                pb.rotation_euler = [math.radians(a) for a in values[:3]]
                pb.location = (x, up, forward)  # Root points up: its local axes are (sideways, up, forward)
                pb.keyframe_insert("rotation_euler", frame=frame)
                pb.keyframe_insert("location", frame=frame)
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, keys[0][0], action)
        strip.name = name
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)


def build(preview=False):
    reset_scene()
    material = make_material("Toy")
    arm = make_armature()
    objects = []
    for builder in build_meshes():
        obj = builder.build_object(material=material)
        obj.parent = arm
        modifier = obj.modifiers.new("Armature", "ARMATURE")
        modifier.object = arm
        objects.append(obj)
    build_actions(arm)

    tris = sum(triangle_count(o) for o in objects)
    low, high = world_bounds(objects)
    height = high.z - low.z
    problems = []
    if tris > TRIANGLE_BUDGET:
        problems.append(f"{tris} triangles exceeds budget {TRIANGLE_BUDGET}")
    if not (HEIGHT_RANGE[0] <= height <= HEIGHT_RANGE[1]):
        problems.append(f"height {height:.2f} m outside {HEIGHT_RANGE}")
    if abs(low.z) > 0.005:
        problems.append(f"hooves at z={low.z:.3f}, expected 0")
    if problems:
        raise SystemExit("[horse] " + "; ".join(problems))

    path = os.path.join(MODELS_DIR, "horse.glb")
    os.makedirs(MODELS_DIR, exist_ok=True)
    size = export_glb([arm, *objects], path, animations=True)
    print(f"[horse] {tris} tris, height {height:.2f} m, {len(arm.data.bones)} bones, {len(CLIP_NAMES)} clips, {size / 1024:.1f} KB -> {path}")
    save_blend("horse.blend")

    if preview:
        previews = os.environ.get("PREVIEW_DIR", "/tmp")
        render_preview(os.path.join(previews, "horse_rest_side.png"), (6, 0, 1.3), (0, 0, 1.2), ortho_scale=3.6, resolution=(640, 420))
        arm.animation_data.action = None
        for clip in CLIP_NAMES:
            keys = CLIPS[clip]
            for frame in sorted({keys[0][0], keys[len(keys) // 3][0], keys[2 * len(keys) // 3][0]}):
                for track in arm.animation_data.nla_tracks:
                    track.mute = track.name != clip
                render_preview(os.path.join(previews, f"horse_{clip}_{frame}.png"), (6, 0, 1.3), (0, 0, 1.2), ortho_scale=3.6, resolution=(480, 320), frame=frame)


if __name__ == "__main__":
    build(preview="preview" in args_after_dashes())
