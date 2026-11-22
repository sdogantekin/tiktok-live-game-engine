"""Builds the crowd figure: a tiny static toy person, exported as two meshes (CrowdBody, CrowdHead).

The runtime draws each as an InstancedMesh, so a whole team's crowd costs two draw calls. The body is
painted white so the per-instance colour tints it with the team colour; the head keeps its own colours.
Origin: feet on the ground, facing -Y in Blender (+Z in glTF).

Run:  blender -b --factory-startup --python build_crowd.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from assetlib import MODELS_DIR, MeshBuilder, export_glb, make_material, reset_scene, save_blend, triangle_count  # noqa: E402

TRIANGLE_BUDGET = 260  # per figure (body + head)


def main():
    reset_scene()
    material = make_material("Toy")

    body = MeshBuilder("CrowdBody")
    body.cylinder((0, 0, 0.36), 0.22, 0.17, 0.5, "#ffffff", segments=6)  # torso
    body.cylinder((0, 0, 0.06), 0.2, 0.2, 0.12, "#d8d8d8", segments=6)  # legs block, slightly darker
    for side in (-1, 1):
        body.limb((0.18 * side, 0, 0.55), (0.27 * side, 0, 0.34), 0.06, 0.05, "#ffffff", segments=4)

    head = MeshBuilder("CrowdHead")
    head.sphere((0, 0, 0.8), 0.2, "#e8bd98", segments=6, rings=4)
    head.sphere((0, 0.03, 0.88), 0.215, "#3b2a20", segments=6, rings=3, scale=(1, 0.9, 0.7))

    objects = [body.build_object(material=material), head.build_object(material=material)]
    tris = sum(triangle_count(o) for o in objects)
    if tris > TRIANGLE_BUDGET:
        raise SystemExit(f"[crowd] {tris} triangles exceeds budget {TRIANGLE_BUDGET}")
    size = export_glb(objects, os.path.join(MODELS_DIR, "crowd.glb"))
    print(f"[crowd] {tris} tris, {size / 1024:.1f} KB")
    save_blend("crowd.blend")


main()
