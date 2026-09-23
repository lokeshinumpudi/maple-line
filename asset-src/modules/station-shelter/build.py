"""Station shelter module for Maple Line platforms: timber posts, a sloping tin roof,
plank back wall, end panels and a slatted bench. Exports LOD0, LOD1 and a bench-seat
socket in one GLB. Origin is the footprint centre on the platform deck; the open front
faces Blender -Y (+Z in three.js), toward the track.

    blender -b --factory-startup --python-exit-code 1 \
      --python asset-src/modules/station-shelter/build.py -- \
      --out apps/game/public/models/modules/station-shelter.glb \
      --report asset-src/modules/station-shelter/report.json
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "lib"))
import maple_assets as ma  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
ARGS = ma.parse_args(
    {
        "out": os.path.join(ROOT, "apps/game/public/models/modules/station-shelter.glb"),
        "report": os.path.join(ROOT, "asset-src/modules/station-shelter/report.json"),
    }
)

WIDTH, DEPTH = 6.0, 2.2  # metres along the platform, and away from the track
FRONT_EAVE, BACK_EAVE = 2.78, 2.48
COLORS = {
    "timber": ma.hex_color("#6b4a32"),
    "timber-dark": ma.hex_color("#4d3524"),
    "plank": ma.hex_color("#8c6b49"),
    "plank-alt": ma.hex_color("#7f603f"),
    "roof": ma.hex_color("#7b3a2c"),
    "roof-edge": ma.hex_color("#5e2c22"),
    "bench": ma.hex_color("#a07e55"),
    "metal": ma.hex_color("#3b3f41"),
    "board": ma.hex_color("#ece5d2"),
    "board-frame": ma.hex_color("#2f4a43"),
}


class Parts:
    def __init__(self):
        self.bm = bmesh.new()
        self.colors = []

    def box(self, center, size, color, tilt_x=0.0):
        result = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = result["verts"]
        transform = (
            Matrix.Translation(Vector(center))
            @ Matrix.Rotation(tilt_x, 4, "X")
            @ Matrix.Diagonal(Vector((*size, 1.0)))
        )
        bmesh.ops.transform(self.bm, matrix=transform, verts=verts)
        faces = {f for v in verts for f in v.link_faces}
        for face in sorted(faces, key=lambda f: f.index):
            face.index = len(self.colors)
            self.colors.append(COLORS[color])

    def object(self, name, material):
        self.bm.faces.ensure_lookup_table()
        ordered = sorted(self.bm.faces, key=lambda f: f.index)
        colors = [self.colors[f.index] for f in ordered]
        for i, face in enumerate(ordered):
            face.index = i
        self.bm.faces.sort(key=lambda f: f.index)
        obj = ma.mesh_from_bmesh(name, self.bm, colors, material)
        for polygon in obj.data.polygons:
            polygon.use_smooth = False
        return obj


def roof_z(y):
    t = (y + DEPTH / 2 + 0.3) / (DEPTH + 0.6)
    return FRONT_EAVE + (BACK_EAVE - FRONT_EAVE) * t


def build_lod0():
    p = Parts()
    slope = math.atan2(FRONT_EAVE - BACK_EAVE, DEPTH + 0.6)
    roof_depth = (DEPTH + 0.6) / math.cos(slope)
    # Posts: front pair taller than the back pair so the roof sheds rain away from the track.
    for x in (-WIDTH / 2 + 0.2, WIDTH / 2 - 0.2):
        for y in (-DEPTH / 2 + 0.12, DEPTH / 2 - 0.12):
            top = roof_z(y) - 0.08
            p.box((x, y, top / 2), (0.13, 0.13, top), "timber-dark")
    # Middle posts at the back carry the wall.
    for x in (-WIDTH / 6, WIDTH / 6):
        top = roof_z(DEPTH / 2 - 0.12) - 0.08
        p.box((x, DEPTH / 2 - 0.12, top / 2), (0.11, 0.11, top), "timber-dark")
    # Beams under the roof, front and back.
    for y in (-DEPTH / 2 + 0.12, DEPTH / 2 - 0.12):
        p.box((0, y, roof_z(y) - 0.12), (WIDTH - 0.1, 0.14, 0.16), "timber")
    # Rafters across the depth.
    for i in range(7):
        x = -WIDTH / 2 + 0.2 + i * (WIDTH - 0.4) / 6
        p.box((x, 0, roof_z(0) - 0.03), (0.08, roof_depth, 0.07), "timber", tilt_x=-slope)
    # Tin roof: a thin sheet with raised ribs, and a darker fascia edge at the front.
    p.box((0, 0, roof_z(0) + 0.02), (WIDTH + 0.5, roof_depth, 0.04), "roof", tilt_x=-slope)
    for i in range(17):
        x = -WIDTH / 2 - 0.2 + i * (WIDTH + 0.4) / 16
        p.box((x, 0, roof_z(0) + 0.055), (0.035, roof_depth, 0.03), "roof-edge", tilt_x=-slope)
    p.box((0, -DEPTH / 2 - 0.3, roof_z(-DEPTH / 2 - 0.3) - 0.02), (WIDTH + 0.52, 0.04, 0.14), "roof-edge")
    # Back wall of horizontal boards, alternating tone.
    boards = 10
    wall_top = roof_z(DEPTH / 2 - 0.12) - 0.2
    for i in range(boards):
        h = (wall_top - 0.12) / boards
        p.box((0, DEPTH / 2 - 0.06, 0.12 + h * (i + 0.5)), (WIDTH - 0.3, 0.05, h * 0.94), "plank" if i % 2 else "plank-alt")
    # End panels from the back wall to the middle of the depth.
    for x in (-WIDTH / 2 + 0.2, WIDTH / 2 - 0.2):
        for i in range(boards):
            h = (wall_top - 0.12) / boards
            p.box((x, DEPTH / 4 - 0.06, 0.12 + h * (i + 0.5)), (0.05, DEPTH / 2 - 0.1, h * 0.94), "plank" if i % 2 else "plank-alt")
    # Bench: slatted seat and back on metal legs.
    seat_z, seat_y = 0.44, DEPTH / 2 - 0.42
    for i in range(4):
        p.box((0, seat_y - 0.15 + i * 0.1, seat_z), (4.6, 0.085, 0.035), "bench")
    for i in range(2):
        p.box((0, DEPTH / 2 - 0.14, 0.62 + i * 0.14), (4.6, 0.03, 0.09), "bench")
    for x in (-2.1, 0, 2.1):
        p.box((x, seat_y, seat_z / 2), (0.05, 0.36, seat_z), "metal")
    # Timetable board on the left end panel, facing the platform.
    p.box((-WIDTH / 2 + 0.26, DEPTH / 4 - 0.1, 1.55), (0.02, 0.62, 0.82), "board-frame")
    p.box((-WIDTH / 2 + 0.28, DEPTH / 4 - 0.1, 1.55), (0.02, 0.54, 0.74), "board")
    return p


def build_lod1():
    p = Parts()
    slope = math.atan2(FRONT_EAVE - BACK_EAVE, DEPTH + 0.6)
    roof_depth = (DEPTH + 0.6) / math.cos(slope)
    for x in (-WIDTH / 2 + 0.2, WIDTH / 2 - 0.2):
        y = -DEPTH / 2 + 0.12
        top = roof_z(y) - 0.08
        p.box((x, y, top / 2), (0.14, 0.14, top), "timber-dark")
    p.box((0, 0, roof_z(0) + 0.03), (WIDTH + 0.5, roof_depth, 0.07), "roof", tilt_x=-slope)
    wall_top = roof_z(DEPTH / 2 - 0.12) - 0.1
    p.box((0, DEPTH / 2 - 0.06, (wall_top + 0.12) / 2), (WIDTH - 0.3, 0.07, wall_top - 0.12), "plank")
    for x in (-WIDTH / 2 + 0.2, WIDTH / 2 - 0.2):
        p.box((x, DEPTH / 4 - 0.06, (wall_top + 0.12) / 2), (0.07, DEPTH / 2 - 0.1, wall_top - 0.12), "plank-alt")
    p.box((0, DEPTH / 2 - 0.35, 0.4), (4.6, 0.4, 0.1), "bench")
    return p


def main():
    ma.reset_scene()
    material = ma.vertex_color_material("station-shelter", roughness=0.78)
    lod0 = build_lod0().object("station-shelter.lod0", material)
    lod1 = build_lod1().object("station-shelter.lod1", material)
    ma.ambient_occlusion(lod0, samples=24, distance=2.2, strength=0.35)
    ma.ambient_occlusion(lod1, samples=16, distance=2.2, strength=0.3)
    socket = bpy.data.objects.new("socket.bench-seat-1", None)
    socket.location = (0, DEPTH / 2 - 0.42, 0.46)
    bpy.context.scene.collection.objects.link(socket)
    for obj in (lod0, lod1, socket):
        obj["kind"] = "station-shelter"
    lod0["footprintW"] = WIDTH + 0.5
    lod0["footprintD"] = DEPTH + 0.6
    lod0["lod"] = 0
    lod1["lod"] = 1
    os.makedirs(os.path.dirname(ARGS.out), exist_ok=True)
    ma.export_glb(ARGS.out, [lod0, lod1, socket])
    bounds = [lod0.matrix_world @ Vector(c) for c in lod0.bound_box]
    report = {
        "asset": "station-shelter",
        "blender": bpy.app.version_string,
        "lod0Triangles": ma.triangle_count(lod0),
        "lod1Triangles": ma.triangle_count(lod1),
        "materials": 1,
        "sockets": ["socket.bench-seat-1"],
        "sizeMetres": [round(max(b[i] for b in bounds) - min(b[i] for b in bounds), 3) for i in range(3)],
        "lowestZ": round(min(b.z for b in bounds), 4),
        "glbBytes": os.path.getsize(ARGS.out),
        "facing": "open front -Y in Blender, +Z in three.js",
    }
    ma.write_report(ARGS.report, report)
    if ARGS.render:
        os.makedirs(ARGS.render, exist_ok=True)
        lod1.hide_render = True
        ma.render_views(ARGS.render, (0, 0, 1.2), {"platform": ((3.5, -6.5, 1.7), 30), "cab": ((-9, -14, 3.2), 50)})
        lod1.hide_render = False
        lod0.hide_render = True
        ma.render_views(ARGS.render, (0, 0, 1.2), {"lod1": ((3.5, -6.5, 1.7), 30)})
    print("REPORT", report)


main()
