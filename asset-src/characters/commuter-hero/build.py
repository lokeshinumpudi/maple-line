"""Hero commuter for Maple Line: a stylized, low-poly person for director close-ups.

Built entirely from data so an agent can change a proportion or a colour and rebuild:
body and face rings, a Mixamo-named game skeleton, weights written per ring, four face
shape keys, and four in-place clips. Blender 5.2; see asset-src/lib/maple_assets.py.

    blender -b --factory-startup --python-exit-code 1 \
      --python asset-src/characters/commuter-hero/build.py -- \
      --out apps/game/public/models/characters/commuter-hero.glb \
      --report asset-src/characters/commuter-hero/report.json
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "lib"))
import maple_assets as ma  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
ARGS = ma.parse_args(
    {
        "out": os.path.join(ROOT, "apps/game/public/models/characters/commuter-hero.glb"),
        "report": os.path.join(ROOT, "asset-src/characters/commuter-hero/report.json"),
    }
)

# Blender axes: +Z up, the character faces -Y, and its left side is +X.
HEIGHT = 1.71  # top of the hair; a mid-forties man of average height
WALK_SPEED = 1.15  # metres per second, the residents' walking speed in the game
COLORS = {
    "skin": ma.hex_color("#e3b995"),
    "skin-shade": ma.hex_color("#cf9f7c"),
    "jacket": ma.hex_color("#2f4150"),
    "shirt": ma.hex_color("#e9e3d3"),
    "trousers": ma.hex_color("#34363a"),
    "shoes": ma.hex_color("#4a3326"),
    "hair": ma.hex_color("#1d1a19"),
    "sclera": ma.hex_color("#f3eee4"),
    "iris": ma.hex_color("#2a1d17"),
    "mouth": ma.hex_color("#8a4b45"),
    "brow": ma.hex_color("#241c19"),
    "bag": ma.hex_color("#9a7a52"),
    "phone": ma.hex_color("#1f2327"),
}

BONES = [
    # name, head, tail, parent
    ("Hips", (0, 0, 0.93), (0, 0, 1.02), None),
    ("Spine", (0, 0, 1.02), (0, 0, 1.13), "Hips"),
    ("Spine1", (0, 0, 1.13), (0, 0, 1.25), "Spine"),
    ("Spine2", (0, 0, 1.25), (0, 0, 1.39), "Spine1"),
    ("Neck", (0, 0, 1.39), (0, 0, 1.49), "Spine2"),
    ("Head", (0, 0, 1.49), (0, 0, 1.66), "Neck"),
    ("LeftShoulder", (0.03, 0, 1.36), (0.17, 0, 1.37), "Spine2"),
    ("LeftArm", (0.17, 0, 1.37), (0.2, 0.01, 1.1), "LeftShoulder"),
    ("LeftForeArm", (0.2, 0.01, 1.1), (0.215, -0.01, 0.86), "LeftArm"),
    ("LeftHand", (0.215, -0.01, 0.86), (0.222, -0.018, 0.72), "LeftForeArm"),
    ("LeftUpLeg", (0.09, 0, 0.93), (0.095, 0, 0.5), "Hips"),
    ("LeftLeg", (0.095, 0, 0.5), (0.095, 0.02, 0.09), "LeftUpLeg"),
    ("LeftFoot", (0.095, 0.02, 0.09), (0.095, -0.09, 0.035), "LeftLeg"),
    ("LeftToeBase", (0.095, -0.09, 0.035), (0.095, -0.17, 0.035), "LeftFoot"),
]
BONES += [
    (n.replace("Left", "Right"), (-h[0], h[1], h[2]), (-t[0], t[1], t[2]), p and p.replace("Left", "Right"))
    for n, h, t, p in BONES
    if n.startswith("Left")
]
HEAD_CENTER = Vector((0, -0.005, 1.585))
HEAD_RADII = Vector((0.088, 0.098, 0.112))
EYE_Z = 1.598
EYE_X = 0.031


def head_surface_y(x, z, lift=0.0):
    """Front surface of the head ellipsoid at (x, z), pushed out by `lift` metres."""
    k = 1 - (x / HEAD_RADII.x) ** 2 - ((z - HEAD_CENTER.z) / HEAD_RADII.z) ** 2
    return HEAD_CENTER.y - HEAD_RADII.y * math.sqrt(max(k, 0.0)) - lift


BONES += [
    ("eye-l", (EYE_X, -0.075, EYE_Z), (EYE_X, -0.1, EYE_Z), "Head"),
    ("eye-r", (-EYE_X, -0.075, EYE_Z), (-EYE_X, -0.1, EYE_Z), "Head"),
]


class Builder:
    """Accumulates geometry, per-face colours, per-vertex weights and named vertex sets."""

    def __init__(self):
        self.bm = bmesh.new()
        self.colors = []
        self.weights = {}
        self.sets = {}
        self.smooth = []

    def vertex(self, co, weights, sets=()):
        v = self.bm.verts.new(co)
        self.weights[len(self.bm.verts) - 1] = dict(weights)
        for name in sets:
            self.sets.setdefault(name, []).append(len(self.bm.verts) - 1)
        return v

    def face(self, verts, color, smooth=True):
        f = self.bm.faces.new(verts)
        self.colors.append(COLORS[color])
        self.smooth.append(smooth)
        return f

    def tube(self, points, radii, sides, color, ring_weights, cap_start=False, cap_end=False, up=(0, -1, 0), sets=()):
        """Rings along a polyline; radii are (across u, across v) with v toward `up`."""
        rings = []
        for i, point in enumerate(points):
            p = Vector(point)
            ahead = Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(i - 1, 0)])
            tangent = ahead.normalized()
            v_axis = (Vector(up) - tangent * tangent.dot(Vector(up))).normalized()
            u_axis = tangent.cross(v_axis).normalized()
            rx, ry = radii[i]
            ring = []
            for k in range(sides):
                a = 2 * math.pi * k / sides
                co = p + u_axis * (math.cos(a) * rx) + v_axis * (math.sin(a) * ry)
                ring.append(self.vertex(co, ring_weights[i], sets))
            rings.append(ring)
        for a_ring, b_ring in zip(rings, rings[1:]):
            for k in range(sides):
                self.face([a_ring[k], a_ring[(k + 1) % sides], b_ring[(k + 1) % sides], b_ring[k]], color)
        if cap_start:
            self.face(list(reversed(rings[0])), color)
        if cap_end:
            self.face(rings[-1], color)
        return rings

    def ellipsoid(self, center, radii, rings, sides, color_fn, weights, keep=None, sets_fn=None, flip=False):
        """Latitude/longitude ellipsoid; `keep(theta, phi)` trims faces; colours per face."""
        grid = []
        for i in range(rings + 1):
            theta = math.pi * i / rings
            row = []
            for k in range(sides):
                phi = 2 * math.pi * k / sides
                co = Vector(
                    (
                        center[0] + radii[0] * math.sin(theta) * math.sin(phi),
                        center[1] - radii[1] * math.sin(theta) * math.cos(phi),
                        center[2] + radii[2] * math.cos(theta),
                    )
                )
                sets = sets_fn(co) if sets_fn else ()
                row.append(self.vertex(co, weights, sets))
            grid.append(row)
        for i in range(rings):
            for k in range(sides):
                theta = math.pi * (i + 0.5) / rings
                phi = 2 * math.pi * (k + 0.5) / sides
                if keep and not keep(theta, phi):
                    continue
                quad = [grid[i][k], grid[i + 1][k], grid[i + 1][(k + 1) % sides], grid[i][(k + 1) % sides]]
                if flip:
                    quad.reverse()
                # Poles collapse to triangles.
                unique = []
                for v in quad:
                    if all((v.co - u.co).length > 1e-7 for u in unique):
                        unique.append(v)
                if len(unique) >= 3:
                    self.face(unique, color_fn(theta, phi))
        return grid


def blend(*pairs):
    return {bone: weight for bone, weight in pairs}


def build_body(b):
    # Legs (trousers) for both sides.
    for side, s in (("Left", 1), ("Right", -1)):
        up, low, foot = f"{side}UpLeg", f"{side}Leg", f"{side}Foot"
        zs = [0.97, 0.86, 0.72, 0.58, 0.52, 0.47, 0.34, 0.18, 0.1]
        rs = [0.095, 0.088, 0.078, 0.066, 0.06, 0.056, 0.054, 0.047, 0.043]
        weights = []
        for z in zs:
            if z >= 0.95:
                weights.append(blend(("Hips", 0.5), (up, 0.5)))
            elif z >= 0.56:
                weights.append({up: 1})
            elif z >= 0.5:
                weights.append(blend((up, 0.6), (low, 0.4)))
            elif z >= 0.45:
                weights.append(blend((up, 0.2), (low, 0.8)))
            elif z > 0.12:
                weights.append({low: 1})
            else:
                weights.append(blend((low, 0.6), (foot, 0.4)))
        points = [(s * 0.093, 0.02 * (0.97 - z) / 0.87, z) for z in zs]
        b.tube(points, [(r, r * 0.95) for r in rs], 10, "trousers", weights, up=(0, -1, 0))
        # Shoe: heel to toe along -Y.
        toe = f"{side}ToeBase"
        shoe_points = [(s * 0.095, 0.065, 0.05), (s * 0.095, 0.0, 0.052), (s * 0.095, -0.085, 0.045), (s * 0.095, -0.15, 0.038), (s * 0.095, -0.178, 0.032)]
        shoe_radii = [(0.044, 0.044), (0.05, 0.05), (0.05, 0.043), (0.045, 0.034), (0.028, 0.02)]
        shoe_weights = [{foot: 1}, {foot: 1}, blend((foot, 0.5), (toe, 0.5)), {toe: 1}, {toe: 1}]
        b.tube(shoe_points, shoe_radii, 10, "shoes", shoe_weights, cap_start=True, cap_end=True, up=(0, 0, 1))

    # Torso: a buttoned jacket, wider at the hem and shoulders.
    zs = [0.84, 0.92, 1.02, 1.12, 1.22, 1.3, 1.36, 1.405, 1.44]
    rx = [0.19, 0.18, 0.17, 0.165, 0.175, 0.19, 0.2, 0.15, 0.07]
    ry = [0.13, 0.125, 0.115, 0.11, 0.115, 0.12, 0.115, 0.1, 0.06]
    base = [
        {"Hips": 1},
        {"Hips": 1},
        blend(("Hips", 0.5), ("Spine", 0.5)),
        {"Spine": 1},
        {"Spine1": 1},
        blend(("Spine1", 0.4), ("Spine2", 0.6)),
        {"Spine2": 1},
        blend(("Spine2", 0.6), ("Neck", 0.4)),
        blend(("Spine2", 0.3), ("Neck", 0.7)),
    ]
    sides = 16
    rings = []
    for i, z in enumerate(zs):
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            x, y = math.sin(a) * rx[i], -math.cos(a) * ry[i]
            weights = dict(base[i])
            if z >= 1.28 and abs(x) > 0.12:
                shoulder = "LeftShoulder" if x > 0 else "RightShoulder"
                weights = {bone: w * 0.5 for bone, w in weights.items()}
                weights[shoulder] = 0.5
            ring.append(b.vertex((x, y, z), weights))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(sides):
            # A pale shirt triangle shows at the open collar on the front.
            front = k in (0, 15) and zs[i] >= 1.3
            b.face(
                [rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]],
                "shirt" if front else "jacket",
            )

    # Sleeves and hands.
    for side, s in (("Left", 1), ("Right", -1)):
        sh, arm, fore, hand = f"{side}Shoulder", f"{side}Arm", f"{side}ForeArm", f"{side}Hand"
        points = [(s * 0.175, 0, 1.365), (s * 0.19, 0.005, 1.24), (s * 0.2, 0.01, 1.1), (s * 0.207, 0.0, 0.98), (s * 0.214, -0.008, 0.87)]
        radii = [(0.058, 0.058), (0.052, 0.052), (0.045, 0.047), (0.042, 0.043), (0.04, 0.04)]
        weights = [
            blend((sh, 0.4), (arm, 0.6)),
            {arm: 1},
            blend((arm, 0.5), (fore, 0.5)),
            {fore: 1},
            blend((fore, 0.7), (hand, 0.3)),
        ]
        b.tube(points, radii, 10, "jacket", weights, up=(0, -1, 0))
        hand_points = [(s * 0.215, -0.01, 0.875), (s * 0.219, -0.014, 0.81), (s * 0.222, -0.018, 0.75), (s * 0.222, -0.02, 0.715)]
        hand_radii = [(0.017, 0.028), (0.02, 0.041), (0.018, 0.037), (0.011, 0.02)]
        b.tube(hand_points, hand_radii, 8, "skin", [blend((fore, 0.3), (hand, 0.7)), {hand: 1}, {hand: 1}, {hand: 1}], cap_end=True, up=(0, -1, 0))
        thumb = [(s * 0.212, -0.035, 0.835), (s * 0.207, -0.052, 0.8), (s * 0.204, -0.057, 0.78)]
        b.tube(thumb, [(0.01, 0.01), (0.009, 0.009), (0.006, 0.006)], 6, "skin", [{hand: 1}] * 3, cap_end=True, up=(1, 0, 0))

    # Neck.
    b.tube(
        [(0, 0.0, 1.4), (0, 0.004, 1.47), (0, 0.006, 1.53)],
        [(0.048, 0.046), (0.046, 0.044), (0.045, 0.043)],
        10,
        "skin",
        [blend(("Spine2", 0.3), ("Neck", 0.7)), {"Neck": 1}, blend(("Neck", 0.4), ("Head", 0.6))],
        up=(0, -1, 0),
    )

    # Shoulder bag at the right hip and a phone in the right hand.
    bag_center, bag_size = Vector((-0.235, 0.02, 0.94)), Vector((0.07, 0.26, 0.2))
    box(b, bag_center, bag_size, "bag", {"Hips": 1})
    box(b, Vector((-0.235, -0.028, 0.78)), Vector((0.012, 0.04, 0.075)), "phone", {"RightHand": 1})


def box(b, center, size, color, weights, sets=()):
    hx, hy, hz = size.x / 2, size.y / 2, size.z / 2
    corners = [b.vertex(center + Vector((x * hx, y * hy, z * hz)), weights, sets) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    for quad in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        b.face([corners[i] for i in quad], color, smooth=False)


def build_head(b):
    def jaw_set(co):
        return ("jaw",) if co.z < 1.555 and co.y < HEAD_CENTER.y - 0.02 else ()

    # Face: a slightly narrower jaw and fuller cheeks come from scaling rings below the eyes.
    grid = b.ellipsoid(HEAD_CENTER, HEAD_RADII, 14, 20, lambda t, p: "skin", {"Head": 1}, sets_fn=jaw_set)
    for row in grid:
        for v in row:
            if v.co.z < HEAD_CENTER.z:
                t = (HEAD_CENTER.z - v.co.z) / HEAD_RADII.z
                v.co.x = HEAD_CENTER.x + (v.co.x - HEAD_CENTER.x) * (1 - 0.18 * t * t)

    # Hair: a cap that sits low at the back and high on the forehead.
    def hair_keep(theta, phi):
        front = math.cos(phi)  # 1 at the face, -1 at the back
        limit = math.radians(64 + 44 * (1 - front) / 2)
        return theta < limit

    b.ellipsoid(
        HEAD_CENTER + Vector((0, 0.004, 0.006)),
        HEAD_RADII * 1.075,
        12,
        20,
        lambda t, p: "hair",
        {"Head": 1},
        keep=hair_keep,
    )

    # Eyes with dark irises on eye bones; eyelids are skin shells that the blink keys close.
    for side, s in (("l", 1), ("r", -1)):
        x = s * EYE_X
        y = head_surface_y(x, EYE_Z) + 0.006
        center = Vector((x, y, EYE_Z))
        b.ellipsoid(center, (0.0125, 0.0125, 0.0125), 6, 10, lambda t, p: "sclera", {f"eye-{side}": 1})
        b.ellipsoid(center + Vector((0, -0.0105, 0.001)), (0.0072, 0.0035, 0.0078), 4, 8, lambda t, p: "iris", {f"eye-{side}": 1})
        lid = b.ellipsoid(
            center,
            (0.0146, 0.0146, 0.0146),
            6,
            12,
            lambda t, p: "skin-shade",
            {"Head": 1},
            keep=lambda theta, phi: theta < math.pi / 2 and math.cos(phi) > -0.35,
            sets_fn=lambda co, side=side: (f"lid-{side}",),
        )
        b.sets.setdefault(f"lid-center-{side}", []).append(center.copy())
        # Retract the lid up and back so the eye is open at rest.
        rest = Matrix.Rotation(math.radians(-72), 4, "X")
        for row in lid:
            for v in row:
                v.co = center + (rest @ (v.co - center))
        # Brow.
        brow_center = Vector((x + s * 0.002, head_surface_y(x, EYE_Z + 0.03, 0.003), EYE_Z + 0.03))
        box(b, brow_center, Vector((0.03, 0.006, 0.0065)), "brow", {"Head": 1}, sets=(f"brow-{side}",))

    # Nose: a small wedge.
    top = b.vertex((0, head_surface_y(0, 1.598, -0.002), 1.598), {"Head": 1})
    left = b.vertex((0.012, head_surface_y(0.012, 1.566, 0.0), 1.566), {"Head": 1})
    right = b.vertex((-0.012, head_surface_y(-0.012, 1.566, 0.0), 1.566), {"Head": 1})
    tip = b.vertex((0, head_surface_y(0, 1.568, 0.016), 1.568), {"Head": 1})
    b.face([top, left, tip], "skin-shade", smooth=False)
    b.face([top, tip, right], "skin-shade", smooth=False)
    b.face([left, right, tip], "skin-shade", smooth=False)

    # Mouth: a thin dark shape on the face surface; the jaw and smile keys reshape it.
    columns = [-0.022, -0.011, 0.0, 0.011, 0.022]
    upper, lower = [], []
    for x in columns:
        edge = abs(x) > 0.02
        z_up = 1.5385 + (0 if edge else 0.0012)
        z_low = 1.5385 if edge else 1.5348
        upper.append(b.vertex((x, head_surface_y(x, z_up, 0.0012), z_up), {"Head": 1}, sets=("mouth-upper",)))
        lower.append(b.vertex((x, head_surface_y(x, z_low, 0.0012), z_low), {"Head": 1}, sets=("mouth-lower", "jaw")))
    for i in range(len(columns) - 1):
        b.face([upper[i], lower[i], lower[i + 1], upper[i + 1]], "mouth", smooth=False)


def create_armature():
    data = bpy.data.armatures.new("commuter-hero-rig")
    armature = bpy.data.objects.new("commuter-hero", data)
    bpy.context.scene.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in BONES:
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = Vector(head), Vector(tail)
        bone.roll = 0
        bone.use_deform = True
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def add_shape_keys(obj, b):
    mesh = obj.data
    obj.shape_key_add(name="Basis", from_mix=False)
    base = [v.co.copy() for v in mesh.vertices]

    def key(name, offsets):
        block = obj.shape_key_add(name=name, from_mix=False)
        # New keys start at 1.0 in Blender 5.2; the rest face and the exported default
        # morph weights must be neutral.
        block.value = 0.0
        for index, delta in offsets.items():
            block.data[index].co = base[index] + delta

    for side in ("l", "r"):
        center = b.sets[f"lid-center-{side}"][0]
        close = Matrix.Rotation(math.radians(128), 4, "X")
        key(
            f"blink-{side}",
            {i: (center + close @ (base[i] - center)) - base[i] for i in b.sets[f"lid-{side}"]},
        )
    jaw = {}
    for i in set(b.sets["jaw"]):
        depth = min(1.0, max(0.0, (1.552 - base[i].z) / 0.035))
        jaw[i] = Vector((0, 0.002 * depth, -0.011 * (0.35 + 0.65 * depth)))
    key("jaw-open", jaw)
    smile = {}
    for i in b.sets["mouth-upper"] + b.sets["mouth-lower"]:
        edge = abs(base[i].x) / 0.022
        smile[i] = Vector((math.copysign(0.0028 * edge, base[i].x), 0.001 * edge, 0.0055 * edge * edge))
    key("smile", smile)


# ---- animation -------------------------------------------------------------------------

AX = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}


def pose_rotation(armature, bone_name, turns):
    """Compose armature-space turns [(axis, degrees)] into the bone's local rotation."""
    rest = armature.data.bones[bone_name].matrix_local.to_quaternion()
    q = Quaternion()
    for axis, degrees in turns:
        q = Quaternion(AX[axis], math.radians(degrees)) @ q
    return rest.inverted() @ q @ rest


