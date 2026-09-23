"""Riko's hand props for the VRM cast: the repaired transistor radio and her phone.

    blender -b --factory-startup --python-exit-code 1 \\
      --python asset-src/characters/concept-cast/props.py

Writes apps/game/public/models/characters/props/riko.glb. Each prop is one node in the
hand-socket frame the game uses (world/character-motion.js): origin in the palm, +Y from
the wrist toward the fingers (down, for a hanging hand), +Z out of the palm toward the
body. The radio hangs from its leather strap in the left hand; the painted radio sheet
(ref/radio-sheet.jpg) is mapped straight onto the case, each face from its own view.
Node extras (prop, hand, hold) tell the game which hand holds what.
"""

import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "lib"))
import maple_assets as ma  # noqa: E402

ROOT = os.path.join(HERE, "..", "..", "..")
OUT = os.path.join(ROOT, "apps/game/public/models/characters/props/riko.glb")
SHEET = os.path.join(HERE, "ref/radio-sheet.jpg")
# Regions of the radio sheet (1024 x 683, pixels, x0 y0 x1 y1): front, back, side, top.
REGIONS = {
    "front": (32, 146, 440, 401),
    "back": (632, 148, 986, 401),
    "side": (481, 146, 580, 401),
    "top": (256, 462, 760, 592),
}
# Case in socket space: length along x, height down +y, depth along z (front at -z).
LENGTH, HEIGHT, DEPTH = 0.17, 0.106, 0.044
TOP_Y = 0.05
Z_MID = 0.012


def material(name, color=None, image=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.8
    if image is not None:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = ma.hex_color(color)
    return mat


def region_uv(name, a, b, size):
    """(a, b) in 0..1 across the region -> image UV (v up)."""
    x0, y0, x1, y1 = REGIONS[name]
    w, h = size
    u = (x0 + a * (x1 - x0)) / w
    v = 1 - (y0 + b * (y1 - y0)) / h
    return u, v


def radio_case(sheet):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * LENGTH, TOP_Y + (v.co.y + 0.5) * HEIGHT, Z_MID + v.co.z * DEPTH))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.006, segments=2, affect="EDGES")
    uv = bm.loops.layers.uv.new("UVMap")
    size = (1024, 683)  # REGIONS are in full-sheet pixels; UVs are fractions of it
    x0, x1 = -LENGTH / 2, LENGTH / 2
    y0, y1 = TOP_Y, TOP_Y + HEIGHT
    z0, z1 = Z_MID - DEPTH / 2, Z_MID + DEPTH / 2
    for f in bm.faces:
        n = f.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            p = loop.vert.co
            a_x = (p.x - x0) / (x1 - x0)
            a_y = (p.y - y0) / (y1 - y0)
            a_z = (p.z - z0) / (z1 - z0)
            if axis == 2:  # front (-z) or back (+z)
                loop[uv].uv = region_uv("front", a_x, a_y, size) if n.z < 0 else region_uv("back", 1 - a_x, a_y, size)
            elif axis == 0:  # the ends: the side view
                loop[uv].uv = region_uv("side", a_z if n.x > 0 else 1 - a_z, a_y, size)
            else:  # top (small y) and bottom: wood from the top view
                loop[uv].uv = region_uv("top", a_x, 0.15 + 0.7 * a_z, size)
    return bm


def strap():
    """A flat leather strap arching from both ends of the case up through the palm."""
    bm = bmesh.new()
    n = 16
    half = LENGTH / 2 - 0.008
    rows = []
    for i in range(n + 1):
        t = i / n
        x = -half + 2 * half * t
        u = x / half
        y = TOP_Y + 0.004 - (TOP_Y + 0.004) * (1 - u * u) ** 0.9
        dx = 2 * half / n
        # Tangent for the strap's thickness direction.
        du = 2 / n
        dy = -(TOP_Y + 0.004) * 0.9 * (1 - u * u) ** -0.1 * (-2 * u) * du if abs(u) < 0.999 else 0.0
        tangent = Vector((dx, dy, 0)).normalized()
        normal = Vector((-tangent.y, tangent.x, 0))
        ring = []
        for sz, sn in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            ring.append(bm.verts.new(Vector((x, y, Z_MID)) + Vector((0, 0, sz * 0.007)) + normal * sn * 0.002))
        rows.append(ring)
    for a, b in zip(rows, rows[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    for cap in (rows[0], list(reversed(rows[-1]))):
        bm.faces.new(cap)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def to_object(bm, name, mats):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for m in mats:
        mesh.materials.append(m)
    return obj


def compact_sheet(path, out_path, width=512):
    """The radio sheet scaled down to `width` pixels for a small prop texture."""
    img = bpy.data.images.load(path)
    w, h = img.size
    img.scale(width, round(h * width / w))
    img.filepath_raw = out_path
    img.file_format = "JPEG"
    bpy.context.scene.render.image_settings.quality = 80
    img.save()
    return img


def build():
    ma.reset_scene()
    os.makedirs(os.path.join(HERE, "build"), exist_ok=True)
    sheet = compact_sheet(SHEET, os.path.join(HERE, "build", "radio-512.jpg"))
    case = to_object(radio_case(sheet), "radio", [material("radio-case", image=sheet)])
    for poly in case.data.polygons:
        poly.use_smooth = False
    band = to_object(strap(), "radio-strap", [material("radio-strap", "#7a4027")])
    for poly in band.data.polygons:
        poly.use_smooth = True
    bpy.ops.object.select_all(action="DESELECT")
    band.select_set(True)
    case.select_set(True)
    bpy.context.view_layer.objects.active = case
    bpy.ops.object.join()
    radio = bpy.context.view_layer.objects.active
    radio.name = "radio"
    radio["prop"], radio["hand"], radio["hold"] = "radio", "left", "one"
    # Phone: the same socket-space box as the older cast's phone, rounded.
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    lo, hi = Vector((-0.0145, -0.0172, 0.0079)), Vector((0.0608, 0.0262, 0.0256))
    for v in bm.verts:
        v.co = Vector(((lo[i] + hi[i]) / 2 + v.co[i] * (hi[i] - lo[i]) for i in range(3)))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.002, segments=1, affect="EDGES")
    phone = to_object(bm, "phone", [material("phone", "#30343f")])
    phone["prop"], phone["hand"], phone["hold"] = "phone", "right", "one"
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in (radio, phone):
        o.select_set(True)
    bpy.context.view_layer.objects.active = radio
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format="GLB", use_selection=True, export_yup=False, export_apply=True,
        export_extras=True, export_materials="EXPORT", export_image_format="JPEG", export_jpeg_quality=72,
        export_animations=False,
    )
    tris = {o.name: ma.triangle_count(o) for o in (radio, phone)}
    ma.write_report(os.path.join(HERE, "props.report.json"), {"out": "apps/game/public/models/characters/props/riko.glb", "triangles": tris, "blender": bpy.app.version_string})
    print("PROPS", tris, os.path.getsize(OUT))


build()
