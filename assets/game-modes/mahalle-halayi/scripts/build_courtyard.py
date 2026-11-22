"""Builds the courtyard kit: modular set pieces for the Mahalle Halayı wedding courtyard, one GLB.

Each piece is its own named node (so the scene can place and repeat them from data), vertex-coloured on one
shared material, with its origin at ground level. Blender +Y is "away from the camera"; the front faces -Y.

Run:  blender -b --factory-startup --python build_courtyard.py [-- preview]
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

TRIANGLE_BUDGET = 30000
REQUIRED = ["Floor_Plaza", "Floor_Dance", "House_A", "House_B", "House_C", "Lamp", "Banner_Gelin", "Banner_Damat", "Stage", "Davul", "Zurna", "Arch", "Planter"]

WOOD, DARK_WOOD, STONE, GOLD = "#8c5a3c", "#4a3b34", "#d9c3a0", "#ffd35a"


def plaza():
    m = MeshBuilder("Floor_Plaza")
    light, dark = "#e9c892", "#d9b274"

    def tile(ix, iy):
        shade = ((ix * 7 + iy * 13) % 5) / 400.0  # a whisper of variation so tiles do not look printed
        base = light if (ix + iy) % 2 == 0 else dark
        value = int(base.lstrip("#"), 16)
        r, g, b = ((value >> 16) & 255, (value >> 8) & 255, value & 255)
        return "#%02x%02x%02x" % tuple(max(0, min(255, int(c * (1 - shade * 6)))) for c in (r, g, b))

    m.grid((0, 0, 0.0), 30, 40.5, 20, 27, tile)
    return m


def dance_floor():
    import bmesh

    m = MeshBuilder("Floor_Dance")
    m.cylinder((0, 0, 0.03), 3.9, 3.9, 0.06, "#b0553f", segments=32)  # border
    border = set(m.bm.faces)
    # Sunburst: the inner disc is a fan of triangles in alternating warm tones.
    bmesh.ops.create_cone(
        m.bm, cap_ends=True, cap_tris=True, segments=16, radius1=3.5, radius2=3.5, depth=0.06, matrix=m._matrix((0, 0, 0.065), (0, 0, 0), (1, 1, 1))
    )
    disc = [f for f in m.bm.faces if f not in border]
    top = sorted((f for f in disc if f.normal.z > 0.5), key=lambda f: math.atan2(f.calc_center_median().y, f.calc_center_median().x))
    shade = {f: ("#f3dfb6" if i % 2 == 0 else "#ecd0a0") for i, f in enumerate(top)}
    m.paint_faces(top, lambda f: shade[f])
    m.paint_faces([f for f in disc if f not in shade], lambda f: "#c9a77a")
    m.sphere((0, 0, 0.1), 0.35, GOLD, segments=8, rings=4, scale=(1, 1, 0.3))  # centre medallion
    return m


def house(name, width, height, wall, roof, accent):
    m = MeshBuilder(name)
    depth = 2.4
    m.box((0, 0, height / 2), (width, depth, height), wall)
    m.box((0, 0, height + 0.3), (width + 0.5, depth + 0.5, 0.6), roof)  # eaves
    m.box((0, 0, height + 0.75), (width * 0.55, depth * 0.7, 0.4), roof)  # ridge
    m.box((width * 0.3, 0.3, height + 1.1), (0.45, 0.45, 0.9), "#a0705a")  # chimney
    floors = max(1, int(height // 2.2))
    cols = max(2, int(width // 1.6))
    for floor in range(floors):
        z = 1.0 + floor * 2.0 + (0.9 if floor == 0 else 0.5)
        for i in range(cols):
            x = (i - (cols - 1) / 2) * (width / cols)
            if floor == 0 and i == cols // 2:
                m.box((x, -depth / 2 - 0.03, 0.9), (0.9, 0.08, 1.8), DARK_WOOD)  # door
                m.box((x, -depth / 2 - 0.05, 1.95), (1.1, 0.1, 0.18), accent)  # lintel
                continue
            m.box((x, -depth / 2 - 0.03, z), (0.7, 0.08, 0.95), "#ffcf7a")  # lit window
            m.box((x, -depth / 2 - 0.06, z - 0.55), (0.9, 0.12, 0.1), accent)  # sill
            m.box((x - 0.5, -depth / 2 - 0.05, z), (0.12, 0.1, 1.0), accent)  # shutters
            m.box((x + 0.5, -depth / 2 - 0.05, z), (0.12, 0.1, 1.0), accent)
    return m


def lamp():
    m = MeshBuilder("Lamp")
    m.cylinder((0, 0, 0.12), 0.18, 0.14, 0.24, DARK_WOOD, segments=6)
    m.cylinder((0, 0, 1.7), 0.06, 0.08, 3.1, DARK_WOOD, segments=6)
    m.box((0, 0, 3.3), (0.36, 0.36, 0.42), "#fff2b8")  # lantern glass
    m.cylinder((0, 0, 3.58), 0.3, 0.05, 0.16, DARK_WOOD, segments=4)
    return m


def banner(name, color):
    m = MeshBuilder(name)
    m.cylinder((0, 0, 1.8), 0.06, 0.06, 3.6, DARK_WOOD, segments=6)
    m.box((0, 0, 3.6), (0.14, 0.14, 0.14), GOLD)
    m.box((0.5, 0, 2.85), (1.0, 0.05, 1.5), color)
    m.box((0.5, -0.03, 3.45), (0.9, 0.05, 0.1), GOLD)
    m.box((0.5, -0.03, 2.2), (0.9, 0.05, 0.1), GOLD)
    return m


def stage():
    m = MeshBuilder("Stage")
    m.box((0, 0, 0.25), (6.4, 2.6, 0.5), WOOD)
    m.box((0, 0.02, 0.52), (6.5, 2.7, 0.06), DARK_WOOD)
    for i in range(3):  # steps at the front
        m.box((0, -1.45 - i * 0.3, 0.12 + (2 - i) * 0.0 + 0.0), (2.0, 0.3, 0.24 - i * 0.0), "#a8744d")
    stripes = ["#b3261e", "#ffd35a", "#2f6fdb", "#ffffff", "#2f6fdb", "#ffd35a", "#b3261e"]
    for i, color in enumerate(stripes):  # kilim-style backdrop
        m.box((-2.7 + i * 0.9, 1.25, 1.75), (0.9, 0.08, 2.5), color)
    m.box((-3.1, 0.9, 1.6), (0.25, 0.25, 3.2), DARK_WOOD)
    m.box((3.1, 0.9, 1.6), (0.25, 0.25, 3.2), DARK_WOOD)
    m.box((0, 0.9, 3.2), (6.4, 0.3, 0.3), DARK_WOOD)
    return m


def davul():
    m = MeshBuilder("Davul")
    m.cylinder((0, 0, 0.45), 0.4, 0.4, 0.4, "#b8793d", segments=12, rotation=(90, 0, 0))  # drum body, lying on its side
    for side in (-1, 1):
        m.cylinder((0, 0.2 * side, 0.45), 0.42, 0.42, 0.05, "#f4ecd8", segments=12, rotation=(90, 0, 0))  # skins
    m.cylinder((0, 0, 0.45), 0.43, 0.43, 0.06, "#b3261e", segments=12, rotation=(90, 0, 0))  # red band
    m.limb((0.45, -0.3, 0.7), (0.65, -0.55, 0.75), 0.025, 0.025, "#e8d3a0", segments=4)  # mallet
    return m


def zurna():
    m = MeshBuilder("Zurna")
    m.limb((0, 0, 0.03), (0, -0.18, 0.62), 0.05, 0.03, "#d8a24a", segments=6)
    m.limb((0, -0.18, 0.62), (0, -0.3, 0.88), 0.03, 0.14, "#d8a24a", segments=8)  # flared bell
    return m


def arch():
    m = MeshBuilder("Arch")
    for side in (-1, 1):
        m.cylinder((1.1 * side, 0, 1.3), 0.1, 0.1, 2.6, "#ffffff", segments=6)
    for i in range(9):  # arc of flowers
        t = math.pi * i / 8
        x, z = math.cos(t) * 1.1, 2.6 + math.sin(t) * 0.7
        m.sphere((x, 0, z), 0.16, "#ff6fa5" if i % 2 == 0 else "#ffffff", segments=5, rings=3)
        m.sphere((x, 0.05, z - 0.08), 0.1, "#5fae6b", segments=4, rings=3)
    for side in (-1, 1):
        for h in (0.5, 1.2, 1.9):
            m.sphere((1.1 * side, 0, h), 0.14, "#ff6fa5", segments=5, rings=3)
    return m


def planter():
    m = MeshBuilder("Planter")
    m.cylinder((0, 0, 0.25), 0.4, 0.32, 0.5, "#b0553f", segments=8)
    m.sphere((0, 0, 0.7), 0.42, "#5fae6b", segments=7, rings=4)
    for i, color in enumerate(("#ff6fa5", "#ffd35a", "#ffffff", "#ff6fa5", "#ffd35a")):
        a = i * 1.26
        m.sphere((math.cos(a) * 0.28, math.sin(a) * 0.28, 0.9), 0.1, color, segments=4, rings=3)
    return m


def main():
    preview = "preview" in args_after_dashes()
    reset_scene()
    material = make_material("Toy")

    builders = [
        plaza(),
        dance_floor(),
        house("House_A", 5.0, 4.0, "#e6b88a", "#b3472f", "#7a4b3a"),
        house("House_B", 4.4, 5.2, "#c9806b", "#8f3a2c", "#f3e7d0"),
        house("House_C", 5.0, 3.6, "#e0a56f", "#b3472f", "#6b4a3a"),
        lamp(),
        banner("Banner_Gelin", "#e0457b"),
        banner("Banner_Damat", "#2f6fdb"),
        stage(),
        davul(),
        zurna(),
        arch(),
        planter(),
    ]
    objects = [b.build_object(material=material) for b in builders]

    names = {o.name for o in objects}
    missing = [n for n in REQUIRED if n not in names]
    total = sum(triangle_count(o) for o in objects)
    problems = []
    if missing:
        problems.append(f"missing pieces {missing}")
    if total > TRIANGLE_BUDGET:
        problems.append(f"{total} triangles exceeds budget {TRIANGLE_BUDGET}")
    for o in objects:
        low, high = world_bounds([o])
        if o.name.startswith("Floor") and abs(high.z) > 0.25:
            problems.append(f"{o.name} too thick")
        elif not o.name.startswith("Floor") and low.z < -0.01:
            problems.append(f"{o.name} below ground (z={low.z:.2f})")
    if problems:
        raise SystemExit("[courtyard] " + "; ".join(problems))

    path = os.path.join(MODELS_DIR, "courtyard.glb")
    size = export_glb(objects, path)
    per_piece = ", ".join(f"{o.name}:{triangle_count(o)}" for o in objects)
    print(f"[courtyard] {total} tris, {size / 1024:.1f} KB ({per_piece})")
    save_blend("courtyard.blend")

    if preview:
        previews = os.environ.get("PREVIEW_DIR", "/tmp")
        # lay the kit out for a review sheet
        for i, o in enumerate(objects[2:]):
            o.location = ((i % 6) * 6 - 14, -(i // 6) * 7, 0)
        render_preview(os.path.join(previews, "courtyard_kit.png"), (0, -34, 16), (0, -2, 1.5), ortho_scale=38, resolution=(1200, 560))


main()