def clip_idle(t):
    w = 2 * math.pi * t
    return {
        "Spine1": [("x", 1.2 * math.sin(w))],
        "Spine2": [("x", 0.8 * math.sin(w + 0.4))],
        "Head": [("x", 1.6 * math.sin(w + 1.1)), ("z", 2.5 * math.sin(w * 1 + 2.0))],
        "LeftArm": [("y", -1.5 + 1.2 * math.sin(w + 0.3))],
        "RightArm": [("y", 1.5 - 1.2 * math.sin(w + 0.3))],
        "LeftForeArm": [("x", -8)],
        "RightForeArm": [("x", -10)],
    }


def clip_walk(t):
    w = 2 * math.pi * t
    thigh = 16.3 * math.sin(w)
    knee_l = 5 + 40 * max(0.0, math.cos(w)) ** 1.5
    knee_r = 5 + 40 * max(0.0, -math.cos(w)) ** 1.5
    return {
        "LeftUpLeg": [("x", -thigh)],
        "RightUpLeg": [("x", thigh)],
        "LeftLeg": [("x", knee_l)],
        "RightLeg": [("x", knee_r)],
        "LeftFoot": [("x", 0.45 * (thigh - knee_l) + 4)],
        "RightFoot": [("x", 0.45 * (-thigh - knee_r) + 4)],
        "LeftArm": [("x", 15 * math.sin(w)), ("y", -2)],
        "RightArm": [("x", -15 * math.sin(w)), ("y", 2)],
        "LeftForeArm": [("x", -14 - 6 * max(0.0, -math.sin(w)))],
        "RightForeArm": [("x", -14 - 6 * max(0.0, math.sin(w)))],
        "Spine": [("z", 4 * math.sin(w))],
        "Hips": [("z", -4 * math.sin(w))],
        "Head": [("z", -2 * math.sin(w))],
    }


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def clip_wave(t):
    raise_amount = ease(t / 0.22) * (1 - ease((t - 0.8) / 0.2))
    swing = math.sin(2 * math.pi * 3 * t) * raise_amount
    return {
        "RightShoulder": [("y", 10 * raise_amount)],
        "RightArm": [("y", 138 * raise_amount), ("x", -12 * raise_amount)],
        "RightForeArm": [("y", 22 * raise_amount + 24 * swing)],
        "RightHand": [("y", 8 * swing)],
        "Head": [("z", -6 * raise_amount), ("x", -3 * raise_amount)],
        "Spine2": [("y", -3 * raise_amount)],
        "LeftForeArm": [("x", -8)],
    }


