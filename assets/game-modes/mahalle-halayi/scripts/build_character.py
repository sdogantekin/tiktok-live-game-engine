"""Builds the shared toy-like character: one rigged, vertex-coloured mesh with six animation clips.

Run:  blender -b --factory-startup --python build_character.py [-- preview]

Three variants (gelin, damat, band) share the same mesh, rig, and clips; only vertex colours and the
head accessory differ, so the runtime needs one draw call per avatar and no textures. Each variant is
exported as its own GLB. The character faces -Y in Blender (+Z in glTF) and stands with its feet at 0.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402
from assetlib import (  # noqa: E402
    MODELS_DIR,
    MeshBuilder,
    args_after_dashes,
    export_glb,
    make_material,
    render_preview,
    reset_scene,
    save_blend,
    triangle_count,
    world_bounds,
)

TRIANGLE_BUDGET = 1500
HEIGHT_RANGE = (1.55, 1.9)  # includes the head accessory

SKIN = "#f1c9a5"
HAIR = "#3b2a20"
SHOES = "#2a1d18"
EYES = "#1c1420"

LOOKS = {
    "gelin": {"clothes": "#e0457b", "trousers": "#c93a6d", "skin": "#f1c9a5", "accessory": "veil"},
    "damat": {"clothes": "#2f6fdb", "trousers": "#27344f", "skin": "#e8bd98", "accessory": "fez"},
    "band": {"clothes": "#3f8f6b", "trousers": "#4a3b2c", "skin": "#e1b48d", "accessory": "cap"},
}

# name, parent, head, tail (left is +X; the character faces -Y). Chunky toy proportions: big head, short legs.
BONES = [
    ("Root", None, (0, 0, 0), (0, 0, 0.15)),
    ("Hips", "Root", (0, 0, 0.56), (0, 0, 0.66)),
    ("Spine", "Hips", (0, 0, 0.66), (0, 0, 1.0)),
    ("Head", "Spine", (0, 0, 1.0), (0, 0, 1.55)),
    ("UpperArm.L", "Spine", (0.3, 0, 0.92), (0.4, 0, 0.72)),
    ("LowerArm.L", "UpperArm.L", (0.4, 0, 0.72), (0.45, 0, 0.52)),
    ("UpperArm.R", "Spine", (-0.3, 0, 0.92), (-0.4, 0, 0.72)),
    ("LowerArm.R", "UpperArm.R", (-0.4, 0, 0.72), (-0.45, 0, 0.52)),
    ("UpperLeg.L", "Hips", (0.115, 0, 0.56), (0.115, 0, 0.32)),
    ("LowerLeg.L", "UpperLeg.L", (0.115, 0, 0.32), (0.115, 0, 0.08)),
    ("UpperLeg.R", "Hips", (-0.115, 0, 0.56), (-0.115, 0, 0.32)),
    ("LowerLeg.R", "UpperLeg.R", (-0.115, 0, 0.32), (-0.115, 0, 0.08)),
]
BONE_NAMES = [b[0] for b in BONES]


def build_mesh(look_name):
    look = LOOKS[look_name]
    m = MeshBuilder(f"Character_{look_name}", BONE_NAMES)
    clothes, trousers, skin = look["clothes"], look["trousers"], look["skin"]

    # torso and hips
    m.box((0, 0, 0.6), (0.4, 0.26, 0.16), trousers, "Hips")
    m.cylinder((0, 0, 0.82), 0.22, 0.27, 0.4, clothes, "Spine", segments=8, scale=(1, 0.8, 1))
    # head, eyes, hair
    m.sphere((0, 0, 1.22), 0.31, skin, "Head", segments=8, rings=6)
    for side in (-1, 1):
        m.sphere((0.1 * side, -0.27, 1.25), 0.04, EYES, "Head", segments=4, rings=3)
    m.sphere((0, 0.04, 1.32), 0.325, HAIR, "Head", segments=8, rings=4, scale=(1, 0.88, 0.72))
    # arms (left = +X): sleeve, forearm, hand
    for side, suffix in ((1, "L"), (-1, "R")):
        m.limb((0.3 * side, 0, 0.92), (0.4 * side, 0, 0.72), 0.09, 0.08, clothes, f"UpperArm.{suffix}")
        m.limb((0.4 * side, 0, 0.72), (0.45 * side, 0, 0.55), 0.08, 0.065, skin, f"LowerArm.{suffix}")
        m.sphere((0.455 * side, 0, 0.5), 0.08, skin, f"LowerArm.{suffix}", segments=6, rings=4)
    # legs: thigh, shin, shoe
    for side, suffix in ((1, "L"), (-1, "R")):
        m.limb((0.115 * side, 0, 0.58), (0.115 * side, 0, 0.32), 0.12, 0.1, trousers, f"UpperLeg.{suffix}")
        m.limb((0.115 * side, 0, 0.32), (0.115 * side, 0, 0.1), 0.1, 0.085, trousers, f"LowerLeg.{suffix}")
        m.box((0.115 * side, -0.05, 0.05), (0.17, 0.3, 0.1), SHOES, f"LowerLeg.{suffix}")

    accessory = look["accessory"]
    if accessory == "veil":
        m.cylinder((0, 0.02, 1.62), 0.24, 0.04, 0.34, "#ffffff", "Head", segments=8)
        m.box((0, 0.22, 1.18), (0.5, 0.05, 0.6), "#f4f0ff", "Head")
        m.sphere((0.22, -0.18, 1.5), 0.065, "#ffd35a", "Head", segments=5, rings=3)
    elif accessory == "fez":
        m.cylinder((0, 0, 1.6), 0.19, 0.23, 0.22, "#b3261e", "Head", segments=8)
        m.cylinder((0.15, -0.02, 1.64), 0.022, 0.022, 0.2, "#1c1420", "Head", segments=4, rotation=(0, 40, 0))
    elif accessory == "cap":
        m.cylinder((0, 0, 1.58), 0.22, 0.19, 0.12, "#f1e4c3", "Head", segments=8)

    return m


# ---------------------------------------------------------------------------------------------
# Animation. Each clip is a list of (frame, {bone: (rx, ry, rz) or (rx, ry, rz, lx, ly, lz)}) keys, in degrees and
# metres. Bones not mentioned at a key return to the rest pose. All clips end on their first key's pose, so
# they loop and blend cleanly into `idle`.
# ---------------------------------------------------------------------------------------------

REST = {}

CLIPS = {
    "idle": [
        (1, {}),
        (13, {"Hips": (0, 0, 0, 0, 0, -0.02), "Spine": (3, 0, 0), "Head": (-2, 0, 3), "UpperArm.L": (0, 0, -4), "UpperArm.R": (0, 0, 4)}),
        (25, {}),
        (37, {"Hips": (0, 0, 0, 0, 0, -0.02), "Spine": (3, 0, 0), "Head": (-2, 0, -3), "UpperArm.L": (0, 0, -4), "UpperArm.R": (0, 0, 4)}),
        (49, {}),
    ],
    # Shoulder-to-shoulder halay step: arms out as if holding neighbours, legs alternating.
    "halay": [
        (1, {"Hips": (0, 0, 0, 0.07, 0, 0), "UpperArm.L": (0, 0, -60), "UpperArm.R": (0, 0, 60), "LowerArm.L": (-25, 0, 0), "LowerArm.R": (-25, 0, 0), "UpperLeg.L": (30, 0, 0), "LowerLeg.L": (-35, 0, 0), "Spine": (0, 0, -6)}),
        (8, {"Hips": (0, 0, 0, 0.0, 0, 0.06), "UpperArm.L": (0, 0, -60), "UpperArm.R": (0, 0, 60), "LowerArm.L": (-25, 0, 0), "LowerArm.R": (-25, 0, 0), "Spine": (0, 0, 0)}),
        (15, {"Hips": (0, 0, 0, -0.07, 0, 0), "UpperArm.L": (0, 0, -60), "UpperArm.R": (0, 0, 60), "LowerArm.L": (-25, 0, 0), "LowerArm.R": (-25, 0, 0), "UpperLeg.R": (30, 0, 0), "LowerLeg.R": (-35, 0, 0), "Spine": (0, 0, 6)}),
        (22, {"Hips": (0, 0, 0, 0.0, 0, 0.06), "UpperArm.L": (0, 0, -60), "UpperArm.R": (0, 0, 60), "LowerArm.L": (-25, 0, 0), "LowerArm.R": (-25, 0, 0), "Spine": (0, 0, 0)}),
        (29, {"Hips": (0, 0, 0, 0.07, 0, 0), "UpperArm.L": (0, 0, -60), "UpperArm.R": (0, 0, 60), "LowerArm.L": (-25, 0, 0), "LowerArm.R": (-25, 0, 0), "UpperLeg.L": (30, 0, 0), "LowerLeg.L": (-35, 0, 0), "Spine": (0, 0, -6)}),
    ],
    "jump": [
        (1, {}),
        (4, {"Hips": (0, 0, 0, 0, 0, -0.16), "Spine": (12, 0, 0), "UpperLeg.L": (-35, 0, 0), "UpperLeg.R": (-35, 0, 0), "LowerLeg.L": (55, 0, 0), "LowerLeg.R": (55, 0, 0), "UpperArm.L": (25, 0, -10), "UpperArm.R": (25, 0, 10)}),
        (9, {"Root": (0, 0, 0, 0, 0, 0.75), "UpperArm.L": (0, 0, -150), "UpperArm.R": (0, 0, 150), "UpperLeg.L": (-12, 0, 0), "UpperLeg.R": (12, 0, 0), "LowerLeg.L": (30, 0, 0), "LowerLeg.R": (30, 0, 0)}),
        (14, {"Hips": (0, 0, 0, 0, 0, -0.1), "Spine": (8, 0, 0), "UpperLeg.L": (-25, 0, 0), "UpperLeg.R": (-25, 0, 0), "LowerLeg.L": (40, 0, 0), "LowerLeg.R": (40, 0, 0)}),
        (18, {}),
    ],
    "dance_a": [
        (1, {}),
        (7, {"Root": (0, 90, 0, 0, 0, 0.12), "UpperArm.L": (0, 0, -120), "UpperArm.R": (0, 0, 120), "Head": (0, 0, 0)}),
        (14, {"Root": (0, 180, 0, 0, 0, 0.0), "UpperArm.L": (0, 0, -150), "UpperArm.R": (0, 0, 150)}),
        (21, {"Root": (0, 270, 0, 0, 0, 0.12), "UpperArm.L": (0, 0, -120), "UpperArm.R": (0, 0, 120)}),
        (28, {"Root": (0, 360, 0), "UpperArm.L": (0, 0, -60), "UpperArm.R": (0, 0, 60)}),
        (34, {"Root": (0, 360, 0)}),
    ],
    "dance_b": [
        (1, {}),
        (5, {"Hips": (0, 0, 14, 0.06, 0, 0), "Spine": (0, 0, -10), "UpperArm.L": (0, 0, -100), "UpperArm.R": (-40, 0, 20), "Head": (0, 0, -8)}),
        (9, {}),
        (13, {"Hips": (0, 0, -14, -0.06, 0, 0), "Spine": (0, 0, 10), "UpperArm.R": (0, 0, 100), "UpperArm.L": (-40, 0, -20), "Head": (0, 0, 8)}),
        (17, {}),
        (22, {}),
    ],
    # The "rose" gift: a happy spin with a hand held up.
    "rose_special": [
        (1, {}),
        (8, {"Root": (0, 120, 0, 0, 0, 0.18), "UpperArm.R": (0, 0, 160), "LowerArm.R": (0, 0, 0), "UpperArm.L": (20, 0, -30)}),
        (16, {"Root": (0, 240, 0, 0, 0, 0.05), "UpperArm.R": (0, 0, 160), "UpperArm.L": (40, 0, -20)}),
        (24, {"Root": (0, 360, 0, 0, 0, 0.18), "UpperArm.R": (0, 0, 130), "UpperArm.L": (20, 0, -30)}),
        (30, {"Root": (0, 360, 0)}),
    ],
}


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
    for name, keys in CLIPS.items():
        action = bpy.data.actions.new(name)
        arm.animation_data.action = action
        for frame, pose in keys:
            for pb in arm.pose.bones:
                values = pose.get(pb.name, (0, 0, 0))
                rot = values[:3]
                # Clip locations are (sideways, forward, up) in metres. The vertical bones point along +Z, so their
                # local axes are (X, Y = up, Z = forward) and rotation about local Y is a twist (yaw).
                x, forward, up = values[3:6] if len(values) == 6 else (0, 0, 0)
                pb.rotation_euler = [math.radians(a) for a in rot]
                pb.location = (x, up, forward)
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


def build_variant(look_name, preview=False, save=False):
    reset_scene()
    material = make_material("Toy")
    arm = make_armature()
    obj = build_mesh(look_name).build_object(material=material)
    obj.parent = arm
    modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = arm
    build_actions(arm)

    # Validation: budgets, scale, and origin (feet on the ground).
    tris = triangle_count(obj)
    low, high = world_bounds([obj])
    height = high.z - low.z
    problems = []
    if tris > TRIANGLE_BUDGET:
        problems.append(f"{tris} triangles exceeds budget {TRIANGLE_BUDGET}")
    if not (HEIGHT_RANGE[0] <= height <= HEIGHT_RANGE[1]):
        problems.append(f"height {height:.2f} m outside {HEIGHT_RANGE}")
    if abs(low.z) > 0.005:
        problems.append(f"feet at z={low.z:.3f}, expected 0")
    if len(arm.data.bones) != 12:
        problems.append(f"{len(arm.data.bones)} bones, expected 12")
    if problems:
        raise SystemExit(f"[character:{look_name}] " + "; ".join(problems))

    path = os.path.join(MODELS_DIR, f"character_{look_name}.glb")
    os.makedirs(MODELS_DIR, exist_ok=True)
    size = export_glb([arm, obj], path, animations=True)
    print(f"[character:{look_name}] {tris} tris, height {height:.2f} m, {len(arm.data.bones)} bones, {len(CLIPS)} clips, {size / 1024:.1f} KB -> {path}")

    if save:
        save_blend("character.blend")
    if preview:
        previews = os.environ.get("PREVIEW_DIR", "/tmp")
        for label, loc in (("front", (0, -5.5, 1.0)), ("side", (5.5, 0, 1.0))):
            render_preview(os.path.join(previews, f"{look_name}_rest_{label}.png"), loc, (0, 0, 0.9), ortho_scale=2.4, resolution=(360, 540))
        # Pose sheets: a few frames from each clip, from the front, to review motion.
        arm.animation_data.action = None
        for clip, keys in CLIPS.items():
            for frame in (keys[0][0], keys[len(keys) // 2][0]):
                for track in arm.animation_data.nla_tracks:
                    track.mute = track.name != clip
                for label, loc in (("f", (0, -5.5, 1.1)), ("s", (5.5, 0, 1.1))):
                    render_preview(
                        os.path.join(previews, f"{look_name}_{clip}_{frame}_{label}.png"),
                        loc,
                        (0, 0, 0.95),
                        ortho_scale=2.6,
                        resolution=(300, 420),
                        frame=frame,
                    )


if __name__ == "__main__":
    args = args_after_dashes()
    preview = "preview" in args
    for variant in LOOKS:
        build_variant(variant, preview=preview and variant == "gelin", save=variant == "gelin")
