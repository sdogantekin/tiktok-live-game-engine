"""Builds the shared toy-like character: one rigged, vertex-coloured mesh per look, with animation clips.

Run:  blender -b --factory-startup --python build_character.py [-- preview]

All looks share one rig (12 bones) and one style, so the runtime needs one draw call per character and no
textures. Looks: the two team dancers (gelin, damat), the bride and groom, and the two traditional wedding
musicians (davulcu with a davul, zurnaci with a zurna: instruments are part of the mesh and animated with it).
The character faces -Y in Blender (+Z in glTF) and stands with its feet at 0. Clips are authored for a base
tempo of 120 BPM at 24 fps, so one beat is 12 frames; dancing loops are two beats (24 frames).
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
HEIGHT_RANGE = (1.55, 1.95)  # includes the head accessory

HAIR = "#3b2a20"
SHOES = "#2a1d18"
EYES = "#1c1420"

LOOKS = {
    "gelin": {"kind": "team", "clothes": "#e0457b", "trousers": "#c93a6d", "skin": "#f1c9a5", "accessory": "veil", "clips": "team"},
    "damat": {"kind": "team", "clothes": "#2f6fdb", "trousers": "#27344f", "skin": "#e8bd98", "accessory": "fez", "clips": "team"},
    # The halaybaşı: the team's look with a mendil (napkin) in the hand away from the line, waved while leading.
    "gelin_leader": {"kind": "team", "clothes": "#e0457b", "trousers": "#c93a6d", "skin": "#f1c9a5", "accessory": "veil", "clips": "leader", "free": "L", "mendil": "#ff6fa5"},
    "damat_leader": {"kind": "team", "clothes": "#2f6fdb", "trousers": "#27344f", "skin": "#e8bd98", "accessory": "fez", "clips": "leader", "free": "R", "mendil": "#4a8cff"},
    # The halaybaşı at the other end of the line: its neighbour is on the opposite side, so the mendil is in the other hand.
    "gelin_tail_leader": {"kind": "team", "clothes": "#e0457b", "trousers": "#c93a6d", "skin": "#f1c9a5", "accessory": "veil", "clips": "leader", "free": "R", "mendil": "#ff6fa5"},
    "damat_tail_leader": {"kind": "team", "clothes": "#2f6fdb", "trousers": "#27344f", "skin": "#e8bd98", "accessory": "fez", "clips": "leader", "free": "L", "mendil": "#4a8cff"},
    "bride": {"kind": "bride", "clothes": "#ffffff", "trousers": "#ffffff", "skin": "#f1c9a5", "clips": "couple"},
    "groom": {"kind": "groom", "clothes": "#1d1d27", "trousers": "#1d1d27", "skin": "#e8bd98", "clips": "couple"},
    "davulcu": {"kind": "musician", "clothes": "#f4efe6", "trousers": "#27344f", "skin": "#e1b48d", "vest": "#8c2f39", "sash": "#c8a63a", "fez": "#b3261e", "instrument": "davul", "clips": "davul"},
    "sazci": {"kind": "musician", "clothes": "#f4efe6", "trousers": "#27344f", "skin": "#dcae86", "vest": "#1f5f7a", "sash": "#d8a23a", "fez": "#2c3e50", "instrument": "saz", "clips": "saz"},
    "zurnaci": {"kind": "musician", "clothes": "#f4efe6", "trousers": "#4a2b4f", "skin": "#d9a982", "vest": "#2e6b4f", "sash": "#d8702a", "fez": "#8c2f39", "instrument": "zurna", "clips": "zurna"},
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
    kind = look["kind"]
    m = MeshBuilder(f"Character_{look_name}", BONE_NAMES)
    clothes, trousers, skin = look["clothes"], look["trousers"], look["skin"]
    sleeve = clothes
    baggy = kind == "musician"  # a musician's şalvar: wide, baggy trousers

    # torso and hips
    m.box((0, 0, 0.6), (0.4, 0.26, 0.16), trousers, "Hips")
    m.cylinder((0, 0, 0.82), 0.22, 0.27, 0.4, clothes, "Spine", segments=8, scale=(1, 0.8, 1))
    if kind == "musician":
        # embroidered vest over the shirt, and a sash at the waist
        m.cylinder((0, 0, 0.84), 0.235, 0.285, 0.34, look["vest"], "Spine", segments=8, scale=(1, 0.82, 1))
        m.cylinder((0, 0, 0.68), 0.27, 0.27, 0.09, look["sash"], "Spine", segments=8, scale=(1, 0.82, 1))
        m.box((0, -0.2, 0.9), (0.05, 0.02, 0.3), look["sash"], "Spine")  # vest trim
    if kind == "groom":
        m.box((0, -0.215, 0.92), (0.12, 0.02, 0.26), "#ffffff", "Spine")  # shirt front
        m.box((0, -0.225, 0.9), (0.045, 0.02, 0.22), "#b3261e", "Spine")  # tie
        m.sphere((0.13, -0.22, 0.98), 0.035, "#e0457b", "Spine", segments=4, rings=3)  # boutonniere
    if kind == "bride":
        m.cylinder((0, 0, 0.82), 0.22, 0.25, 0.4, "#ffffff", "Spine", segments=8, scale=(1, 0.8, 1))
        m.cylinder((0, 0, 0.62), 0.36, 0.24, 0.4, "#ffffff", "Hips", segments=10)  # short, narrow skirt: the legs below it show and move
        m.cylinder((0, 0, 0.7), 0.27, 0.27, 0.07, "#c8102e", "Spine", segments=8, scale=(1, 0.82, 1))  # red bridal sash
        m.box((0, 0.24, 0.7), (0.2, 0.05, 0.14), "#c8102e", "Spine")  # bow
        m.box((0.07, 0.25, 0.5), (0.06, 0.04, 0.34), "#c8102e", "Hips")  # sash tails
        m.box((-0.07, 0.25, 0.5), (0.06, 0.04, 0.34), "#c8102e", "Hips")

    # head, eyes, hair
    m.sphere((0, 0, 1.22), 0.31, skin, "Head", segments=8, rings=6)
    for side in (-1, 1):
        m.sphere((0.1 * side, -0.27, 1.25), 0.04, EYES, "Head", segments=4, rings=3)
    m.sphere((0, 0.04, 1.32), 0.325, HAIR, "Head", segments=8, rings=4, scale=(1, 0.88, 0.72))
    if kind == "musician":
        m.box((0, -0.3, 1.1), (0.3, 0.07, 0.07), "#1c1420", "Head")  # a proud moustache
        m.box((0.12, -0.285, 1.14), (0.1, 0.06, 0.05), "#1c1420", "Head")
        m.box((-0.12, -0.285, 1.14), (0.1, 0.06, 0.05), "#1c1420", "Head")
    if kind == "groom":
        m.box((0, -0.3, 1.1), (0.2, 0.05, 0.05), "#1c1420", "Head")  # a neat moustache

    # arms (left = +X): sleeve, forearm, hand
    for side, suffix in ((1, "L"), (-1, "R")):
        m.limb((0.3 * side, 0, 0.92), (0.4 * side, 0, 0.72), 0.09, 0.08, sleeve, f"UpperArm.{suffix}")
        m.limb((0.4 * side, 0, 0.72), (0.45 * side, 0, 0.55), 0.08, 0.065, sleeve if kind in ("groom", "musician") else skin, f"LowerArm.{suffix}")
        m.sphere((0.455 * side, 0, 0.5), 0.1, skin, f"LowerArm.{suffix}", segments=6, rings=4)
    if look.get("mendil"):
        # the mendil: a square cloth in the free hand, hanging along the forearm, with a white border stripe
        side = 1 if look["free"] == "L" else -1
        free = f"LowerArm.{look['free']}"
        m.box((0.5 * side, -0.02, 0.33), (0.3, 0.03, 0.34), look["mendil"], free)
        m.box((0.5 * side, -0.02, 0.19), (0.3, 0.034, 0.05), "#ffffff", free)
        m.box((0.5 * side, -0.02, 0.47), (0.3, 0.034, 0.05), "#ffd35a", free)
    # legs: thigh, shin, shoe
    leg_r = (0.17, 0.15, 0.15, 0.13) if baggy else (0.12, 0.1, 0.1, 0.085)
    for side, suffix in ((1, "L"), (-1, "R")):
        leg_color = "#f4efe6" if kind == "bride" else trousers  # white stockings
        m.limb((0.115 * side, 0, 0.58), (0.115 * side, 0, 0.32), leg_r[0], leg_r[1], leg_color, f"UpperLeg.{suffix}")
        m.limb((0.115 * side, 0, 0.32), (0.115 * side, 0, 0.1), leg_r[2], leg_r[3], leg_color, f"LowerLeg.{suffix}")
        if baggy:
            m.cylinder((0.115 * side, 0, 0.12), 0.12, 0.12, 0.05, look["sash"], f"LowerLeg.{suffix}", segments=6)  # cuff
        m.box((0.115 * side, -0.05, 0.05), (0.17, 0.3, 0.1), SHOES, f"LowerLeg.{suffix}")

    accessory = look.get("accessory")
    if kind == "bride":
        # a small tiara and a long veil falling down the back (not the team gelin's tall veil cone)
        m.cylinder((0, -0.02, 1.5), 0.3, 0.3, 0.07, "#ffd35a", "Head", segments=8, scale=(1, 0.9, 1))
        m.sphere((0, -0.27, 1.56), 0.07, "#ffffff", "Head", segments=5, rings=3)
        m.box((0, 0.3, 1.1), (0.52, 0.05, 0.85), "#f4f0ff", "Head")
    if accessory == "veil":
        m.cylinder((0, 0.02, 1.62), 0.24, 0.04, 0.34, "#ffffff", "Head", segments=8)
        m.box((0, 0.22, 1.18), (0.5, 0.05, 0.6), "#f4f0ff", "Head")
        m.sphere((0.22, -0.18, 1.5), 0.065, "#ffd35a", "Head", segments=5, rings=3)
    elif accessory == "fez":
        m.cylinder((0, 0, 1.6), 0.19, 0.23, 0.22, "#b3261e", "Head", segments=8)
        m.cylinder((0.15, -0.02, 1.64), 0.022, 0.022, 0.2, "#1c1420", "Head", segments=4, rotation=(0, 40, 0))
    if kind == "musician":
        m.cylinder((0, 0, 1.6), 0.19, 0.23, 0.22, look["fez"], "Head", segments=8)
        m.box((0.16, -0.02, 1.62), (0.04, 0.04, 0.22), "#ffd35a", "Head")  # tassel

    if look.get("instrument") == "davul":
        # a big davul worn on the chest with a strap, a heavy mallet (tokmak) in the right hand and a thin stick in the left
        m.cylinder((0, -0.34, 0.74), 0.4, 0.4, 0.3, "#b8793d", "Spine", segments=12, rotation=(0, 90, 0))
        for side in (-1, 1):
            m.cylinder((0.155 * side, -0.34, 0.74), 0.41, 0.41, 0.05, "#f4ecd8", "Spine", segments=12, rotation=(0, 90, 0))
        m.cylinder((0, -0.34, 0.74), 0.425, 0.425, 0.07, "#b3261e", "Spine", segments=12, rotation=(0, 90, 0))
        m.limb((0.2, -0.05, 1.0), (0.2, -0.3, 0.98), 0.025, 0.025, "#4a3b34", "Spine", segments=4)  # strap over the shoulders
        m.limb((-0.2, -0.05, 1.0), (-0.2, -0.3, 0.98), 0.025, 0.025, "#4a3b34", "Spine", segments=4)
        m.limb((-0.45, -0.02, 0.5), (-0.45, -0.34, 0.5), 0.05, 0.075, "#8c5a3c", "LowerArm.R", segments=6)  # tokmak
        m.limb((0.45, -0.02, 0.5), (0.45, -0.34, 0.5), 0.025, 0.025, "#e8d3a0", "LowerArm.L", segments=4)  # stick
    if look.get("instrument") == "zurna":
        # the zurna: a long conical horn held to the mouth, with puffed cheeks
        m.limb((0, -0.3, 1.1), (0, -0.62, 0.9), 0.03, 0.05, "#d8a24a", "Head", segments=6)
        m.limb((0, -0.62, 0.9), (0, -0.84, 0.74), 0.05, 0.15, "#d8a24a", "Head", segments=8)
        for side in (-1, 1):
            m.sphere((0.2 * side, -0.2, 1.12), 0.1, look["skin"], "Head", segments=6, rings=4)
    if look.get("instrument") == "saz":
        # the saz (bağlama): a deep pear-shaped bowl held across the chest, a long neck reaching out to the left
        # (the left hand frets it), a headstock, a sound hole and strings; the right hand strums over the bowl
        m.sphere((-0.02, -0.31, 0.72), 0.21, "#8a4b24", "Spine", segments=8, rings=6, scale=(1.0, 0.5, 1.2))
        m.sphere((-0.02, -0.3, 0.55), 0.15, "#7a4120", "Spine", segments=8, rings=5, scale=(1.0, 0.5, 1.1))
        m.sphere((-0.02, -0.355, 0.68), 0.06, "#1c1420", "Spine", segments=6, rings=4, scale=(1.0, 0.4, 1.0))  # sound hole
        m.limb((0.12, -0.34, 0.9), (0.86, -0.4, 1.28), 0.04, 0.03, "#5a3418", "Spine", segments=5)  # neck
        m.box((0.9, -0.41, 1.32), (0.1, 0.045, 0.17), "#3b2412", "Spine")  # headstock
        m.limb((0.0, -0.37, 0.72), (0.88, -0.43, 1.3), 0.008, 0.008, "#e8e0c8", "Spine", segments=3)  # strings
        for fret in (0.3, 0.45, 0.6):  # frets
            m.box((0.12 + 0.74 * fret, -0.41 - 0.06 * fret, 0.9 + 0.38 * fret), (0.012, 0.03, 0.07), "#e8e0c8", "Spine")

    return m


# ---------------------------------------------------------------------------------------------
# Animation. Each clip is a list of (frame, {bone: (rx, ry, rz) or (rx, ry, rz, sideways, forward, up)}) keys, in
# degrees and metres. Bones not mentioned at a key return to the rest pose. All clips end on their first key's pose,
# so they loop and blend cleanly. 24 fps, 120 BPM: one beat = 12 frames. Positive rx swings a limb backwards.
# ---------------------------------------------------------------------------------------------

# Arms out in a V and the hands meeting the neighbours' hands at about hip height: the halay chain, readable from above.
LINK_ARMS = {"UpperArm.L": (-6, 0, -50), "UpperArm.R": (-6, 0, 50), "LowerArm.L": (-6, 0, 36), "LowerArm.R": (-6, 0, -36)}


def arms(**extra):
    return {**LINK_ARMS, **extra}


def pump(level, **extra):
    """The linked arms swing up and down with the step (level 0 = low, 1 = high): the chain bounces on the beat."""
    up = 28 + 46 * level
    fore = 20 + 24 * level
    forward = -2 - 18 * (1 - level)
    return {
        "UpperArm.L": (forward, 0, -up),
        "UpperArm.R": (forward, 0, up),
        "LowerArm.L": (-8, 0, fore),
        "LowerArm.R": (-8, 0, -fore),
        **extra,
    }


CLIPS = {
    "idle": [
        (1, {}),
        (13, {"Hips": (0, 0, 0, 0, 0, -0.02), "Spine": (3, 0, 0), "Head": (-2, 0, 3), "UpperArm.L": (0, 0, -4), "UpperArm.R": (0, 0, 4)}),
        (25, {}),
        (37, {"Hips": (0, 0, 0, 0, 0, -0.02), "Spine": (3, 0, 0), "Head": (-2, 0, -3), "UpperArm.L": (0, 0, -4), "UpperArm.R": (0, 0, 4)}),
        (49, {}),
    ],
    # The halay side step towards the character's left: beat 1 the left foot steps out, beat 2 the right foot closes.
    # Arms stay out holding the neighbours; the body bounces on the beat and leans into the step.
    "step_left": [
        # beat 1: crouch, then the left leg lifts and reaches out and lands
        (1, pump(0, Hips=(0, 0, 0, 0.0, 0, -0.08), Spine=(0, 0, 5), **{"UpperLeg.L": (-14, 0, -6), "LowerLeg.L": (26, 0, 0), "UpperLeg.R": (-14, 0, 6), "LowerLeg.R": (26, 0, 0)})),
        (4, pump(1, Hips=(0, 0, 0, 0.05, 0, 0.05), Spine=(0, 0, 9), Head=(0, 0, 4), **{"UpperLeg.L": (-42, 0, -34), "LowerLeg.L": (62, 0, 0), "UpperLeg.R": (-6, 0, 6), "LowerLeg.R": (14, 0, 0)})),
        (7, pump(0.4, Hips=(0, 0, 0, 0.09, 0, -0.02), Spine=(0, 0, 4), **{"UpperLeg.L": (-12, 0, -32), "LowerLeg.L": (24, 0, 0), "UpperLeg.R": (-8, 0, 8), "LowerLeg.R": (16, 0, 0)})),
        # beat 2: crouch on the new foot, then the right leg lifts and closes in
        (13, pump(0, Hips=(0, 0, 0, 0.05, 0, -0.08), Spine=(0, 0, -5), **{"UpperLeg.L": (-14, 0, -12), "LowerLeg.L": (26, 0, 0), "UpperLeg.R": (-14, 0, 10), "LowerLeg.R": (26, 0, 0)})),
        (16, pump(1, Hips=(0, 0, 0, 0.02, 0, 0.05), Spine=(0, 0, -9), Head=(0, 0, -4), **{"UpperLeg.R": (-42, 0, 26), "LowerLeg.R": (62, 0, 0), "UpperLeg.L": (-6, 0, -8), "LowerLeg.L": (14, 0, 0)})),
        (19, pump(0.4, Hips=(0, 0, 0, -0.02, 0, -0.02), Spine=(0, 0, -4), **{"UpperLeg.R": (-10, 0, 8), "LowerLeg.R": (20, 0, 0), "UpperLeg.L": (-10, 0, -10), "LowerLeg.L": (20, 0, 0)})),
        (25, pump(0, Hips=(0, 0, 0, 0.0, 0, -0.08), Spine=(0, 0, 5), **{"UpperLeg.L": (-14, 0, -6), "LowerLeg.L": (26, 0, 0), "UpperLeg.R": (-14, 0, 6), "LowerLeg.R": (26, 0, 0)})),
    ],
    # One beat of showing off: a high kick with an arm swing, then back into the chain.
    "halay_kick": [
        (1, arms()),
        (4, arms(Hips=(0, 0, 0, 0, 0, -0.1), Spine=(8, 0, 0), **{"UpperLeg.L": (10, 0, 0), "LowerLeg.L": (-20, 0, 0)})),
        (8, arms(Hips=(0, 0, 0, 0, 0, 0.12), Spine=(-6, 0, 0), **{"UpperLeg.R": (-85, 0, 0), "LowerLeg.R": (25, 0, 0), "UpperArm.L": (0, 0, -45), "UpperArm.R": (0, 0, 45)})),
        (13, arms(Hips=(0, 0, 0, 0, 0, -0.04), **{"UpperLeg.R": (-20, 0, 0), "LowerLeg.R": (10, 0, 0)})),
        (17, arms()),
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
    # Davulcu: both hands over the davul, striking alternately on the beat and the off-beat. One beat = 12 frames.
    "davul_play": [
        (1, {"Hips": (0, 0, 0, 0, 0, -0.04), "Spine": (6, 0, 0), "UpperArm.R": (-70, 0, 10), "LowerArm.R": (-25, 0, 0), "UpperArm.L": (-40, 0, -10), "LowerArm.L": (-60, 0, 0), "Head": (-4, 0, 0)}),
        (4, {"Hips": (0, 0, 0, 0, 0, 0.0), "Spine": (0, 0, 2), "UpperArm.R": (-50, 0, 10), "LowerArm.R": (-60, 0, 0), "UpperArm.L": (-60, 0, -10), "LowerArm.L": (-20, 0, 0), "Head": (2, 0, 0)}),
        (7, {"Hips": (0, 0, 0, 0, 0, -0.04), "Spine": (6, 0, -2), "UpperArm.R": (-40, 0, 10), "LowerArm.R": (-60, 0, 0), "UpperArm.L": (-70, 0, -10), "LowerArm.L": (-25, 0, 0), "Head": (-4, 0, 0)}),
        (10, {"Hips": (0, 0, 0, 0, 0, 0.0), "Spine": (0, 0, 0), "UpperArm.R": (-60, 0, 10), "LowerArm.R": (-20, 0, 0), "UpperArm.L": (-50, 0, -10), "LowerArm.L": (-60, 0, 0), "Head": (2, 0, 0)}),
        (13, {"Hips": (0, 0, 0, 0, 0, -0.04), "Spine": (6, 0, 0), "UpperArm.R": (-70, 0, 10), "LowerArm.R": (-25, 0, 0), "UpperArm.L": (-40, 0, -10), "LowerArm.L": (-60, 0, 0), "Head": (-4, 0, 0)}),
    ],
    # Saz player: the left hand frets the long neck, the right hand strums over the bowl in quick down/up strokes (four per
    # beat), with the body bouncing on the beat. One beat.
    "saz_play": [
        (1, {"Hips": (0, 0, 0, 0, 0, -0.03), "Spine": (4, 0, 2), "Head": (-3, 0, 0), "UpperArm.L": (-78, 0, -22), "LowerArm.L": (-18, 0, 0), "UpperArm.R": (-55, 0, 18), "LowerArm.R": (-45, 0, 0)}),
        (4, {"Hips": (0, 0, 0, 0, 0, 0.0), "Spine": (2, 0, 0), "Head": (0, 0, 0), "UpperArm.L": (-78, 0, -22), "LowerArm.L": (-22, 0, 0), "UpperArm.R": (-55, 0, 18), "LowerArm.R": (-85, 0, 0)}),
        (7, {"Hips": (0, 0, 0, 0, 0, -0.03), "Spine": (4, 0, -2), "Head": (-3, 0, 0), "UpperArm.L": (-78, 0, -22), "LowerArm.L": (-18, 0, 0), "UpperArm.R": (-55, 0, 18), "LowerArm.R": (-45, 0, 0)}),
        (10, {"Hips": (0, 0, 0, 0, 0, 0.0), "Spine": (2, 0, 0), "Head": (0, 0, 0), "UpperArm.L": (-78, 0, -22), "LowerArm.L": (-22, 0, 0), "UpperArm.R": (-55, 0, 18), "LowerArm.R": (-85, 0, 0)}),
        (13, {"Hips": (0, 0, 0, 0, 0, -0.03), "Spine": (4, 0, 2), "Head": (-3, 0, 0), "UpperArm.L": (-78, 0, -22), "LowerArm.L": (-18, 0, 0), "UpperArm.R": (-55, 0, 18), "LowerArm.R": (-45, 0, 0)}),
    ],
    # Zurnaci: both hands up at the horn, head bobbing and body swaying with the tune. Two beats.
    "zurna_play": [
        (1, {"Hips": (0, 0, 0, 0.02, 0, -0.03), "Spine": (-4, 0, 3), "Head": (-6, 0, 3), "UpperArm.L": (-95, 0, -18), "UpperArm.R": (-95, 0, 18), "LowerArm.L": (-85, 0, 0), "LowerArm.R": (-85, 0, 0)}),
        (7, {"Hips": (0, 0, 0, 0, 0, 0.0), "Spine": (-8, 0, 0), "Head": (-2, 0, 0), "UpperArm.L": (-95, 0, -18), "UpperArm.R": (-95, 0, 18), "LowerArm.L": (-85, 0, 0), "LowerArm.R": (-85, 0, 0)}),
        (13, {"Hips": (0, 0, 0, -0.02, 0, -0.03), "Spine": (-4, 0, -3), "Head": (-6, 0, -3), "UpperArm.L": (-95, 0, -18), "UpperArm.R": (-95, 0, 18), "LowerArm.L": (-85, 0, 0), "LowerArm.R": (-85, 0, 0)}),
        (19, {"Hips": (0, 0, 0, 0, 0, 0.0), "Spine": (-8, 0, 0), "Head": (-2, 0, 0), "UpperArm.L": (-95, 0, -18), "UpperArm.R": (-95, 0, 18), "LowerArm.L": (-85, 0, 0), "LowerArm.R": (-85, 0, 0)}),
        (25, {"Hips": (0, 0, 0, 0.02, 0, -0.03), "Spine": (-4, 0, 3), "Head": (-6, 0, 3), "UpperArm.L": (-95, 0, -18), "UpperArm.R": (-95, 0, 18), "LowerArm.L": (-85, 0, 0), "LowerArm.R": (-85, 0, 0)}),
    ],
}


def mirrored(keys):
    """The same clip mirrored left/right (swap the sides, flip sideways rotations and offsets)."""

    def swap(bone):
        return bone.replace(".L", ".#").replace(".R", ".L").replace(".#", ".R")

    out = []
    for frame, pose in keys:
        mirrored_pose = {}
        for bone, values in pose.items():
            rx, ry, rz = values[:3]
            rest = values[3:]
            if rest:
                x, forward, up = rest
                rest = (-x, forward, up)
            mirrored_pose[swap(bone)] = (rx, -ry, -rz, *rest)
        out.append((frame, mirrored_pose))
    return out




def amplify(keys, legs, hips, torso):
    """Exaggerates a clip for readability: the dancers are only ~50 px tall on a vertical stream, so toy-like big moves."""
    out = []
    for frame, pose in keys:
        scaled = {}
        for bone, v in pose.items():
            factor = legs if "Leg" in bone else torso if bone in ("Spine", "Head") else 1
            rot = tuple(a * factor for a in v[:3])
            if len(v) == 6:
                x, forward, up = v[3:]
                if bone == "Hips":
                    # Seen from a high camera, limbs are foreshortened: what reads is the whole body travelling
                    # sideways and hopping, so those are exaggerated much more than the limb swings.
                    scaled[bone] = (*rot, x * 3.2, forward, up * (hips * 2.4 if up > 0 else hips))
                else:
                    scaled[bone] = (*rot, x, forward, up)
            else:
                scaled[bone] = rot
        out.append((frame, scaled))
    return out


CLIPS["step_left"] = amplify(CLIPS["step_left"], legs=1.55, hips=1.4, torso=1.4)
# A shoulder twist towards each step (read well from above); `mirrored` flips it for the other side.
for _i, (_frame, _pose) in enumerate(CLIPS["step_left"]):
    _twist = {1: 0, 4: 14, 7: 7, 13: 0, 16: -14, 19: -7, 25: 0}[_frame]
    _pose["Root"] = (0, _twist, 0)
CLIPS["step_right"] = mirrored(CLIPS["step_left"])


def _on_side(side, pose):
    """A pose authored for the left arm, moved to `side` (L or R): bones swapped, sideways rotations flipped."""
    if side == "L":
        return dict(pose)
    return {bone.replace(".L", ".R"): (v[0], -v[1], -v[2]) for bone, v in pose.items()}


# The halaybaşı keeps one hand in the chain and waves the mendil high with the other.
WAVES = [
    {"UpperArm.L": (-10, 0, -100), "LowerArm.L": (-25, 0, -55)},
    {"UpperArm.L": (-10, 0, -100), "LowerArm.L": (-25, 0, -15)},
]
BIG_WAVES = [
    {"UpperArm.L": (-45, 0, -115), "LowerArm.L": (-40, 0, -60)},
    {"UpperArm.L": (-5, 0, -85), "LowerArm.L": (-60, 0, -10)},
]


def leader_keys(name, side):
    base = {"leader_step_left": CLIPS["step_left"], "leader_step_right": CLIPS["step_right"], "mendil_flourish": CLIPS["halay_kick"]}[name]
    waves = BIG_WAVES if name == "mendil_flourish" else WAVES
    out = []
    for i, (frame, pose) in enumerate(base):
        merged = dict(pose)
        merged.update(_on_side(side, waves[i % 2]))
        out.append((frame, merged))
    return out

LEADER_CLIPS = {"leader_step_left", "leader_step_right", "mendil_flourish"}

CLIP_SETS = {
    "team": ["idle", "step_left", "step_right", "halay_kick", "jump", "dance_a", "dance_b", "rose_special"],
    "leader": ["idle", "leader_step_left", "leader_step_right", "mendil_flourish", "jump", "dance_a", "dance_b", "rose_special"],
    "couple": ["idle", "step_left", "step_right"],
    "davul": ["idle", "davul_play"],
    "zurna": ["idle", "zurna_play"],
    "saz": ["idle", "saz_play"],
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


def build_actions(arm, clip_names, free_side="L"):
    arm.animation_data_create()
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
    for name in clip_names:
        keys = leader_keys(name, free_side) if name in LEADER_CLIPS else CLIPS[name]
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
    clip_names = CLIP_SETS[LOOKS[look_name]["clips"]]
    build_actions(arm, clip_names, LOOKS[look_name].get("free", "L"))

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
    print(f"[character:{look_name}] {tris} tris, height {height:.2f} m, {len(arm.data.bones)} bones, {len(clip_names)} clips, {size / 1024:.1f} KB -> {path}")

    if look_name == "gelin" and save:
        save_blend("character.blend")
    if preview:
        previews = os.environ.get("PREVIEW_DIR", "/tmp")
        render_preview(os.path.join(previews, f"{look_name}_rest_front.png"), (0, -5.5, 1.0), (0, 0, 0.9), ortho_scale=2.4, resolution=(360, 540))
        arm.animation_data.action = None
        for clip in clip_names:
            keys = leader_keys(clip, LOOKS[look_name].get("free", "L")) if clip in LEADER_CLIPS else CLIPS[clip]
            for frame in sorted({keys[0][0], keys[len(keys) // 3][0], keys[2 * len(keys) // 3][0]}):
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
    wanted = os.environ.get("PREVIEW_LOOKS", "").split(",")
    for variant in LOOKS:
        build_variant(variant, preview="preview" in args and variant in wanted, save=True)