def clip_check_phone(t):
    w = 2 * math.pi * t
    return {
        "RightArm": [("x", -30), ("y", -14)],
        "RightForeArm": [("x", -96 + 3 * math.sin(w * 2)), ("y", -8)],
        "RightHand": [("x", 12 + 4 * math.sin(w * 3))],
        "Head": [("x", 20 + 2 * math.sin(w)), ("z", 3 * math.sin(w * 0.5 * 2))],
        "Neck": [("x", 6)],
        "Spine2": [("x", 4)],
        "LeftArm": [("x", -4), ("y", -2)],
        "LeftForeArm": [("x", -12)],
    }


CLIPS = [
    # name, frames (30 fps), function, loops
    ("idle", 120, clip_idle, True),
    ("walk", 36, clip_walk, True),
    ("wave", 60, clip_wave, True),
    ("check-phone", 90, clip_check_phone, True),
]


def build_clips(armature):
    animation = armature.animation_data_create()
    bones = [name for name, *_ in BONES]
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
    for name, frames, fn, _loop in CLIPS:
        action = bpy.data.actions.new(name)
        animation.action = action
        for frame in range(frames + 1):
            turns = fn(frame / frames)
            for bone in bones:
                pose_bone = armature.pose.bones[bone]
                pose_bone.rotation_quaternion = pose_rotation(armature, bone, turns.get(bone, []))
                pose_bone.keyframe_insert("rotation_quaternion", frame=1 + frame, group=bone)
        track = animation.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.name = name
        animation.action = None
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_quaternion = Quaternion()


