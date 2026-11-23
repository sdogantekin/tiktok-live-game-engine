"""Builds the Takı Takma Töreni characters on the same toy rig and style as Mahalle Halayı.

Run:  blender -b --factory-startup --python build_taki_characters.py [-- preview]

It reuses `build_character.py` from the Mahalle Halayı assets (same 12-bone rig, same mesh builder, same validation),
adds the looks and animation clips this game needs, and writes the GLBs to this game's own folder:
  guest_gelin, guest_damat   the guests who queue and walk up to pin a takı (clips: idle, walk, pin, clap, jump)
  couple_bride, couple_groom the couple receiving takı (clips: idle, receive, thank, clap)
  anne_*, baba_*             the four parents (clips: idle, clap, wipe_tears, cheer)
One beat is 12 frames (24 fps, 120 BPM), as in the Halay clips.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "mahalle-halayi", "scripts"))

import assetlib  # noqa: E402
import build_character as bc  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
bc.MODELS_DIR = os.path.join(ROOT, "apps", "web", "public", "game-modes", "taki-takma", "models")
assetlib.BLEND_DIR = os.path.join(ROOT, "assets", "game-modes", "taki-takma", "source-blend")

# ---------------------------------------------------------------------------------------------
# Looks. Side colours follow the Halay game: gelin side pink, damat side blue.
# ---------------------------------------------------------------------------------------------
GELIN = {"clothes": "#e0457b", "trousers": "#c93a6d", "skin": "#f1c9a5"}
DAMAT = {"clothes": "#2f6fdb", "trousers": "#27344f", "skin": "#e8bd98"}

bc.LOOKS.update(
    {
        "guest_gelin": {"kind": "team", **GELIN, "accessory": "veil", "clips": "guest"},
        "guest_damat": {"kind": "team", **DAMAT, "accessory": "fez", "clips": "guest"},
        "couple_bride": {"kind": "bride", "clothes": "#ffffff", "trousers": "#ffffff", "skin": "#f1c9a5", "clips": "couple_taki"},
        "couple_groom": {"kind": "groom", "clothes": "#1d1d27", "trousers": "#1d1d27", "skin": "#e8bd98", "clips": "couple_taki"},
        # The parents: mothers in a headscarf and a long coat colour, fathers in a flat cap with a moustache and grey hair.
        "anne_gelin": {"kind": "team", "clothes": "#b8458f", "trousers": "#7d2f63", "skin": "#efc4a0", "clips": "parent", "extras": ["scarf"], "scarf": "#f2b8d4"},
        "baba_gelin": {"kind": "team", "clothes": "#6f3a52", "trousers": "#3b2430", "skin": "#e6b793", "clips": "parent", "extras": ["cap", "moustache", "grey"], "cap": "#8f4a68"},
        "anne_damat": {"kind": "team", "clothes": "#3f7fd9", "trousers": "#27407a", "skin": "#e8bd98", "clips": "parent", "extras": ["scarf"], "scarf": "#a9c8f5"},
        "baba_damat": {"kind": "team", "clothes": "#27407a", "trousers": "#1c2a4a", "skin": "#e1b48d", "clips": "parent", "extras": ["cap", "moustache", "grey"], "cap": "#4a6ca8"},
    }
)

bc.CLIP_SETS.update(
    {
        "guest": ["idle", "walk", "pin", "clap", "jump"],
        "couple_taki": ["idle", "receive", "thank", "clap"],
        "parent": ["idle", "clap", "wipe_tears", "cheer"],
    }
)

# ---------------------------------------------------------------------------------------------
# Extra mesh pieces for the looks above (added on top of the shared character mesh).
# ---------------------------------------------------------------------------------------------


def _scarf(m, look):
    m.sphere((0, 0.1, 1.27), 0.345, look["scarf"], "Head", segments=8, rings=5, scale=(1, 0.95, 0.95))
    m.sphere((0, 0.38, 1.12), 0.12, look["scarf"], "Head", segments=5, rings=3)  # the knot at the back


def _cap(m, look):
    m.cylinder((0, 0, 1.49), 0.3, 0.32, 0.12, look["cap"], "Head", segments=8)
    m.box((0, -0.3, 1.45), (0.34, 0.16, 0.03), look["cap"], "Head")  # the peak


def _moustache(m, look):
    m.box((0, -0.3, 1.1), (0.28, 0.05, 0.05), "#d8d8d8", "Head")


def _grey(m, look):
    m.sphere((0, 0.04, 1.325), 0.335, "#cfcfcf", "Head", segments=8, rings=4, scale=(1, 0.88, 0.72))


EXTRAS = {"scarf": _scarf, "cap": _cap, "moustache": _moustache, "grey": _grey}
_build_mesh = bc.build_mesh


def build_mesh(look_name):
    m = _build_mesh(look_name)
    for extra in bc.LOOKS[look_name].get("extras", []):
        EXTRAS[extra](m, bc.LOOKS[look_name])
    return m


bc.build_mesh = build_mesh

# ---------------------------------------------------------------------------------------------
# Clips (degrees and metres, see build_character.py). Positive rx swings a limb backwards and leans the spine forward.
# ---------------------------------------------------------------------------------------------


def _pose(**kw):
    return {k.replace("_", "."): v for k, v in kw.items()}


# Walking: two beats, legs and arms swinging against each other, a small bounce on each step.
_WALK_A = _pose(UpperLeg_L=(-30, 0, 0), LowerLeg_L=(8, 0, 0), UpperLeg_R=(24, 0, 0), LowerLeg_R=(26, 0, 0), UpperArm_L=(22, 0, -8), UpperArm_R=(-22, 0, 8), Spine=(3, 0, 0))
_WALK_PASS = _pose(UpperLeg_L=(-4, 0, 0), LowerLeg_L=(12, 0, 0), UpperLeg_R=(-22, 0, 0), LowerLeg_R=(44, 0, 0), Hips=(0, 0, 0, 0, 0, 0.05), Spine=(3, 0, 0), UpperArm_L=(0, 0, -8), UpperArm_R=(0, 0, 8))
_WALK_B = bc.mirrored([(1, _WALK_A)])[0][1]
_WALK_PASS_B = bc.mirrored([(1, _WALK_PASS)])[0][1]
bc.CLIPS["walk"] = [(1, _WALK_A), (7, _WALK_PASS), (13, _WALK_B), (19, _WALK_PASS_B), (25, _WALK_A)]

# Pinning a takı: reach forward with both hands, lean in, press, stand back. Three beats, plays once.
bc.CLIPS["pin"] = [
    (1, {}),
    (7, _pose(Spine=(8, 0, 0), UpperArm_R=(-80, 0, 10), LowerArm_R=(-40, 0, 0), UpperArm_L=(-55, 0, -12), LowerArm_L=(-30, 0, 0))),
    (15, _pose(Spine=(24, 0, 0), Head=(8, 0, 0), Hips=(0, 0, 0, 0, 0.05, -0.03), UpperArm_R=(-98, 0, 6), LowerArm_R=(-60, 0, 0), UpperArm_L=(-80, 0, -10), LowerArm_L=(-45, 0, 0))),
    (21, _pose(Spine=(26, 0, 0), Head=(10, 0, 0), Hips=(0, 0, 0, 0, 0.05, -0.04), UpperArm_R=(-98, 0, 6), LowerArm_R=(-78, 0, 0), UpperArm_L=(-80, 0, -10), LowerArm_L=(-50, 0, 0))),
    (29, _pose(Spine=(8, 0, 0), UpperArm_R=(-50, 0, 10), LowerArm_R=(-25, 0, 0), UpperArm_L=(-30, 0, -10))),
    (37, {}),
]


def _clap_keys(bounce):
    open_ = _pose(UpperArm_L=(-72, 0, -38), UpperArm_R=(-72, 0, 38), LowerArm_L=(-30, 0, 30), LowerArm_R=(-30, 0, -30), Spine=(2, 0, 0))
    shut = _pose(UpperArm_L=(-76, 0, -12), UpperArm_R=(-76, 0, 12), LowerArm_L=(-50, 0, 12), LowerArm_R=(-50, 0, -12), Spine=(5, 0, 0), Hips=(0, 0, 0, 0, 0, -bounce))
    keys = []
    for i, frame in enumerate(range(1, 26, 3)):
        keys.append((frame, open_ if i % 2 == 0 else shut))
    keys[-1] = (25, open_)
    return keys


bc.CLIPS["clap"] = _clap_keys(0.04)

# The couple receiving a takı: a grateful nod with a hand on the heart. 2 beats, plays once.
bc.CLIPS["receive"] = [
    (1, {}),
    (8, _pose(Head=(14, 0, 0), Spine=(8, 0, 0), UpperArm_R=(-38, 0, 14), LowerArm_R=(-80, 0, 0), UpperArm_L=(-14, 0, -12))),
    (16, _pose(Head=(10, 0, 0), Spine=(6, 0, 0), UpperArm_R=(-38, 0, 14), LowerArm_R=(-80, 0, 0), UpperArm_L=(-14, 0, -12))),
    (25, {}),
]

# Thanking everyone after a milestone: arms wide, then a deep bow, then up with a wave. 3 beats, plays once.
bc.CLIPS["thank"] = [
    (1, {}),
    (8, _pose(UpperArm_L=(-20, 0, -105), UpperArm_R=(-20, 0, 105), Head=(-4, 0, 0), Hips=(0, 0, 0, 0, 0, 0.04))),
    (18, _pose(Spine=(34, 0, 0), Head=(10, 0, 0), UpperArm_L=(-40, 0, -25), UpperArm_R=(-40, 0, 25), Hips=(0, 0, 0, 0, 0.04, -0.03))),
    (28, _pose(UpperArm_L=(-20, 0, -120), UpperArm_R=(-20, 0, 120), Hips=(0, 0, 0, 0, 0, 0.06))),
    (37, {}),
]

# A mother wiping happy tears, a hand to the eyes and back, twice. 3 beats, plays once.
bc.CLIPS["wipe_tears"] = [
    (1, {}),
    (7, _pose(Head=(10, 0, 5), Spine=(4, 0, 0), UpperArm_R=(-112, 0, 18), LowerArm_R=(-100, 0, 0))),
    (13, _pose(Head=(10, 0, 5), Spine=(4, 0, 0), UpperArm_R=(-112, 0, 22), LowerArm_R=(-128, 0, 0))),
    (19, _pose(Head=(10, 0, 5), Spine=(4, 0, 0), UpperArm_R=(-112, 0, 18), LowerArm_R=(-100, 0, 0))),
    (25, _pose(Head=(10, 0, 5), Spine=(4, 0, 0), UpperArm_R=(-112, 0, 22), LowerArm_R=(-128, 0, 0))),
    (37, {}),
]

# Cheering: both arms up and a happy bounce. 2 beats, plays once.
bc.CLIPS["cheer"] = [
    (1, {}),
    (5, _pose(UpperArm_L=(0, 0, -150), UpperArm_R=(0, 0, 150), Hips=(0, 0, 0, 0, 0, 0.12), UpperLeg_L=(-12, 0, 0), UpperLeg_R=(-12, 0, 0), LowerLeg_L=(24, 0, 0), LowerLeg_R=(24, 0, 0))),
    (9, _pose(UpperArm_L=(0, 0, -140), UpperArm_R=(0, 0, 140), Hips=(0, 0, 0, 0, 0, -0.04), UpperLeg_L=(-20, 0, 0), UpperLeg_R=(-20, 0, 0), LowerLeg_L=(34, 0, 0), LowerLeg_R=(34, 0, 0))),
    (13, _pose(UpperArm_L=(0, 0, -150), UpperArm_R=(0, 0, 150), Hips=(0, 0, 0, 0, 0, 0.12), UpperLeg_L=(-12, 0, 0), UpperLeg_R=(-12, 0, 0), LowerLeg_L=(24, 0, 0), LowerLeg_R=(24, 0, 0))),
    (17, _pose(UpperArm_L=(0, 0, -140), UpperArm_R=(0, 0, 140), Hips=(0, 0, 0, 0, 0, -0.04))),
    (25, {}),
]

NEW_LOOKS = ["guest_gelin", "guest_damat", "couple_bride", "couple_groom", "anne_gelin", "baba_gelin", "anne_damat", "baba_damat"]

if __name__ == "__main__":
    args = assetlib.args_after_dashes()
    wanted = os.environ.get("PREVIEW_LOOKS", "").split(",")
    for look in NEW_LOOKS:
        bc.build_variant(look, preview="preview" in args and look in wanted, save=False)
        assetlib.save_blend(f"character_{look}.blend")
