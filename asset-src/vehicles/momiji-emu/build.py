"""Momiji EMU: the five-car local train, rebuilt as Blender parts with PBR materials.

The game assembles five cars from five parts in one GLB:

- `car-cab`     body for a driving car, cab at +Z (three.js). The rear car uses it turned 180°.
- `car-middle`  body for a middle car, gangways at both ends.
- `door-leaf`   one sliding leaf, symmetric, drawn 16 times per car as instances.
- `wheelset`    axle and two wheels, drawn 4 times per car and rotated with travel.
- `pantograph`  single-arm pantograph for the first two cars, raised to the contact wire.

All geometry is written in the game's car frame (metres, +Y up, +Z forward, origin at the
car centre on the track line, railhead at y 0.315) and rotated into Blender's frame just
before export, so the numbers below match `apps/game/src/train/train.js` directly.

    blender -b --factory-startup --python-exit-code 1 \
      --python asset-src/vehicles/momiji-emu/build.py -- \
      --out apps/game/public/models/vehicles/momiji-emu.glb \
      --report asset-src/vehicles/momiji-emu/report.json
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
        "out": os.path.join(ROOT, "apps/game/public/models/vehicles/momiji-emu.glb"),
        "report": os.path.join(ROOT, "asset-src/vehicles/momiji-emu/report.json"),
    },
    {"--contact-height": {"type": float, "default": 7.35}},
)

# Game frame (x right, y up, z forward) to Blender frame (x, -z, y). glTF export with +Y up
# turns it back, so a point written here lands at the same coordinates in three.js.
TO_BLENDER = Matrix.Rotation(math.pi / 2, 4, "X")

# ---- Dimensions shared with the procedural train (train.js) -----------------------------
HALF_LENGTH = 6.2  # car body 12.4 m; cars are 13.5 m apart (consist.js)
SKIN_X = 1.5  # outer face of the side wall
SKIN = 0.025  # sheet thickness
END_RADIUS = 0.15  # plan-view rounding where the side meets the end
FLOOR_Y = 1.10  # door sill and floor top
BAND_LOW, BAND_HIGH = 2.05, 2.15  # vermilion below, ochre stripe, ivory above
ROOF_TOP = 3.77
SIDE_TOP = 3.25  # the flat side ends here; the cantrail curve starts
DOOR_CENTRES = (-4.59, 4.59)
DOOR_HALF = 0.65
DOOR_TOP = 3.2
LEAF_HALF = 0.33
LEAF_X = 1.46
LEAF_SLIDE = 0.64
WINDOW_CENTRES = (-2.64, -0.88, 0.88, 2.64)
WINDOW_HALF = 0.65
WINDOW_Y = (2.30, 3.14)
BOGIE_CENTRES = (-4.18, 4.18)
AXLE_OFFSET = 0.86
WHEEL_RADIUS = 0.46
WHEEL_Y = 0.315 + WHEEL_RADIUS
WHEEL_X = 0.97  # tread centre over the rails at ±0.96
WINDSCREEN_Z = HALF_LENGTH - 0.012
PANTOGRAPH_Z = 0.25

# ---- Materials ----------------------------------------------------------------------------
# Colour and baked ambient occlusion live in the 'Col' attribute; each material sets its own
# roughness, metalness and coat. Order is the material index used by every part.
MATERIALS = [
    # name, roughness, metallic, coat, uses vertex colour
    ("train-paint", 0.4, 0.0, 0.3, True),
    ("train-roof", 0.72, 0.05, 0.0, True),
    ("train-metal", 0.55, 0.55, 0.0, True),
    ("train-bright", 0.26, 1.0, 0.0, True),
    ("train-rubber", 0.86, 0.0, 0.0, True),
    ("train-glass", 0.04, 0.0, 0.0, False),
    ("train-lining", 0.82, 0.0, 0.0, False),
    ("train-sign", 0.5, 0.0, 0.0, False),
]
PAINT, ROOF, METAL, BRIGHT, RUBBER, GLASS, LINING, SIGN = range(len(MATERIALS))
C = {
    "red": ma.hex_color("#8e3228"),
    "cream": ma.hex_color("#e3d7b3"),
    "gold": ma.hex_color("#d3b46b"),
    "mask": ma.hex_color("#1a1e1d"),
    "roof": ma.hex_color("#626a66"),
    "roof-dark": ma.hex_color("#4f5653"),
    "steel": ma.hex_color("#3e4644"),
    "steel-light": ma.hex_color("#5d6663"),
    "rust": ma.hex_color("#34302c"),
    "tread": ma.hex_color("#9aa09c"),
    "bright": ma.hex_color("#c3c8c4"),
    "rubber": ma.hex_color("#222725"),
    "insulator": ma.hex_color("#d8cfb4"),
    "carbon": ma.hex_color("#2c2c2c"),
    "white": (1.0, 1.0, 1.0, 1.0),
}


def build_materials():
    result = []
    for name, roughness, metallic, coat, vertex in MATERIALS:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        nodes = material.node_tree.nodes
        bsdf = nodes.get("Principled BSDF")
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if coat:
            bsdf.inputs["Coat Weight"].default_value = coat
            bsdf.inputs["Coat Roughness"].default_value = 0.06
        if vertex:
            attribute = nodes.new("ShaderNodeVertexColor")
            attribute.layer_name = "Col"
            material.node_tree.links.new(attribute.outputs["Color"], bsdf.inputs["Base Color"])
        if name == "train-glass":
            bsdf.inputs["Base Color"].default_value = (0.05, 0.085, 0.085, 1)
            bsdf.inputs["Alpha"].default_value = 0.34
            material.use_backface_culling = False
            if hasattr(material, "surface_render_method"):
                material.surface_render_method = "BLENDED"
        if name == "train-lining":
            bsdf.inputs["Base Color"].default_value = ma.hex_color("#cfc8b6")
        if name == "train-sign":
            bsdf.inputs["Base Color"].default_value = ma.hex_color("#eddba6")
            bsdf.inputs["Emission Color"].default_value = ma.hex_color("#e5c584")
            bsdf.inputs["Emission Strength"].default_value = 0.3
        result.append(material)
    return result


# ---- Geometry builder in the game frame ---------------------------------------------------
class Parts:
    """Collects faces with a material index and a colour, in game coordinates."""

    def __init__(self):
        self.bm = bmesh.new()
        self.layer = self.bm.loops.layers.float_color.new("Col")

    def face(self, points, material, color, outward=None):
        verts = [self.bm.verts.new(Vector(p)) for p in points]
        face = self.bm.faces.new(verts)
        face.normal_update()
        if outward is not None and face.normal.dot(Vector(outward)) < 0:
            face.normal_flip()
        self._paint(face, material, color)
        return face

    def _paint(self, face, material, color):
        face.material_index = material
        for loop in face.loops:
            loop[self.layer] = color

    def box(self, center, size, material, color, bevel=0.0):
        before = set(self.bm.faces) if bevel else None
        result = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = result["verts"]
        bmesh.ops.transform(
            self.bm,
            matrix=Matrix.Translation(Vector(center)) @ Matrix.Diagonal(Vector((*size, 1.0))),
            verts=verts,
        )
        faces = list({f for v in verts for f in v.link_faces})
        if bevel:
            edges = list({e for v in verts for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=verts + edges, offset=bevel, segments=1, affect="EDGES", profile=0.5)
            # Bevel rebuilds the box faces; paint everything that did not exist before.
            faces = [f for f in self.bm.faces if f not in before]
        for face in faces:
            self._paint(face, material, color)

    def rod(self, a, b, radius, material, color, segments=8, caps=True):
        a, b = Vector(a), Vector(b)
        axis = b - a
        length = axis.length
        rotation = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
        ring = []
        for end in (0.0, length):
            ring.append(
                [
                    self.bm.verts.new(
                        a
                        + rotation
                        @ Vector(
                            (
                                math.cos(2 * math.pi * i / segments) * radius,
                                math.sin(2 * math.pi * i / segments) * radius,
                                end,
                            )
                        )
                    )
                    for i in range(segments)
                ]
            )
        for i in range(segments):
            j = (i + 1) % segments
            face = self.bm.faces.new((ring[0][i], ring[0][j], ring[1][j], ring[1][i]))
            self._paint(face, material, color)
        if caps:
            self._paint(self.bm.faces.new(list(reversed(ring[0]))), material, color)
            self._paint(self.bm.faces.new(ring[1]), material, color)

    def cylinder_x(self, center, radius, length, material, color, segments=12):
        x, y, z = center
        self.rod((x - length / 2, y, z), (x + length / 2, y, z), radius, material, color, segments)

    def cylinder_y(self, center, radius, length, material, color, segments=12):
        x, y, z = center
        self.rod((x, y - length / 2, z), (x, y + length / 2, z), radius, material, color, segments)

    def cylinder_z(self, center, radius, length, material, color, segments=12):
        x, y, z = center
        self.rod((x, y, z - length / 2), (x, y, z + length / 2), radius, material, color, segments)

    def slab(self, outline, holes, to3d, depth, material, color, back_material=None, rim_material=None):
        """A flat plate: filled outline minus holes, `depth` thick along +w of to3d(u, v, w)."""
        loops_front, loops_back = [], []
        for loop in [outline, *holes]:
            loops_front.append([self.bm.verts.new(to3d(u, v, depth)) for u, v in loop])
            loops_back.append([self.bm.verts.new(to3d(u, v, 0.0)) for u, v in loop])
        normal = (to3d(0, 0, 1) - to3d(0, 0, 0)).normalized()
        for loops, sign, mat in ((loops_front, 1, material), (loops_back, -1, back_material)):
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
                self._paint(face, material if mat is None else mat, color)
        for index, (front, back) in enumerate(zip(loops_front, loops_back)):
            loop = [outline, *holes][index]
            n = len(loop)
            area = sum(loop[i][0] * loop[(i + 1) % n][1] - loop[(i + 1) % n][0] * loop[i][1] for i in range(n))
            # Outline rims face out of the plate; hole rims face into the hole.
            sign = (1 if area > 0 else -1) * (1 if index == 0 else -1)
            for i in range(n):
                j = (i + 1) % n
                du, dv = loop[j][0] - loop[i][0], loop[j][1] - loop[i][1]
                um, vm = (loop[i][0] + loop[j][0]) / 2, (loop[i][1] + loop[j][1]) / 2
                reference = to3d(um + dv * sign, vm - du * sign, 0.0) - to3d(um, vm, 0.0)
                face = self.bm.faces.new((back[i], back[j], front[j], front[i]))
                face.normal_update()
                if face.normal.dot(reference) < 0:
                    face.normal_flip()
                self._paint(face, rim_material if rim_material is not None else material, color)

    def lathe_x(self, center, profile, segments, colors, material):
        """Revolve a closed (dx, r) profile about the x axis through center."""
        cx, cy, cz = center
        n = len(profile)
        area = sum(profile[i][0] * profile[(i + 1) % n][1] - profile[(i + 1) % n][0] * profile[i][1] for i in range(n))
        sign = 1 if area > 0 else -1
        rings = []
        for dx, r in profile:
            rings.append(
                [
                    self.bm.verts.new(
                        (
                            cx + dx,
                            cy + math.cos(2 * math.pi * i / segments) * r,
                            cz + math.sin(2 * math.pi * i / segments) * r,
                        )
                    )
                    for i in range(segments)
                ]
            )
        for k in range(n):
            a, b = rings[k], rings[(k + 1) % n]
            (x0, r0), (x1, r1) = profile[k], profile[(k + 1) % n]
            # Outward normal of the profile edge in the (dx, r) plane.
            ndx, ndr = (r1 - r0) * sign, -(x1 - x0) * sign
            for i in range(segments):
                j = (i + 1) % segments
                face = self.bm.faces.new((a[i], a[j], b[j], b[i]))
                face.normal_update()
                angle = 2 * math.pi * (i + 0.5) / segments
                reference = Vector((ndx, math.cos(angle) * ndr, math.sin(angle) * ndr))
                if face.normal.dot(reference) < 0:
                    face.normal_flip()
                self._paint(face, material, colors[k] if isinstance(colors, list) else colors)

    def mesh(self, name, materials, merge=0.0004, smooth_angle=38):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=merge)
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


def rrect(cu, cv, w, h, r, segments=4):
    """Rounded rectangle outline, counter-clockwise in (u, v)."""
    r = min(r, w / 2, h / 2)
    points = []
    for corner, (du, dv) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        ccu, ccv = cu + du * (w / 2 - r), cv + dv * (h / 2 - r)
        start = corner * math.pi / 2
        for s in range(segments + 1):
            a = start + (math.pi / 2) * s / segments
            points.append((ccu + math.cos(a) * r, ccv + math.sin(a) * r))
    return points


# ---- Body shell ---------------------------------------------------------------------------
def body_profile():
    """Right half of the car cross-section (x, y), bottom to roof centre."""
    points = [(1.46, 0.96), (1.495, 0.995)]
    for y in (1.04, FLOOR_Y, 1.4, 1.72, BAND_LOW, BAND_HIGH, WINDOW_Y[0], 2.72, WINDOW_Y[1], DOOR_TOP, SIDE_TOP):
        points.append((SKIN_X, y))
    # Tight cantrail and a shallow roof: a superellipse from the side top to the roof centre.
    steps, n = 9, 3.4
    for i in range(1, steps + 1):
        t = (math.pi / 2) * i / steps
        c, s = math.cos(t), math.sin(t)
        points.append((SKIN_X * c ** (2 / n), SIDE_TOP + (ROOF_TOP - SIDE_TOP) * s ** (2 / n)))
    points[-1] = (0.0, ROOF_TOP)
    return points


def profile_normals(points):
    normals = []
    for i, (x, y) in enumerate(points):
        a = points[max(0, i - 1)]
        b = points[min(len(points) - 1, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        length = math.hypot(tx, ty) or 1
        normals.append((ty / length, -tx / length))  # outward for a bottom-to-top right side
    normals[-1] = (0.0, 1.0)
    return normals


def z_stations():
    edges = {-HALF_LENGTH + END_RADIUS, HALF_LENGTH - END_RADIUS}
    for zc in DOOR_CENTRES:
        edges |= {zc - DOOR_HALF, zc + DOOR_HALF}
    for zc in WINDOW_CENTRES:
        edges |= {zc - WINDOW_HALF, zc + WINDOW_HALF}
    stations = sorted(edges)
    filled = []
    for a, b in zip(stations, stations[1:]):
        count = max(1, math.ceil((b - a) / 0.55))
        filled += [a + (b - a) * k / count for k in range(count)]
    filled.append(stations[-1])
    return filled


def side_color(y):
    if y < BAND_LOW:
        return C["red"]
    if y < BAND_HIGH:
        return C["gold"]
    return C["cream"]


def in_opening(zm, ym):
    for zc in DOOR_CENTRES:
        if abs(zm - zc) < DOOR_HALF and FLOOR_Y < ym < DOOR_TOP:
            return True
    for zc in WINDOW_CENTRES:
        if abs(zm - zc) < WINDOW_HALF and WINDOW_Y[0] < ym < WINDOW_Y[1]:
            return True
    return False


def build_shell(ends):
    """Outer skin with window and door openings plus two end caps; solidified later."""
    p = Parts()
    profile = body_profile()
    normals = profile_normals(profile)
    zs = z_stations()
    # Rounded plan corners: extra rings over the last END_RADIUS at each end.
    rings = []
    for k in range(4, 0, -1):
        a = (math.pi / 2) * k / 4
        rings.append((-(HALF_LENGTH - END_RADIUS + END_RADIUS * math.sin(a)), END_RADIUS * (1 - math.cos(a))))
    rings += [(z, 0.0) for z in zs]
    for k in range(1, 5):
        a = (math.pi / 2) * k / 4
        rings.append((HALF_LENGTH - END_RADIUS + END_RADIUS * math.sin(a), END_RADIUS * (1 - math.cos(a))))

    def point(i, side, inset, z):
        x, y = profile[i]
        nx, ny = normals[i]
        return (side * (x - nx * inset), y - ny * inset, z)

    for side in (-1, 1):
        for (z0, d0), (z1, d1) in zip(rings, rings[1:]):
            zm = (z0 + z1) / 2
            for i in range(len(profile) - 1):
                ym = (profile[i][1] + profile[i + 1][1]) / 2
                flat = profile[i][0] == SKIN_X and profile[i + 1][0] == SKIN_X
                if flat and d0 == 0 and d1 == 0 and in_opening(zm, ym):
                    continue
                roof = ym > SIDE_TOP + 0.13
                nx, ny = normals[i]
                p.face(
                    (point(i, side, d0, z0), point(i, side, d1, z1), point(i + 1, side, d1, z1), point(i + 1, side, d0, z0)),
                    ROOF if roof else PAINT,
                    C["roof"] if roof else side_color(ym),
                    outward=(side * nx, ny, 0),
                )
    # End caps: the inset cross-section filled, with the end's own openings.
    for end, kind in ((1, ends[0]), (-1, ends[1])):
        z = end * HALF_LENGTH
        outline = [(x - nx * END_RADIUS, y - ny * END_RADIUS) for (x, y), (nx, ny) in zip(profile, normals)]
        full = outline + [(-u, v) for u, v in reversed(outline[:-1])]
        holes = []
        if kind == "cab":
            for side in (-1, 1):
                holes.append(rrect(side * 0.81, 2.715, 0.8, 0.87, 0.07))
            holes.append(rrect(0.0, 2.5, 0.44, 0.96, 0.05))
        else:
            holes.append(rrect(0.0, 2.55, 0.42, 0.78, 0.05))
        bm = p.bm
        loops = []
        for loop in [full, *holes]:
            loops.append([bm.verts.new((u, v, z)) for u, v in loop])
        edges = []
        for loop in loops:
            for i in range(len(loop)):
                edges.append(bm.edges.new((loop[i], loop[(i + 1) % len(loop)])))
        filled = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
        cap_faces = [g for g in filled["geom"] if isinstance(g, bmesh.types.BMFace)]
        for face in cap_faces:
            face.normal_update()
            if face.normal.z * end < 0:
                face.normal_flip()
        for _ in range(4):
            long_edges = [
                e
                for e in {e for f in cap_faces if f.is_valid for e in f.edges}
                if len(e.link_faces) == 2 and e.calc_length() > 0.4
            ]
            if not long_edges:
                break
            out = bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=False)
            cap_faces = [f for f in set(cap_faces) | {g for g in out["geom"] if isinstance(g, bmesh.types.BMFace)} if f.is_valid]
            cap_faces = list({f for f in cap_faces} | {f for e in out["geom_split"] if isinstance(e, bmesh.types.BMEdge) for f in e.link_faces})
            bmesh.ops.triangulate(bm, faces=[f for f in cap_faces if f.is_valid and len(f.verts) > 3])
            cap_faces = [f for f in bm.faces if f.is_valid and abs(f.calc_center_median().z - z) < 1e-4]
        # Split the cap along the livery bands so each face has one colour.
        geom = cap_faces + list({e for f in cap_faces for e in f.edges}) + list({v for f in cap_faces for v in f.verts})
        roof_split = next(y for (_, y), (py) in zip(outline, profile) if py[1] > SIDE_TOP + 0.13)
        for y in (BAND_LOW, BAND_HIGH, roof_split):
            out = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, y, 0), plane_no=(0, 1, 0))
            geom = list(set(g for g in geom if g.is_valid) | set(out["geom"]))
        for face in [g for g in geom if isinstance(g, bmesh.types.BMFace)]:
            face.normal_update()
            if face.normal.z * end < 0:
                face.normal_flip()
            cy = face.calc_center_median().y
            roof = cy > roof_split
            p._paint(face, ROOF if roof else PAINT, C["roof"] if roof else side_color(cy))
    return p


def solidify(obj, thickness):
    """Apply a Solidify: the inner skin and the opening reveals take the lining material."""
    modifier = obj.modifiers.new("skin", "SOLIDIFY")
    modifier.thickness = thickness
    modifier.offset = -1
    modifier.use_even_offset = True
    modifier.use_rim = True
    modifier.use_rim_only = False
    modifier.material_offset = 20
    modifier.material_offset_rim = 20
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
    obj.modifiers.remove(modifier)
    old = obj.data
    obj.data = mesh
    bpy.data.meshes.remove(old)
    # Offsets past the end clamp to the last slot; anything not paint or roof is lining.
    for polygon in mesh.polygons:
        if polygon.material_index not in (PAINT, ROOF):
            polygon.material_index = LINING
    return obj


# ---- Details: windows, doors frames, ends, roof, underframe and bogies ---------------------
def side_plane(side, x):
    """(u, v, w) on a side wall: u along z, v up, w outward from x."""
    return lambda u, v, w: Vector((side * (x + w), v, u))


def end_plane(end, z):
    return lambda u, v, w: Vector((u, v, end * (z + w)))


def add_windows(p):
    for side in (-1, 1):
        for zc in WINDOW_CENTRES:
            w, h = 2 * WINDOW_HALF, WINDOW_Y[1] - WINDOW_Y[0]
            yc = (WINDOW_Y[0] + WINDOW_Y[1]) / 2
            # Rubber gasket proud of the skin, then a bright sash bar and the glass.
            p.slab(
                rrect(zc, yc, w + 0.09, h + 0.09, 0.11),
                [rrect(zc, yc, w - 0.05, h - 0.05, 0.07)],
                side_plane(side, SKIN_X - 0.004),
                0.016,
                RUBBER,
                C["rubber"],
            )
            p.box((side * (SKIN_X - 0.005), 2.63, zc), (0.012, 0.035, w - 0.03), BRIGHT, C["bright"])
            p.face(
                [
                    (side * (SKIN_X - 0.014), WINDOW_Y[0] - 0.01, zc - WINDOW_HALF - 0.01),
                    (side * (SKIN_X - 0.014), WINDOW_Y[0] - 0.01, zc + WINDOW_HALF + 0.01),
                    (side * (SKIN_X - 0.014), WINDOW_Y[1] + 0.01, zc + WINDOW_HALF + 0.01),
                    (side * (SKIN_X - 0.014), WINDOW_Y[1] + 0.01, zc - WINDOW_HALF - 0.01),
                ],
                GLASS,
                C["white"],
                outward=(side, 0, 0),
            )
        for zc in DOOR_CENTRES:
            # Door frame: a thin rubber surround and a bright sill plate.
            outer = [
                (zc - DOOR_HALF - 0.05, FLOOR_Y),
                (zc + DOOR_HALF + 0.05, FLOOR_Y),
                (zc + DOOR_HALF + 0.05, DOOR_TOP + 0.05),
                (zc - DOOR_HALF - 0.05, DOOR_TOP + 0.05),
            ]
            inner = [
                (zc - DOOR_HALF + 0.005, FLOOR_Y + 0.001),
                (zc + DOOR_HALF - 0.005, FLOOR_Y + 0.001),
                (zc + DOOR_HALF - 0.005, DOOR_TOP - 0.005),
                (zc - DOOR_HALF + 0.005, DOOR_TOP - 0.005),
            ]
            p.slab(outer, [inner], side_plane(side, SKIN_X - 0.004), 0.012, RUBBER, C["rubber"])
            p.box((side * (SKIN_X - 0.05), FLOOR_Y - 0.012, zc), (0.12, 0.025, 2 * DOOR_HALF), BRIGHT, C["bright"])
            # Step below the door and a grab handle beside it.
            p.box((side * (SKIN_X + 0.09), 0.84, zc), (0.2, 0.05, 2 * DOOR_HALF + 0.05), METAL, C["steel-light"], bevel=0.01)
            for edge in (-1, 1):
                z = zc + edge * (DOOR_HALF + 0.14)
                p.rod((side * (SKIN_X + 0.05), 1.55, z), (side * (SKIN_X + 0.05), 2.45, z), 0.016, BRIGHT, C["bright"], 6)
                for y in (1.55, 2.45):
                    p.rod((side * (SKIN_X - 0.01), y, z), (side * (SKIN_X + 0.055), y, z), 0.014, BRIGHT, C["bright"], 6)
        # Rain gutter along the cantrail and a car number plate.
        p.box((side * (SKIN_X + 0.004), SIDE_TOP + 0.005, 0), (0.02, 0.05, 2 * HALF_LENGTH - 0.35), RUBBER, C["mask"])
        p.box((side * (SKIN_X + 0.003), 1.62, 0.0), (0.008, 0.18, 0.62), PAINT, C["cream"])


def add_cab_end(p, end):
    z = HALF_LENGTH
    plane = end_plane(end, z)
    # Black mask around both windscreens and the centre door, with the destination sign.
    mask_holes = [rrect(side * 0.81, 2.715, 0.8, 0.87, 0.07) for side in (-1, 1)]
    mask_holes.append(rrect(0.0, 2.5, 0.44, 0.96, 0.05))
    p.slab(rrect(0.0, 2.73, 2.58, 1.22, 0.16), mask_holes, plane, 0.02, PAINT, C["mask"])
    p.box((0.0, 3.19, end * (z + 0.03)), (0.66, 0.13, 0.03), SIGN, C["white"])
    # Windscreen glass inset from the face; the centre door glass matches.
    for side in (-1, 1):
        pts = rrect(side * 0.81, 2.715, 0.82, 0.89, 0.07)
        p.face([plane(u, v, -0.012) for u, v in pts], GLASS, C["white"], outward=(0, 0, end))
    p.face([plane(u, v, -0.012) for u, v in rrect(0.0, 2.5, 0.46, 0.98, 0.05)], GLASS, C["white"], outward=(0, 0, end))
    # Centre door outline below the mask.
    p.slab(rrect(0.0, 1.62, 0.62, 1.1, 0.03), [rrect(0.0, 1.62, 0.56, 1.04, 0.02)], plane, 0.008, RUBBER, C["rubber"])
    # Lamp housings: the game's lamp lenses sit 0.22 m ahead of the end face.
    for side in (-1, 1):
        x = side * 1.08
        p.rod((x, 1.7, end * (z - 0.01)), (x, 1.7, end * (z + 0.2)), 0.175, PAINT, C["mask"], 16)
        p.rod((x, 1.7, end * (z + 0.17)), (x, 1.7, end * (z + 0.205)), 0.158, BRIGHT, C["bright"], 16)
        # Marker lamp and horn grille under the headlight.
        p.box((side * 0.6, 1.7, end * (z + 0.03)), (0.22, 0.09, 0.05), BRIGHT, C["bright"])
    # Skirt, anticlimber and a tight-lock coupler.
    p.box((0.0, 1.0, end * (z + 0.05)), (2.7, 0.1, 0.1), METAL, C["steel"], bevel=0.015)
    skirt = [(-1.3, 0.34), (1.3, 0.34), (1.36, 0.9), (-1.36, 0.9)]
    p.slab(skirt, [], end_plane(end, z + 0.12), 0.03, METAL, C["steel"])
    for x in (-0.55, 0.55):
        p.box((x, 0.62, end * (z + 0.02)), (0.12, 0.5, 0.2), METAL, C["steel"])
    add_coupler(p, end, z, 0.48)
    # Wiper parking marks and a front grab rail.
    p.rod((-0.4, 1.95, end * (z + 0.045)), (0.4, 1.95, end * (z + 0.045)), 0.014, BRIGHT, C["bright"], 6)


def add_coupler(p, end, z, reach):
    p.box((0.0, 0.64, end * (z + reach / 2)), (0.18, 0.18, reach), METAL, C["steel-light"], bevel=0.02)
    p.box((0.0, 0.64, end * (z + reach)), (0.34, 0.3, 0.08), METAL, C["steel"], bevel=0.02)
    p.rod((0.12, 0.52, end * (z + 0.1)), (0.14, 0.52, end * (z + reach - 0.05)), 0.03, RUBBER, C["rubber"], 6)


def add_gangway_end(p, end):
    z = HALF_LENGTH
    plane = end_plane(end, z)
    p.slab(rrect(0.0, 2.1, 0.8, 2.08, 0.04), [rrect(0.0, 2.1, 0.72, 2.0, 0.03)], plane, 0.012, RUBBER, C["rubber"])
    p.face([plane(u, v, -0.012) for u, v in rrect(0.0, 2.55, 0.44, 0.8, 0.05)], GLASS, C["white"], outward=(0, 0, end))
    p.rod((0.26, 1.95, end * (z + 0.03)), (0.26, 2.15, end * (z + 0.03)), 0.015, BRIGHT, C["bright"], 6)
    # Bellows: alternating ribs reach 0.45 m, leaving a 0.2 m gap to the next car.
    for k in range(4):
        grow = 0.03 if k % 2 == 0 else 0.0
        outer = rrect(0.0, 2.13, 1.14 + grow, 2.26 + grow, 0.12)
        inner = rrect(0.0, 2.13, 0.92, 2.04, 0.08)
        p.slab(outer, [inner], end_plane(end, z + 0.01 + k * 0.11), 0.11, RUBBER, C["rubber"])
    for side in (-1, 1):
        p.rod((side * 1.32, 1.3, end * (z + 0.05)), (side * 1.32, 2.6, end * (z + 0.05)), 0.018, BRIGHT, C["bright"], 6)
    p.box((0.0, 0.96, end * (z + 0.05)), (2.7, 0.1, 0.1), METAL, C["steel"], bevel=0.015)
    add_coupler(p, end, z, 0.55)


def add_roof(p, pantograph_base):
    roof_y = ROOF_TOP - 0.03
    # Air conditioner: a bevelled housing, grille slats and two fan rings.
    p.box((0.0, roof_y + 0.14, -2.9), (1.78, 0.3, 2.5), ROOF, C["roof"], bevel=0.05)
    for k in range(9):
        p.box((0.0, roof_y + 0.295, -3.9 + k * 0.25), (1.4, 0.018, 0.07), ROOF, C["roof-dark"])
    for z in (-3.45, -2.35):
        p.cylinder_y((0.0, roof_y + 0.3, z), 0.3, 0.02, METAL, C["steel"], 16)
    for z in (2.9, 4.55):
        p.box((0.0, roof_y + 0.08, z), (1.1, 0.18, 0.8), ROOF, C["roof"], bevel=0.04)
        for k in range(4):
            p.box((0.0, roof_y + 0.175, z - 0.3 + k * 0.2), (0.9, 0.014, 0.05), ROOF, C["roof-dark"])
    # Longitudinal walkway strips and a cable conduit.
    for x in (-0.55, 0.55):
        p.box((x, roof_y + 0.035, 0.9), (0.24, 0.012, 1.5), ROOF, C["roof-dark"])
    for side in (-1, 1):
        p.rod((side * 0.92, roof_y - 0.02, -5.0), (side * 0.92, roof_y - 0.02, 5.4), 0.025, BRIGHT, C["bright"], 6, caps=True)
    if pantograph_base:
        # Mounting plinth and four porcelain insulators; the arms are a separate part.
        p.box((0.0, roof_y + 0.08, PANTOGRAPH_Z), (1.3, 0.1, 2.05), ROOF, C["roof-dark"], bevel=0.02)
        for x in (-0.45, 0.45):
            for dz in (-0.67, 0.67):
                p.cylinder_y((x, roof_y + 0.22, PANTOGRAPH_Z + dz), 0.11, 0.2, PAINT, C["insulator"], 12)
                for k in range(3):
                    p.cylinder_y((x, roof_y + 0.16 + k * 0.06, PANTOGRAPH_Z + dz), 0.15, 0.022, PAINT, C["insulator"], 12)


def add_underframe(p):
    # Side sills, equipment cases between the bogies and brake reservoirs.
    for side in (-1, 1):
        p.box((side * 1.36, 0.93, 0.0), (0.08, 0.1, 2 * HALF_LENGTH - 0.2), METAL, C["steel"])
    for z, w, d in ((-1.8, 1.7, 1.7), (0.35, 1.8, 1.4), (2.15, 1.45, 1.3)):
        p.box((0.0, 0.66, z), (w, 0.52, d), METAL, C["steel"], bevel=0.03)
        for side in (-1, 1):
            for k in range(5):
                p.box((side * (w / 2 + 0.012), 0.66, z - d / 2 + 0.2 + k * (d - 0.4) / 4), (0.02, 0.36, 0.04), METAL, C["steel-light"])
    for side in (-1, 1):
        p.cylinder_z((side * 0.55, 0.62, -3.35 if side > 0 else 3.35), 0.16, 0.9, METAL, C["steel-light"], 14)


def add_bogie(p, zc):
    for side in (-1, 1):
        x = side * 1.2
        # Side frame with a dropped centre over the air spring seat.
        frame = [(-1.3, 0.72), (-0.55, 0.72), (-0.35, 0.6), (0.35, 0.6), (0.55, 0.72), (1.3, 0.72), (1.3, 0.92), (0.5, 0.92), (0.3, 0.84), (-0.3, 0.84), (-0.5, 0.92), (-1.3, 0.92)]
        p.slab(
            [(zc + u, v) for u, v in frame],
            [],
            lambda u, v, w, x=x: Vector((x - 0.07 + w, v, u)),
            0.14,
            METAL,
            C["steel"],
        )
        for dz in (-AXLE_OFFSET, AXLE_OFFSET):
            # Axle box with its spring and a bright end cover.
            p.box((x, WHEEL_Y, zc + dz), (0.2, 0.26, 0.32), METAL, C["steel-light"], bevel=0.02)
            p.cylinder_x((x + side * 0.11, WHEEL_Y, zc + dz), 0.1, 0.03, BRIGHT, C["bright"], 12)
            p.cylinder_y((x, WHEEL_Y + 0.2, zc + dz), 0.075, 0.14, RUBBER, C["rubber"], 10)
        # Air spring between frame and body, brake cylinders by the wheels.
        p.cylinder_y((side * 1.0, 0.92, zc), 0.2, 0.12, RUBBER, C["rubber"], 16)
        for dz in (-0.42, 0.42):
            p.box((side * 1.05, 0.62, zc + dz), (0.14, 0.14, 0.2), METAL, C["rust"])
    # Transom and a traction link.
    p.box((0.0, 0.7, zc), (2.3, 0.2, 0.34), METAL, C["steel"], bevel=0.02)
    p.box((0.0, 0.84, zc + 0.3), (0.5, 0.1, 0.35), METAL, C["steel-light"])


def build_body(name, ends, pantograph_base, materials):
    shell = solidify(build_shell(ends).mesh(f"{name}-shell", materials, smooth_angle=50), SKIN)
    details = Parts()
    add_windows(details)
    for end, kind in ((1, ends[0]), (-1, ends[1])):
        (add_cab_end if kind == "cab" else add_gangway_end)(details, end)
    add_roof(details, pantograph_base)
    add_underframe(details)
    for zc in BOGIE_CENTRES:
        add_bogie(details, zc)
    detail_obj = details.mesh(f"{name}-details", materials)
    # Join by appending both meshes into one bmesh (material indices are shared).
    bm = bmesh.new()
    bm.from_mesh(shell.data)
    bm.from_mesh(detail_obj.data)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for material in materials:
        mesh.materials.append(material)
    mesh.color_attributes.active_color = mesh.color_attributes["Col"]
    for obj in (shell, detail_obj):
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.meshes.remove(data)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ---- Moving parts ---------------------------------------------------------------------------
def build_door_leaf(materials):
    """One leaf centred on its own origin, outer face +X. Symmetric along Z so the game can
    draw every leaf of a car from one geometry, turning the far side through 180°."""
    p = Parts()
    height = DOOR_TOP - FLOOR_Y - 0.02
    yc = (DOOR_TOP + FLOOR_Y) / 2
    thickness = 0.03
    outline = [(-LEAF_HALF, -height / 2), (LEAF_HALF, -height / 2), (LEAF_HALF, height / 2), (-LEAF_HALF, height / 2)]
    window = rrect(0.0, 2.62 - yc, 0.42, 0.8, 0.05)
    plane = lambda u, v, w: Vector((w - thickness / 2, v, u))  # noqa: E731
    p.slab(outline, [window], plane, thickness, PAINT, C["cream"], back_material=LINING, rim_material=PAINT)
    # Split along the livery bands so the leaf carries the body's vermilion and ochre.
    geom = list(p.bm.faces) + list(p.bm.edges) + list(p.bm.verts)
    for y in (BAND_LOW - yc, BAND_HIGH - yc):
        out = bmesh.ops.bisect_plane(p.bm, geom=geom, plane_co=(0, y, 0), plane_no=(0, 1, 0))
        geom = list(set(g for g in geom if g.is_valid) | set(out["geom"]))
    for face in p.bm.faces:
        if face.material_index == PAINT:
            p._paint(face, PAINT, side_color(face.calc_center_median().y + yc))
    p.slab(rrect(0.0, 2.62 - yc, 0.48, 0.86, 0.07), [rrect(0.0, 2.62 - yc, 0.4, 0.78, 0.045)], lambda u, v, w: Vector((thickness / 2 - 0.002 + w, v, u)), 0.012, RUBBER, C["rubber"])
    p.face(
        [(0.0, 2.2 - yc, -0.23), (0.0, 2.2 - yc, 0.23), (0.0, 3.04 - yc, 0.23), (0.0, 3.04 - yc, -0.23)],
        GLASS,
        C["white"],
        outward=(1, 0, 0),
    )
    # Rubber meeting strips on both vertical edges.
    for edge in (-1, 1):
        p.box((0.0, 0.0, edge * (LEAF_HALF - 0.012)), (thickness + 0.012, height, 0.024), RUBBER, C["rubber"])
    return p.mesh("door-leaf", materials)


def build_wheelset(materials):
    """Axle and two wheels about the origin; the game spins the node about X."""
    p = Parts()
    profile = [
        (-0.075, 0.49),
        (-0.06, 0.465),
        (-0.04, 0.458),
        (0.07, 0.452),
        (0.07, 0.4),
        (0.04, 0.37),
        (0.03, 0.2),
        (0.065, 0.16),
        (0.065, 0.09),
        (-0.07, 0.09),
        (-0.07, 0.15),
        (-0.035, 0.2),
        (-0.045, 0.38),
        (-0.075, 0.43),
    ]
    colors = [C["tread"], C["tread"], C["tread"], C["tread"], C["rust"], C["rust"], C["rust"], C["rust"], C["steel"], C["rust"], C["rust"], C["rust"], C["rust"], C["tread"]]
    for side in (-1, 1):
        mirrored = [(side * dx, r) for dx, r in profile]
        cols = colors
        p.lathe_x((side * WHEEL_X, 0.0, 0.0), mirrored, 18, cols, METAL)
        # Four raised ribs on the outer web make the rotation readable.
        for k in range(4):
            a = k * math.pi / 2
            r = 0.28
            p.box(
                (side * (WHEEL_X + 0.045), math.cos(a) * r, math.sin(a) * r),
                (0.02, 0.05 if k % 2 else 0.16, 0.16 if k % 2 else 0.05),
                BRIGHT,
                C["bright"],
            )
    p.cylinder_x((0.0, 0.0, 0.0), 0.085, 2.34, METAL, C["steel-light"], 12)
    for side in (-1, 1):
        p.cylinder_x((side * 0.55, 0.0, 0.0), 0.16, 0.12, METAL, C["steel"], 14)  # gear case / disc
    return p.mesh("wheelset", materials, smooth_angle=30)


def build_pantograph(materials, contact_height):
    """Single-arm pantograph over z 0 (the game places it at PANTOGRAPH_Z). The top of the
    carbon strips is exactly `contact_height` above the car origin."""
    p = Parts()
    base_y = ROOF_TOP + 0.24
    # Base frame on the insulators.
    for x in (-0.45, 0.45):
        p.box((x, base_y, 0.0), (0.08, 0.08, 1.55), METAL, C["steel"])
    for z in (-0.67, 0.67):
        p.box((0.0, base_y, z), (0.98, 0.08, 0.08), METAL, C["steel"])
    hinge = Vector((0.0, base_y + 0.12, -0.75))
    knee = Vector((0.0, base_y + 0.12 + (contact_height - 0.2 - base_y) * 0.52, 1.05))
    head = Vector((0.0, contact_height - 0.14, 0.0))
    p.cylinder_x((0.0, hinge.y, hinge.z), 0.07, 0.7, METAL, C["steel"], 10)
    p.rod(hinge, knee, 0.055, METAL, C["steel-light"], 10)
    p.rod(hinge + Vector((0, 0.05, 0.25)), knee + Vector((0, -0.25, -0.05)), 0.02, BRIGHT, C["bright"], 6)
    # Upper arm: two tubes from the knee spreading to the head.
    for x in (-0.28, 0.28):
        p.rod(knee, (x, head.y, head.z), 0.03, METAL, C["steel-light"], 8)
    p.cylinder_x((0.0, knee.y, knee.z), 0.06, 0.2, BRIGHT, C["bright"], 10)
    # Spring and damper box at the hinge.
    p.box((0.0, base_y + 0.1, -0.35), (0.22, 0.16, 0.5), METAL, C["steel"], bevel=0.02)
    # Head: cross bar, two carbon strips and bent horns.
    p.cylinder_x((0.0, head.y, head.z), 0.035, 0.9, METAL, C["steel"], 8)
    for dz in (-0.21, 0.21):
        p.box((0.0, contact_height - 0.05, dz), (1.62, 0.06, 0.07), METAL, C["steel"])
        p.box((0.0, contact_height - 0.01, dz), (1.5, 0.02, 0.05), RUBBER, C["carbon"])
        for side in (-1, 1):
            p.rod((side * 0.81, contact_height - 0.05, dz), (side * 1.02, contact_height - 0.22, dz), 0.022, BRIGHT, C["bright"], 6)
        p.rod((-0.25, head.y, 0.0), (-0.25, contact_height - 0.05, dz), 0.015, METAL, C["steel"], 6)
        p.rod((0.25, head.y, 0.0), (0.25, contact_height - 0.05, dz), 0.015, METAL, C["steel"], 6)
    return p.mesh("pantograph", materials, smooth_angle=35)


# ---- Build, bake and export -----------------------------------------------------------------
def material_triangles(obj):
    counts = {}
    for polygon in obj.data.polygons:
        name = obj.data.materials[polygon.material_index].name
        counts[name] = counts.get(name, 0) + len(polygon.vertices) - 2
    return dict(sorted(counts.items()))


def main():
    ma.reset_scene()
    materials = build_materials()
    cab = build_body("car-cab", ("cab", "gangway"), True, materials)
    middle = build_body("car-middle", ("gangway", "gangway"), False, materials)
    leaf = build_door_leaf(materials)
    wheelset = build_wheelset(materials)
    pantograph = build_pantograph(materials, ARGS.contact_height)
    # Ambient occlusion is baked into the colour attribute; bright metal and rubber keep it too.
    for obj, distance, strength in ((cab, 1.3, 0.55), (middle, 1.3, 0.55), (leaf, 0.3, 0.3), (wheelset, 0.35, 0.4), (pantograph, 0.5, 0.3)):
        ma.ambient_occlusion(obj, samples=20, distance=distance, strength=strength)

    layout = {
        "doorCentres": list(DOOR_CENTRES),
        "leafOffset": LEAF_HALF,
        "leafX": LEAF_X,
        "leafY": round((DOOR_TOP + FLOOR_Y) / 2, 4),
        "leafSlide": LEAF_SLIDE,
        "axles": [round(b + d, 4) for b in BOGIE_CENTRES for d in (-AXLE_OFFSET, AXLE_OFFSET)],
        "wheelCentreY": WHEEL_Y,
        "wheelRadius": WHEEL_RADIUS,
        "skinX": SKIN_X,
        "windscreenZ": round(WINDSCREEN_Z, 4),
        "halfLength": HALF_LENGTH,
    }
    for obj, variant in ((cab, "cab"), (middle, "middle")):
        obj["kind"] = "momiji-emu-car"
        obj["variant"] = variant
        for key, value in layout.items():
            obj[key] = value
    leaf["kind"] = "momiji-emu-door-leaf"
    wheelset["kind"] = "momiji-emu-wheelset"
    pantograph["kind"] = "momiji-emu-pantograph"
    pantograph["contactHeight"] = ARGS.contact_height
    pantograph["baseZ"] = PANTOGRAPH_Z

    parts = [cab, middle, leaf, wheelset, pantograph]
    os.makedirs(os.path.dirname(ARGS.out), exist_ok=True)
    ma.export_glb(ARGS.out, parts, apply=False)

    def bounds(obj):
        corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        # Report in the game frame: x, y (up), z (forward).
        game = [Vector((c.x, c.z, -c.y)) for c in corners]
        return [[round(min(c[i] for c in game), 3) for i in range(3)], [round(max(c[i] for c in game), 3) for i in range(3)]]

    triangles = {obj.name: ma.triangle_count(obj) for obj in parts}
    per_car = {
        "cab": triangles["car-cab"] + 16 * triangles["door-leaf"] + 4 * triangles["wheelset"] + triangles["pantograph"],
        "middle": triangles["car-middle"] + 16 * triangles["door-leaf"] + 4 * triangles["wheelset"],
    }
    report = {
        "asset": "momiji-emu",
        "blender": bpy.app.version_string,
        "parts": triangles,
        "materialTriangles": {obj.name: material_triangles(obj) for obj in parts},
        "perCarTriangles": per_car,
        "materials": [m[0] for m in MATERIALS],
        "bounds": {obj.name: bounds(obj) for obj in parts},
        "layout": layout,
        "contactHeight": ARGS.contact_height,
        "glbBytes": os.path.getsize(ARGS.out),
        "facing": "cab at +Z in three.js (Blender -Y)",
    }
    # Two cab cars (one with a pantograph), one middle car with a pantograph, two without.
    report["trainTriangles"] = (
        2 * (triangles["car-cab"] + 16 * triangles["door-leaf"] + 4 * triangles["wheelset"])
        + 3 * (triangles["car-middle"] + 16 * triangles["door-leaf"] + 4 * triangles["wheelset"])
        + 2 * triangles["pantograph"]
    )
    ma.write_report(ARGS.report, report)
    if ARGS.render:
        os.makedirs(ARGS.render, exist_ok=True)
        # Assemble one lead car in Blender for review renders (game frame → Blender frame).
        def place(obj, x, y, z, turn=0.0):
            copy = obj.copy()
            bpy.context.scene.collection.objects.link(copy)
            copy.matrix_world = TO_BLENDER @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(turn, 4, "Y") @ TO_BLENDER.inverted()
            return copy

        for side in (-1, 1):
            for zc in DOOR_CENTRES:
                for lf in (-1, 1):
                    place(leaf, side * LEAF_X, layout["leafY"], zc + lf * LEAF_HALF, 0 if side > 0 else math.pi)
        for z in layout["axles"]:
            place(wheelset, 0, WHEEL_Y, z)
        place(pantograph, 0, 0, PANTOGRAPH_Z)
        middle.location = TO_BLENDER @ Vector((0, 0, -13.5))
        for obj in (leaf, wheelset, pantograph):
            obj.hide_render = True
        target = TO_BLENDER @ Vector((0, 2.0, 0))
        views = {
            "three-quarter": (tuple(TO_BLENDER @ Vector((9, 3.5, 14))), 35),
            "side": (tuple(TO_BLENDER @ Vector((16, 2.2, 0))), 35),
            "front": (tuple(TO_BLENDER @ Vector((1.5, 2.2, 16))), 45),
            "bogie": (tuple(TO_BLENDER @ Vector((4.5, 0.9, 7.5))), 30),
            "roof": (tuple(TO_BLENDER @ Vector((6, 9, 6))), 30),
        }
        ma.render_views(ARGS.render, tuple(target), views, resolution=(900, 600))
    print("REPORT", report)


main()