def clip_report(armature, name, frames, fn, loop):
    first = fn(0.0)
    last = fn(1.0)
    worst = 0.0
    for bone in set(first) | set(last):
        a = pose_rotation(armature, bone, first.get(bone, []))
        b = pose_rotation(armature, bone, last.get(bone, []))
        worst = max(worst, math.degrees(a.rotation_difference(b).angle))
    return {"frames": frames, "seconds": round(frames / 30, 3), "loop": loop, "loopErrorDegrees": round(worst, 4)}


def foot_speed(armature):
    """Average backward speed of the left foot while it is on the ground during `walk`."""
    frames = CLIPS[1][1]
    positions = []
    for frame in range(frames + 1):
        turns = clip_walk(frame / frames)
        for bone in armature.pose.bones:
            bone.rotation_quaternion = pose_rotation(armature, bone.name, turns.get(bone.name, []))
        bpy.context.view_layer.update()
        foot = armature.matrix_world @ armature.pose.bones["LeftFoot"].head
        positions.append(foot)
    for bone in armature.pose.bones:
        bone.rotation_quaternion = Quaternion()
    lowest = min(p.z for p in positions)
    stance = [i for i, p in enumerate(positions) if p.z < lowest + 0.012]
    runs, current = [], [stance[0]]
    for i in stance[1:]:
        if i == current[-1] + 1:
            current.append(i)
        else:
            runs.append(current)
            current = [i]
    runs.append(current)
    run = max(runs, key=len)
    travel = positions[run[-1]].y - positions[run[0]].y
    seconds = (run[-1] - run[0]) / 30
    return round(travel / seconds, 3) if seconds else None


