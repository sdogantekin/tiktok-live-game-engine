"""Shared helpers for building low-poly assets in Blender (run headless: blender -b --python <script>).

Style: flat-shaded, toy-like, vertex colours on a single shared material, so every mesh is one draw call
and no textures are needed. Units are metres, +Z is up in Blender (the glTF exporter converts to +Y up),
and every asset has its origin at ground level.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
MODELS_DIR = os.path.join(ROOT, "apps", "web", "public", "game-modes", "mahalle-halayi", "models")
BLEND_DIR = os.path.join(ROOT, "assets", "game-modes", "mahalle-halayi", "source-blend")


def srgb(hex_color):
    """'#rrggbb' -> RGBA floats for the vertex colour layer.

    The layer is a byte-colour attribute: Blender treats the values we write as sRGB and the glTF exporter
    converts them to linear (what glTF and three.js expect). So we write the plain 0..1 channels here;
    converting to linear ourselves would apply the conversion twice and make everything too dark.
    """
    value = hex_color.lstrip("#")
    return (*[int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4)], 1.0)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 24


def make_material(name="Toy"):
    """One shared material: base colour comes from the vertex colour layer."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "Col"
    links.new(attribute.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)  # the vertex colour supplies the real colour
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Metallic"].default_value = 0.0
    return material


class MeshBuilder:
    """Builds one mesh from primitives, painting vertex colours and (optionally) rigid bone weights."""

    def __init__(self, name, bones=()):
        self.name = name
        self.bm = bmesh.new()
        self.color = self.bm.loops.layers.color.new("Col")
        self.bones = list(bones)
        self.deform = self.bm.verts.layers.deform.verify() if self.bones else None

    def _matrix(self, center, rotation, scale):
        translation = Matrix.Translation(Vector(center))
        rotate = Euler([math.radians(a) for a in rotation], "XYZ").to_matrix().to_4x4()
        scaling = Matrix.Diagonal((*scale, 1.0))
        return translation @ rotate @ scaling

    def _paint(self, verts, color, bone):
        rgba = srgb(color) if isinstance(color, str) else color
        for vert in verts:
            for loop in vert.link_loops:
                loop[self.color] = rgba
            if bone is not None:
                vert[self.deform][self.bones.index(bone)] = 1.0

    def cylinder(self, center, r_bottom, r_top, height, color, bone=None, segments=8, rotation=(0, 0, 0), scale=(1, 1, 1), caps=True):
        result = bmesh.ops.create_cone(
            self.bm,
            cap_ends=caps,
            cap_tris=False,
            segments=segments,
            radius1=r_bottom,
            radius2=r_top,
            depth=height,
            matrix=self._matrix(center, rotation, scale),
        )
        self._paint(result["verts"], color, bone)

    def sphere(self, center, radius, color, bone=None, segments=8, rings=6, scale=(1, 1, 1)):
        result = bmesh.ops.create_uvsphere(
            self.bm,
            u_segments=segments,
            v_segments=rings,
            radius=radius,
            matrix=self._matrix(center, (0, 0, 0), scale),
        )
        self._paint(result["verts"], color, bone)

    def box(self, center, size, color, bone=None, rotation=(0, 0, 0)):
        result = bmesh.ops.create_cube(self.bm, size=1.0, matrix=self._matrix(center, rotation, size))
        self._paint(result["verts"], color, bone)

    def limb(self, start, end, r_start, r_end, color, bone=None, segments=6):
        """A tapered cylinder between two points."""
        a, b = Vector(start), Vector(end)
        direction = b - a
        length = direction.length
        rotation = Vector((0, 0, 1)).rotation_difference(direction).to_euler("XYZ")
        result = bmesh.ops.create_cone(
            self.bm,
            cap_ends=True,
            cap_tris=False,
            segments=segments,
            radius1=r_start,
            radius2=r_end,
            depth=length,
            matrix=Matrix.Translation((a + b) / 2) @ rotation.to_matrix().to_4x4(),
        )
        self._paint(result["verts"], color, bone)

    def paint_faces(self, faces, color_fn):
        """Gives each face its own colour (vertex colours are per face corner, so neighbouring faces can differ)."""
        for face in faces:
            rgba = color_fn(face)
            rgba = srgb(rgba) if isinstance(rgba, str) else rgba
            for loop in face.loops:
                loop[self.color] = rgba

    def grid(self, center, size_x, size_y, nx, ny, color_fn, bone=None):
        """A flat grid of nx*ny quads; color_fn(ix, iy) picks each quad's colour."""
        result = bmesh.ops.create_grid(
            self.bm, x_segments=nx, y_segments=ny, size=1.0, matrix=self._matrix(center, (0, 0, 0), (size_x / 2, size_y / 2, 1))
        )
        faces = [f for f in self.bm.faces if all(v in result["verts"] for v in f.verts)]

        def pick(face):
            c = face.calc_center_median()
            ix = int((c.x - center[0] + size_x / 2) / (size_x / nx))
            iy = int((c.y - center[1] + size_y / 2) / (size_y / ny))
            return color_fn(min(ix, nx - 1), min(iy, ny - 1))

        self.paint_faces(faces, pick)

    def build_object(self, collection=None, material=None):
        mesh = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        for face in self.bm.faces:
            face.smooth = False  # flat shading is the style
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        (collection or bpy.context.scene.collection).objects.link(obj)
        for bone in self.bones:
            obj.vertex_groups.new(name=bone)
        if material is not None:
            mesh.materials.append(material)
        # Make the painted layer the active/render colour attribute (used by the exporter and previews).
        layer = mesh.color_attributes.get("Col")
        if layer is not None:
            mesh.color_attributes.active_color = layer
            mesh.color_attributes.render_color_index = list(mesh.color_attributes).index(layer)
        return obj


def triangle_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def world_bounds(objs):
    """Axis-aligned bounds across objects in Blender coordinates: (min, max) as Vectors."""
    points = [obj.matrix_world @ Vector(corner) for obj in objs for corner in obj.bound_box]
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return low, high


def export_glb(objects, path, animations=False):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    options = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE",
        export_image_format="NONE",
        export_cameras=False,
        export_lights=False,
        export_skins=True,
        export_animations=animations,
        export_extras=False,
    )
    if animations:
        options.update(export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_optimize_animation_size=True)
    bpy.ops.export_scene.gltf(**options)
    return os.path.getsize(path)


def save_blend(name):
    os.makedirs(BLEND_DIR, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND_DIR, name), compress=True)


def render_preview(path, location, target, resolution=(540, 720), ortho_scale=None, frame=None):
    """Quick Workbench render showing vertex colours, for visual review."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.film_transparent = False
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "VERTEX"
    shading.show_shadows = True
    scene.world = scene.world or bpy.data.worlds.new("W")
    scene.world.color = (0.55, 0.5, 0.62)

    cam_data = bpy.data.cameras.new("cam")
    if ortho_scale:
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = ortho_scale
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = Vector(location)
    cam.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    if frame is not None:
        scene.frame_set(frame)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)


def args_after_dashes():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
