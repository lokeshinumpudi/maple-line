"""Aonuma village bus: a short rural Japanese route bus in cream with teal bands.

Parts in one GLB, all written in the game's vehicle frame (metres, +Y up, +Z forward,
origin on the ground under the middle of the wheelbase) and rotated into Blender's frame
just before export, as the Momiji EMU build does:

- `bus-body`        shell, windows, lamps, bumpers, destination sign and a simple interior:
                    floor, driver's seat and wheel, seven rows of seats, poles, light strips.
- `bus-door-front`  one leaf of the folding front door (left side, +X). The game draws it
                    twice: hinged at the front and back of the opening, swinging inward.
- `bus-wheel`       one wheel and tyre, drawn four times and turned with travel.

Materials are PBR with colour and baked occlusion in the 'Col' attribute. Four carry an
emissive colour the game switches on at night or while the bus waits: `bus-lamp`
(headlights), `bus-tail` (tail lamps), `bus-sign` (destination sign) and `bus-light`
(ceiling light strips). Glass is `bus-glass`.

    blender -b --factory-startup --python-exit-code 1 \\
      --python asset-src/vehicles/village-bus/build.py -- \\
      --out apps/game/public/models/vehicles/village-bus.glb \\
      --report asset-src/vehicles/village-bus/report.json
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
        "out": os.path.join(ROOT, "apps/game/public/models/vehicles/village-bus.glb"),
        "report": os.path.join(ROOT, "asset-src/vehicles/village-bus/report.json"),
    }
)

# Game frame (+X is the bus's left, the door side; +Y up; +Z forward) to Blender (x, -z, y).
# glTF export with +Y up turns it back, so a point written here lands at the same place in
# three.js.
TO_BLENDER = Matrix.Rotation(math.pi / 2, 4, "X")

# ---- Dimensions ---------------------------------------------------------------------------
HALF_LENGTH = 3.55  # 7.1 m body
HALF_WIDTH = 1.15  # 2.3 m body
SKIRT_Y = 0.32  # bottom of the side panels
BELT_Y = 1.32  # window sill
WINDOW_TOP = 2.34
SIDE_TOP = 2.62  # where the roof curve starts
ROOF_Y = 2.98
FLOOR_Y = 0.62
AXLES = (-2.05, 1.75)
WHEEL_RADIUS = 0.43
WHEEL_WIDTH = 0.26
WHEEL_X = 0.93
ARCH = 0.52  # wheel-arch radius
DOOR = (2.38, 3.26)  # front door opening along z, left side (+X)
DOOR_TOP = 2.34
STEP_Y = 0.36
WINDSCREEN = (1.2, 2.5)  # y range at the front face
LEFT_WINDOWS = [(-3.2, -2.35), (-2.25, -1.25), (-1.15, -0.15), (-0.05, 0.95), (1.05, 2.2)]
RIGHT_WINDOWS = [(-3.2, -2.35), (-2.25, -1.25), (-1.15, -0.15), (-0.05, 0.95), (1.05, 2.05), (2.15, 3.3)]

MATERIALS = [
    # name, roughness, metallic, coat, uses vertex colour
    ("bus-paint", 0.38, 0.0, 0.35, True),
    ("bus-trim", 0.7, 0.1, 0.0, True),
    ("bus-metal", 0.35, 0.8, 0.0, True),
    ("bus-glass", 0.05, 0.0, 0.0, False),
    ("bus-interior", 0.85, 0.0, 0.0, True),
    ("bus-seat", 0.95, 0.0, 0.0, True),
    ("bus-lamp", 0.2, 0.0, 0.0, False),
    ("bus-tail", 0.3, 0.0, 0.0, False),
    ("bus-sign", 0.5, 0.0, 0.0, False),
    ("bus-light", 0.5, 0.0, 0.0, False),
    ("bus-rubber", 0.9, 0.0, 0.0, True),
]
PAINT, TRIM, METAL, GLASS, INTERIOR, SEAT, LAMP, TAIL, SIGN, LIGHT, RUBBER = range(len(MATERIALS))
C = {
    "cream": ma.hex_color("#ece2c6"),
    "teal": ma.hex_color("#1f8a86"),
    "teal-dark": ma.hex_color("#146563"),
    "black": ma.hex_color("#1b1f1f"),
    "grey": ma.hex_color("#6f7775"),
    "steel": ma.hex_color("#aeb4b1"),
    "floor": ma.hex_color("#4d5552"),
    "lining": ma.hex_color("#d8d0bc"),
    "ceiling": ma.hex_color("#e9e4d6"),
    "seat": ma.hex_color("#2d3f73"),
    "seat-dark": ma.hex_color("#233160"),
    "tyre": ma.hex_color("#1d1d1d"),
    "hub": ma.hex_color("#c6c9c5"),
    "yellow": ma.hex_color("#d9b53a"),
    "white": (1.0, 1.0, 1.0, 1.0),
}


def build_materials():
    result = []
    for name, roughness, metallic, coat, vertex in MATERIALS:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if coat:
            bsdf.inputs["Coat Weight"].default_value = coat
            bsdf.inputs["Coat Roughness"].default_value = 0.08
        if vertex:
            attribute = material.node_tree.nodes.new("ShaderNodeVertexColor")
            attribute.layer_name = "Col"
            material.node_tree.links.new(attribute.outputs["Color"], bsdf.inputs["Base Color"])
        if name == "bus-glass":
            bsdf.inputs["Base Color"].default_value = (0.05, 0.08, 0.085, 1)
            bsdf.inputs["Alpha"].default_value = 0.3
            material.use_backface_culling = False
            if hasattr(material, "surface_render_method"):
                material.surface_render_method = "BLENDED"
        emissive = {
            "bus-lamp": ("#f4f0e4", "#fff1cf"),
            "bus-tail": ("#8e1f1a", "#ff3b25"),
            "bus-sign": ("#1b1c1a", "#ffb640"),
            "bus-light": ("#efe9da", "#fff4dc"),
        }.get(name)
        if emissive:
            bsdf.inputs["Base Color"].default_value = ma.hex_color(emissive[0])
            bsdf.inputs["Emission Color"].default_value = ma.hex_color(emissive[1])
            bsdf.inputs["Emission Strength"].default_value = 1.0
        result.append(material)
    return result


class Parts:
    """Faces with a material index and a colour, in the game frame."""

    def __init__(self):
        self.bm = bmesh.new()
        self.layer = self.bm.loops.layers.float_color.new("Col")

    def _paint(self, face, material, color):
        face.material_index = material
        for loop in face.loops:
            loop[self.layer] = color

    def quad(self, points, material, color, outward=None):
        face = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in points])
        face.normal_update()
        if outward is not None and face.normal.dot(Vector(outward)) < 0:
            face.normal_flip()
        self._paint(face, material, color)
        return face

    def box(self, center, size, material, color, bevel=0.0):
        before = set(self.bm.faces) if bevel else None
        verts = bmesh.ops.create_cube(self.bm, size=1.0)["verts"]
        bmesh.ops.transform(
            self.bm,
            matrix=Matrix.Translation(Vector(center)) @ Matrix.Diagonal(Vector((*size, 1.0))),
            verts=verts,
        )
        faces = list({f for v in verts for f in v.link_faces})
        if bevel:
            edges = list({e for v in verts for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=verts + edges, offset=bevel, segments=2, affect="EDGES", profile=0.5)
            faces = [f for f in self.bm.faces if f not in before]
        for face in faces:
            self._paint(face, material, color)

    def rod(self, a, b, radius, material, color, segments=8):
        a, b = Vector(a), Vector(b)
        axis = b - a
        rotation = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
        rings = [
            [
                self.bm.verts.new(a + rotation @ Vector((math.cos(2 * math.pi * i / segments) * radius, math.sin(2 * math.pi * i / segments) * radius, end)))
                for i in range(segments)
            ]
            for end in (0.0, axis.length)
        ]
        for i in range(segments):
            j = (i + 1) % segments
            self._paint(self.bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i])), material, color)
        self._paint(self.bm.faces.new(list(reversed(rings[0]))), material, color)
        self._paint(self.bm.faces.new(rings[1]), material, color)

    def slab(self, outline, holes, to3d, depth, material, color, back_material=None, back_color=None):
        """Flat plate: outline minus holes, `depth` thick along +w of to3d(u, v, w)."""
        loops_front, loops_back = [], []
        for loop in [outline, *holes]:
            loops_front.append([self.bm.verts.new(to3d(u, v, depth)) for u, v in loop])
            loops_back.append([self.bm.verts.new(to3d(u, v, 0.0)) for u, v in loop])
        normal = (to3d(0, 0, 1) - to3d(0, 0, 0)).normalized()
        for loops, sign, mat, col in ((loops_front, 1, material, color), (loops_back, -1, back_material, back_color)):
            edges = []
            for loop in loops:
                for i in range(len(loop)):
                    edges.append(self.bm.edges.new((loop[i], loop[(i + 1) % len(loop)])))
            filled = bmesh.ops.triangle_fill(self.bm, use_beauty=True, use_dissolve=False, edges=edges)
            for face in filled["geom"]:
                if not isinstance(face, bmesh.types.BMFace):
                    continue
                face.normal_update()
                if face.normal.dot(normal) * sign < 0:
                    face.normal_flip()
                self._paint(face, material if mat is None else mat, color if col is None else col)
        for index, (front, back) in enumerate(zip(loops_front, loops_back)):
            n = len(front)
            for i in range(n):
                j = (i + 1) % n
                face = self.bm.faces.new((back[i], back[j], front[j], front[i]))
                self._paint(face, TRIM if index else material, C["black"] if index else color)

    def mesh(self, name, materials, smooth_angle=32):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=0.0004)
        bmesh.ops.transform(self.bm, matrix=TO_BLENDER, verts=self.bm.verts)
        mesh = bpy.data.meshes.new(name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for material in materials:
            mesh.materials.append(material)
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        mesh.set_sharp_from_angle(angle=math.radians(smooth_angle))
        mesh.color_attributes.active_color = mesh.color_attributes["Col"]
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def arc(cu, cv, r, a0, a1, steps=8):
    return [(cu + math.cos(a0 + (a1 - a0) * i / steps) * r, cv + math.sin(a0 + (a1 - a0) * i / steps) * r) for i in range(steps + 1)]


def rrect(cu, cv, w, h, r, segments=3):
    r = min(r, w / 2, h / 2)
    points = []
    for corner, (du, dv) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        ccu, ccv = cu + du * (w / 2 - r), cv + dv * (h / 2 - r)
        start = corner * math.pi / 2
        for s in range(segments + 1):
            a = start + (math.pi / 2) * s / segments
            points.append((ccu + math.cos(a) * r, ccv + math.sin(a) * r))
    return points


def roof_profile(steps=8):
    """Right half of the roof cross-section (x, y) from the side top to the centre."""
    points = []
    for i in range(steps + 1):
        t = i / steps
        a = t * math.pi / 2
        # A quarter superellipse: tight at the cantrail, flat on top.
        x = HALF_WIDTH * math.cos(a) ** 0.55
        y = SIDE_TOP + (ROOF_Y - SIDE_TOP) * math.sin(a) ** 0.8
        points.append((x, y))
    return points


def cross_section():
    """Full outline of the front or rear face (x, y), counter-clockwise from bottom left."""
    right = roof_profile()
    left = [(-x, y) for x, y in reversed(right)]
    return [(-HALF_WIDTH, SKIRT_Y), (HALF_WIDTH, SKIRT_Y)] + right + left[1:]


def side_outline(door):
    """Side panel outline (u = z, v = y): bottom edge with wheel arches and the door notch."""
    points = [(-HALF_LENGTH, SKIRT_Y)]
    for axle in AXLES:
        points.append((axle - ARCH, SKIRT_Y))
        points += arc(axle, SKIRT_Y + 0.12, ARCH, math.pi, 0, 10)[1:-1]
        points.append((axle + ARCH, SKIRT_Y))
    if door:
        points += [(DOOR[0], SKIRT_Y), (DOOR[0], DOOR_TOP), (DOOR[1], DOOR_TOP), (DOOR[1], SKIRT_Y)]
    points += [(HALF_LENGTH, SKIRT_Y), (HALF_LENGTH, SIDE_TOP), (-HALF_LENGTH, SIDE_TOP)]
    return points


def build_body(materials):
    p = Parts()
    skin = 0.03
    # Sides. The left side (+X) carries the door; the right side the driver's window.
    for sx, windows, door in ((1, LEFT_WINDOWS, True), (-1, RIGHT_WINDOWS, False)):
        holes = [rrect((a + b) / 2, (BELT_Y + WINDOW_TOP) / 2, b - a, WINDOW_TOP - BELT_Y, 0.07) for a, b in windows]
        x0 = sx * (HALF_WIDTH - skin)

        def to3d(u, v, w, x0=x0, sx=sx):
            return Vector((x0 + sx * w, v, u))

        p.slab(side_outline(door), holes, to3d, skin, PAINT, C["cream"], INTERIOR, C["lining"])
        # Glass set a little inside the skin.
        for a, b in windows:
            gx = sx * (HALF_WIDTH - skin - 0.012)
            p.quad([(gx, BELT_Y, a), (gx, BELT_Y, b), (gx, WINDOW_TOP, b), (gx, WINDOW_TOP, a)], GLASS, C["white"], outward=(sx, 0, 0))
        # Teal bands: a deep skirt band and two thin lines under the windows, as decals.
        ox = sx * (HALF_WIDTH + 0.004)

        def band(y0, y1, color, z0=-HALF_LENGTH, z1=HALF_LENGTH):
            spans = [(z0, z1)]
            cuts = [(axle - ARCH, axle + ARCH) for axle in AXLES]
            if door:
                cuts.append(DOOR)
            for c0, c1 in cuts:
                next_spans = []
                for s0, s1 in spans:
                    if c1 <= s0 or c0 >= s1:
                        next_spans.append((s0, s1))
                        continue
                    if c0 > s0:
                        next_spans.append((s0, c0))
                    if c1 < s1:
                        next_spans.append((c1, s1))
                spans = next_spans
            for s0, s1 in spans:
                # Over a wheel arch the band only runs above the arch top.
                p.quad([(ox, y0, s0), (ox, y0, s1), (ox, y1, s1), (ox, y1, s0)], PAINT, color, outward=(sx, 0, 0))

        band(0.72, 0.98, C["teal"])
        band(1.05, 1.12, C["teal"])
        band(1.17, 1.21, C["teal-dark"])
        # Rub strip along the bottom.
        p.box((sx * (HALF_WIDTH + 0.01), SKIRT_Y + 0.05, 0), (0.03, 0.1, 2 * HALF_LENGTH - 0.1), RUBBER, C["black"])
        # Mirror arm and mirror at the front corner.
        p.rod((sx * HALF_WIDTH, 2.1, HALF_LENGTH - 0.12), (sx * (HALF_WIDTH + 0.28), 2.2, HALF_LENGTH + 0.12), 0.018, METAL, C["black"])
        p.box((sx * (HALF_WIDTH + 0.3), 1.95, HALF_LENGTH + 0.14), (0.06, 0.34, 0.2), TRIM, C["black"])

    # Front and rear faces.
    for sz in (1, -1):
        z0 = sz * (HALF_LENGTH - skin)

        def face3d(u, v, w, z0=z0, sz=sz):
            return Vector((u * sz, v, z0 + sz * w))

        outline = cross_section()
        if sz < 0:
            outline = [(-u, v) for u, v in outline]
            outline.reverse()
        if sz > 0:
            screen = rrect(0, (WINDSCREEN[0] + WINDSCREEN[1]) / 2, 2.1, WINDSCREEN[1] - WINDSCREEN[0], 0.1)
            sign = rrect(0, 2.7, 1.5, 0.26, 0.03)
            holes = [screen, sign]
        else:
            holes = [rrect(0, 1.95, 1.7, 0.7, 0.08)]
        holes = [[(u * sz, v) for u, v in hole] for hole in holes]
        p.slab(outline, holes, face3d, skin, PAINT, C["cream"], INTERIOR, C["lining"])
        oz = sz * (HALF_LENGTH + 0.004)
        # Teal lower face with the lamp band.
        p.quad([(-HALF_WIDTH, SKIRT_Y, oz), (HALF_WIDTH, SKIRT_Y, oz), (HALF_WIDTH, 1.12, oz), (-HALF_WIDTH, 1.12, oz)], PAINT, C["teal"], outward=(0, 0, sz))
        p.box((0, 0.36, sz * (HALF_LENGTH + 0.06)), (2 * HALF_WIDTH + 0.02, 0.24, 0.12), RUBBER, C["black"], bevel=0.02)
        if sz > 0:
            gz = HALF_LENGTH - skin - 0.012
            p.quad([(-1.05, WINDSCREEN[0], gz), (1.05, WINDSCREEN[0], gz), (1.05, WINDSCREEN[1], gz), (-1.05, WINDSCREEN[1], gz)], GLASS, C["white"], outward=(0, 0, 1))
            # Destination sign behind its opening, and the headlamps in dark housings.
            p.quad([(-0.75, 2.57, gz), (0.75, 2.57, gz), (0.75, 2.83, gz), (-0.75, 2.83, gz)], SIGN, C["white"], outward=(0, 0, 1))
            for sx in (1, -1):
                p.box((sx * 0.78, 0.8, HALF_LENGTH + 0.02), (0.44, 0.24, 0.05), TRIM, C["black"], bevel=0.015)
                p.box((sx * 0.86, 0.8, HALF_LENGTH + 0.05), (0.2, 0.16, 0.03), LAMP, C["white"])
                p.box((sx * 0.64, 0.8, HALF_LENGTH + 0.05), (0.12, 0.12, 0.03), LAMP, C["white"])
                p.box((sx * 1.02, 0.8, HALF_LENGTH + 0.05), (0.06, 0.1, 0.03), TAIL, C["white"])
            # Wipers.
            for sx in (0.5, -0.5):
                p.rod((sx, WINDSCREEN[0] + 0.05, HALF_LENGTH + 0.02), (sx - 0.35, WINDSCREEN[0] + 0.62, HALF_LENGTH + 0.02), 0.012, TRIM, C["black"])
        else:
            gz = -(HALF_LENGTH - skin - 0.012)
            p.quad([(-0.85, 1.6, gz), (0.85, 1.6, gz), (0.85, 2.3, gz), (-0.85, 2.3, gz)], GLASS, C["white"], outward=(0, 0, -1))
            for sx in (1, -1):
                p.box((sx * 0.92, 0.95, -(HALF_LENGTH + 0.03)), (0.2, 0.34, 0.04), TAIL, C["white"])
    # Roof: the curved part, extruded along the length.
    profile = roof_profile()
    full = [(-x, y) for x, y in reversed(profile)] + profile[1:]
    zs = [-HALF_LENGTH + 0.002, HALF_LENGTH - 0.002]
    for i in range(len(full) - 1):
        (xa, ya), (xb, yb) = full[i], full[i + 1]
        p.quad([(xa, ya, zs[0]), (xb, yb, zs[0]), (xb, yb, zs[1]), (xa, ya, zs[1])], PAINT, C["cream"], outward=((xa + xb) / 2, 1, 0))
        # Ceiling inside, a little lower.
        p.quad([(xa * 0.97, ya - 0.04, zs[0]), (xb * 0.97, yb - 0.04, zs[0]), (xb * 0.97, yb - 0.04, zs[1]), (xa * 0.97, ya - 0.04, zs[1])], INTERIOR, C["ceiling"], outward=(-(xa + xb) / 2, -1, 0))
    # A roof-top air conditioner pod.
    p.box((0, ROOF_Y + 0.12, -0.6), (1.3, 0.22, 2.2), TRIM, C["grey"], bevel=0.05)
    # Underbody and wheel-arch liners.
    p.box((0, SKIRT_Y + 0.02, 0), (2 * HALF_WIDTH - 0.1, 0.06, 2 * HALF_LENGTH - 0.1), TRIM, C["black"])
    for axle in AXLES:
        for sx in (1, -1):
            points = arc(axle, SKIRT_Y + 0.12, ARCH - 0.02, math.pi, 0, 10)
            for (za, ya), (zb, yb) in zip(points, points[1:]):
                x0, x1 = sx * (HALF_WIDTH - 0.03), sx * (HALF_WIDTH - 0.34)
                p.quad([(x0, ya, za), (x0, yb, zb), (x1, yb, zb), (x1, ya, za)], TRIM, C["black"], outward=(0, -1, 0))
    build_interior(p)
    return p.mesh("bus-body", materials)


def build_interior(p):
    # Floor, a step well at the door and the rear platform.
    p.box((0, FLOOR_Y - 0.03, 0), (2 * HALF_WIDTH - 0.08, 0.06, 2 * HALF_LENGTH - 0.08), INTERIOR, C["floor"])
    p.box(((HALF_WIDTH - 0.3), STEP_Y, sum(DOOR) / 2), (0.5, 0.05, DOOR[1] - DOOR[0] - 0.04), METAL, C["yellow"])
    p.box((0, FLOOR_Y + 0.12, -3.0), (2 * HALF_WIDTH - 0.1, 0.24, 1.0), INTERIOR, C["floor"])
    # Driver's cab on the right (-X): seat, wheel, dashboard, fare box by the door.
    p.box((-0.55, 1.05, 2.72), (0.5, 0.12, 0.5), SEAT, C["seat-dark"], bevel=0.03)
    p.box((-0.55, 1.4, 2.5), (0.5, 0.6, 0.1), SEAT, C["seat-dark"], bevel=0.03)
    p.box((0, 1.12, 3.3), (2 * HALF_WIDTH - 0.1, 0.5, 0.36), TRIM, C["black"], bevel=0.04)
    points = [(-0.55 + math.cos(2 * math.pi * i / 16) * 0.2, 1.45 + math.sin(2 * math.pi * i / 16) * 0.2 * 0.6, 3.05 + math.sin(2 * math.pi * i / 16) * 0.2 * 0.4) for i in range(17)]
    for a, b in zip(points, points[1:]):
        p.rod(a, b, 0.016, TRIM, C["black"], segments=6)
    p.rod((-0.55, 1.12, 3.2), (-0.55, 1.45, 3.05), 0.03, TRIM, C["black"])
    p.box((0.1, 1.0, 2.25), (0.28, 0.8, 0.3), METAL, C["grey"], bevel=0.03)
    # Seats: double seats on the right, single seats on the left behind the door, a rear bench.
    rows = [-2.1, -1.35, -0.6, 0.15, 0.9, 1.65]
    for z in rows:
        seat(p, -0.62, z, 0.84)
    for z in rows[:-1]:
        seat(p, 0.74, z, 0.52)
    for x in (-0.7, 0.0, 0.7):
        seat(p, x, -3.05, 0.7, raised=0.24)
    # Poles and grab rails.
    for x, z in ((0.45, 2.15), (0.45, 0.55), (0.45, -1.0), (-0.2, 2.3)):
        p.rod((x, FLOOR_Y, z), (x, 2.55, z), 0.018, METAL, C["yellow"])
    for sx in (1, -1):
        p.rod((sx * 0.35, 2.4, -3.2), (sx * 0.35, 2.4, 2.4), 0.014, METAL, C["steel"])
        # Ceiling light strips over each row of seats.
        p.box((sx * 0.62, 2.63, -0.4), (0.16, 0.025, 5.2), LIGHT, C["white"])


def seat(p, x, z, width, raised=0.0):
    base = FLOOR_Y + raised
    p.box((x, base + 0.44, z), (width, 0.1, 0.46), SEAT, C["seat"], bevel=0.03)
    p.box((x, base + 0.8, z - 0.21), (width, 0.66, 0.09), SEAT, C["seat"], bevel=0.03)
    p.box((x, base + 0.2, z), (width * 0.3, 0.4, 0.3), METAL, C["grey"])
    p.rod((x - width / 2 + 0.03, base + 1.16, z - 0.24), (x + width / 2 - 0.03, base + 1.16, z - 0.24), 0.016, METAL, C["steel"])


def build_door_leaf(materials):
    """One leaf of the folding door, hinge on the origin, closed across +Z (0.44 m)."""
    p = Parts()
    width = (DOOR[1] - DOOR[0]) / 2 - 0.01
    height = DOOR_TOP - STEP_Y - 0.02
    y0 = STEP_Y + 0.01

    def to3d(u, v, w):
        return Vector((w - 0.015, y0 + v, u))

    outline = [(0, 0), (width, 0), (width, height), (0, height)]
    glass = rrect(width / 2, height * 0.62, width - 0.12, height * 0.62, 0.04)
    p.slab(outline, [glass], to3d, 0.03, PAINT, C["cream"], PAINT, C["cream"])
    p.quad([(0.0, y0 + height * 0.31, 0.06), (0.0, y0 + height * 0.31, width - 0.06), (0.0, y0 + height * 0.93, width - 0.06), (0.0, y0 + height * 0.93, 0.06)], GLASS, C["white"], outward=(1, 0, 0))
    p.box((0.018, y0 + 0.25, width / 2), (0.01, 0.2, width - 0.06), PAINT, C["teal"])
    p.rod((-0.03, y0 + 0.5, width - 0.06), (-0.03, y0 + 1.2, width - 0.06), 0.012, METAL, C["steel"])
    return p.mesh("bus-door-front", materials)


def build_wheel(materials):
    p = Parts()
    segments = 20
    r, hw = WHEEL_RADIUS, WHEEL_WIDTH / 2
    for ring in range(segments):
        a0 = 2 * math.pi * ring / segments
        a1 = 2 * math.pi * (ring + 1) / segments

        def pt(a, x, radius):
            return (x, math.sin(a) * radius, math.cos(a) * radius)

        p.quad([pt(a0, -hw, r), pt(a1, -hw, r), pt(a1, hw, r), pt(a0, hw, r)], RUBBER, C["tyre"], outward=(0, math.sin(a0), math.cos(a0)))
        for sx in (1, -1):
            p.quad([pt(a0, sx * hw, r), pt(a1, sx * hw, r), pt(a1, sx * hw, r * 0.62), pt(a0, sx * hw, r * 0.62)], RUBBER, C["tyre"], outward=(sx, 0, 0))
            p.quad([pt(a0, sx * (hw - 0.03), r * 0.62), pt(a1, sx * (hw - 0.03), r * 0.62), (sx * (hw - 0.05), 0, 0)], METAL, C["hub"], outward=(sx, 0, 0))
    for sx in (1, -1):
        for i in range(6):
            a = 2 * math.pi * i / 6
            p.box((sx * (hw - 0.02), math.sin(a) * 0.12, math.cos(a) * 0.12), (0.03, 0.035, 0.035), METAL, C["grey"])
    return p.mesh("bus-wheel", materials)


def main():
    ma.reset_scene()
    materials = build_materials()
    body = build_body(materials)
    leaf = build_door_leaf(materials)
    wheel = build_wheel(materials)
    for obj, distance, strength in ((body, 1.1, 0.5), (leaf, 0.3, 0.25), (wheel, 0.3, 0.35)):
        ma.ambient_occlusion(obj, samples=16, distance=distance, strength=strength)
    layout = {
        "halfLength": HALF_LENGTH,
        "halfWidth": HALF_WIDTH,
        "axles": list(AXLES),
        "wheelRadius": WHEEL_RADIUS,
        "wheelX": WHEEL_X,
        "door": list(DOOR),
        "doorX": HALF_WIDTH - 0.03,
        "floorY": FLOOR_Y,
        "stepY": STEP_Y,
        "roofY": ROOF_Y,
    }
    body["kind"] = "village-bus"
    for key, value in layout.items():
        body[key] = value
    leaf["kind"] = "village-bus-door-leaf"
    wheel["kind"] = "village-bus-wheel"
    parts = [body, leaf, wheel]
    os.makedirs(os.path.dirname(ARGS.out), exist_ok=True)
    ma.export_glb(ARGS.out, parts, apply=False)

    def bounds(obj):
        corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        game = [Vector((c.x, c.z, -c.y)) for c in corners]
        return [[round(min(c[i] for c in game), 3) for i in range(3)], [round(max(c[i] for c in game), 3) for i in range(3)]]

    triangles = {obj.name: ma.triangle_count(obj) for obj in parts}
    report = {
        "asset": "village-bus",
        "blender": bpy.app.version_string,
        "parts": triangles,
        "busTriangles": triangles["bus-body"] + 2 * triangles["bus-door-front"] + 4 * triangles["bus-wheel"],
        "materials": [m[0] for m in MATERIALS],
        "bounds": {obj.name: bounds(obj) for obj in parts},
        "layout": layout,
        "glbBytes": os.path.getsize(ARGS.out),
        "facing": "front at +Z in three.js (Blender -Y); door on the left, +X",
    }
    ma.write_report(ARGS.report, report)
    if ARGS.render:
        os.makedirs(ARGS.render, exist_ok=True)
        # Review renders in the Blender frame: the bus front faces -Y there.
        ma.render_views(
            ARGS.render,
            (0, 0, 1.4),
            {
                "front-left": ((6.5, -8.5, 2.4), 35),
                "rear-right": ((-6.0, 7.5, 2.8), 35),
                "door": ((4.0, -3.5, 1.4), 28),
            },
            resolution=(800, 600),
        )
    print("REPORT", report)


main()