def reset_pose(armature):
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_quaternion = Quaternion()
        pose_bone.location = (0, 0, 0)
    bpy.context.view_layer.update()


def main():
    ma.reset_scene()
    builder = Builder()
    build_body(builder)
    build_head(builder)
    smooth_flags = list(builder.smooth)
    weights, sets = builder.weights, builder.sets
    material = ma.vertex_color_material("commuter-hero")
    body = ma.mesh_from_bmesh("commuter-hero-body", builder.bm, builder.colors, material)
    for polygon in body.data.polygons:
        polygon.use_smooth = smooth_flags[polygon.index]
    armature = create_armature()
    groups = {name: body.vertex_groups.new(name=name) for name, *_ in BONES}
    for index, bone_weights in weights.items():
        total = sum(bone_weights.values())
        for bone, weight in bone_weights.items():
            groups[bone].add([index], weight / total, "REPLACE")
    body.parent = armature
    modifier = body.modifiers.new("rig", "ARMATURE")
    modifier.object = armature
    add_shape_keys(body, builder)
    build_clips(armature)

    height = max(v.co.z for v in body.data.vertices)
    lowest = min(v.co.z for v in body.data.vertices)
    report = {
        "asset": "commuter-hero",
        "blender": bpy.app.version_string,
        "triangles": ma.triangle_count(body),
        "vertices": len(body.data.vertices),
        "materials": len(body.data.materials),
        "bones": [name for name, *_ in BONES],
        "boneCount": len(BONES),
        "shapeKeys": [k.name for k in body.data.shape_keys.key_blocks[1:]],
        "shapeKeyDefaults": {k.name: k.value for k in body.data.shape_keys.key_blocks[1:]},
        "clips": {name: clip_report(armature, name, frames, fn, loop) for name, frames, fn, loop in CLIPS},
        "heightMetres": round(height, 4),
        "lowestZ": round(lowest, 4),
        "walkFootSpeed": foot_speed(armature),
        "walkTargetSpeed": WALK_SPEED,
        "heightWithinTwoCentimetres": abs(height - HEIGHT) <= 0.02,
        "facing": "-Y in Blender, +Z in three.js",
    }
    os.makedirs(os.path.dirname(ARGS.out), exist_ok=True)
    ma.export_glb(ARGS.out, [armature, body], apply=False)
    report["glbBytes"] = os.path.getsize(ARGS.out)
    ma.write_report(ARGS.report, report)
    if ARGS.render:
        os.makedirs(ARGS.render, exist_ok=True)
        # Rest views: mute the clip tracks so the bind pose shows.
        for track in armature.animation_data.nla_tracks:
            track.mute = True
        reset_pose(armature)
        ma.render_views(
            ARGS.render,
            (0, 0, 0.9),
            {
                "front": ((0, -4.2, 1.0), 50),
                "three-quarter": ((2.6, -3.2, 1.2), 50),
                "side": ((4.2, 0, 1.0), 50),
            },
        )
        ma.render_views(ARGS.render, (0, -0.02, 1.57), {"face": ((0.25, -0.9, 1.6), 85)})
        # One three-quarter view per clip at mid-cycle, plus the face with each shape key.
        for name, frames, _fn, _loop in CLIPS:
            armature.animation_data.action = bpy.data.actions[name]
            bpy.context.scene.frame_set(1 + frames // 3)
            ma.render_views(ARGS.render, (0, 0, 0.95), {f"clip-{name}": ((2.6, -3.2, 1.3), 45)})
        armature.animation_data.action = None
        reset_pose(armature)
        keys = body.data.shape_keys.key_blocks
        for key in keys[1:]:
            key.value = 1.0
            ma.render_views(ARGS.render, (0, -0.02, 1.57), {f"face-{key.name}": ((0.25, -0.9, 1.6), 85)})
            key.value = 0.0
    print("REPORT", report)


main()
